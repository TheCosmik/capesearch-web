// "Verify with Microsoft" profile claiming.
//
// Proves a visitor owns a Minecraft: Java Edition account without any server or
// plugin: they sign in with Microsoft, we read their Minecraft profile (UUID +
// name) once, and immediately discard every token. Nothing is stored except the
// resulting claim.
//
// Flow (OAuth 2.0 authorization-code + PKCE, confidential client):
//   1. POST /api/claim?action=ms-start   (Clerk-authenticated)  -> { url }
//        browser is sent to Microsoft with a one-time `state`, PKCE challenge and a
//        matching HttpOnly cookie (binds the flow to *this* browser)
//   2. GET  /api/ms-callback?code&state   (rewritten to action=ms-callback)
//        validate state + cookie, exchange code, then
//        Microsoft token -> Xbox Live -> XSTS -> Minecraft services -> /minecraft/profile
//        compare the verified UUID to the profile the user was claiming, write the claim
//
// Required env vars (Vercel):
//   MS_CLIENT_ID      Azure app registration "Application (client) ID"
//   MS_CLIENT_SECRET  Azure app registration client secret VALUE
//   MS_REDIRECT_URI   optional, default https://capesearch.net/api/ms-callback
//                     (must exactly match a Redirect URI on the Azure app)
//
// NOTE: Mojang only lets approved Azure apps call api.minecraftservices.com; until
// the app ID is approved, step "login_with_xbox" returns 403 and users see the
// `not_approved` message. Until then the modal only offers the skin check (see skin-claim.js).

const crypto = require('crypto');

const MS_AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const STATE_TTL_S  = 600;
const COOKIE_NAME  = 'ms_oauth';
const HTTP_TIMEOUT = 6000;

// Clerk publishable key -> frontend API host -> JWT issuer + JWKS location.
const CLERK_PK = () =>
  process.env.CLERK_PUBLISHABLE_KEY || 'pk_test_c3RlYWR5LWZpbGx5LTY4LmNsZXJrLmFjY291bnRzLmRldiQ';

function cfg() {
  return {
    clientId:     process.env.MS_CLIENT_ID,
    clientSecret: process.env.MS_CLIENT_SECRET,
    redirectUri:  process.env.MS_REDIRECT_URI || 'https://capesearch.net/api/ms-callback',
  };
}

function isConfigured() {
  const c = cfg();
  return !!(c.clientId && c.clientSecret);
}

// ── small helpers ────────────────────────────────────────────────────────────

const b64url = buf => Buffer.from(buf).toString('base64url');

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

class ClaimError extends Error {
  constructor(code, detail) { super(code + (detail ? ': ' + detail : '')); this.claimCode = code; }
}

async function fetchJson(url, opts) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(HTTP_TIMEOUT) });
  let body = null;
  try { body = await r.json(); } catch { /* non-JSON body */ }
  return { ok: r.ok, status: r.status, body };
}

// ── Clerk session JWT verification (RS256 via public JWKS, no secret needed) ──

let jwksCache = { keys: null, fetchedAt: 0 };

function clerkIssuer() {
  const host = Buffer.from(CLERK_PK().split('_').slice(2).join('_'), 'base64').toString('utf8').replace(/\$$/, '');
  return 'https://' + host;
}

async function getJwks(forceRefresh) {
  if (!forceRefresh && jwksCache.keys && Date.now() - jwksCache.fetchedAt < 60 * 60 * 1000) return jwksCache.keys;
  const r = await fetchJson(clerkIssuer() + '/.well-known/jwks.json');
  if (!r.ok || !r.body || !Array.isArray(r.body.keys)) throw new Error('jwks unavailable');
  jwksCache = { keys: r.body.keys, fetchedAt: Date.now() };
  return jwksCache.keys;
}

// Returns the Clerk user id (JWT `sub`) or null. Never trusts an unverified token.
async function verifyClerkJwt(authHeader) {
  try {
    if (!authHeader || !String(authHeader).startsWith('Bearer ')) return null;
    const token = String(authHeader).slice(7);
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header  = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'RS256') return null;

    let keys = await getJwks(false);
    let jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) { keys = await getJwks(true); jwk = keys.find(k => k.kid === header.kid); }
    if (!jwk) return null;

    const ok = crypto.verify(
      'RSA-SHA256',
      Buffer.from(parts[0] + '.' + parts[1]),
      crypto.createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url')
    );
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now - 5) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > now + 30) return null;
    if (payload.iss !== clerkIssuer()) return null;
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

// ── Microsoft -> Xbox -> Minecraft chain ─────────────────────────────────────

const XSTS_ERRORS = {
  2148916233: 'no_xbox',   // account has no Xbox profile yet
  2148916235: 'region',    // Xbox Live unavailable in the account's country
  2148916236: 'age_verify',
  2148916237: 'age_verify',
  2148916238: 'child',     // under 18, must be added to a Microsoft family
};

// Exchanges the OAuth code and returns { id, name } of the account's Java profile.
// All tokens live only inside this function.
async function verifyMicrosoftAccount(code, verifier) {
  const c = cfg();

  const tok = await fetchJson(MS_AUTHORITY + '/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     c.clientId,
      client_secret: c.clientSecret,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  c.redirectUri,
      code_verifier: verifier,
    }).toString(),
  });
  if (!tok.ok || !tok.body || !tok.body.access_token) throw new ClaimError('failed', 'token exchange ' + tok.status);

  const xbl = await fetchJson('https://user.auth.xboxlive.com/user/authenticate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties:   { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + tok.body.access_token },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType:    'JWT',
    }),
  });
  if (!xbl.ok || !xbl.body || !xbl.body.Token) throw new ClaimError('failed', 'xbl ' + xbl.status);

  const xsts = await fetchJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties:   { SandboxId: 'RETAIL', UserTokens: [xbl.body.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType:    'JWT',
    }),
  });
  if (!xsts.ok) {
    throw new ClaimError(XSTS_ERRORS[xsts.body && xsts.body.XErr] || 'failed', 'xsts ' + xsts.status);
  }
  const uhs = xsts.body && xsts.body.DisplayClaims && xsts.body.DisplayClaims.xui &&
              xsts.body.DisplayClaims.xui[0] && xsts.body.DisplayClaims.xui[0].uhs;
  if (!xsts.body || !xsts.body.Token || !uhs) throw new ClaimError('failed', 'xsts body');

  const mc = await fetchJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identityToken: 'XBL3.0 x=' + uhs + ';' + xsts.body.Token }),
  });
  if (mc.status === 403) throw new ClaimError('not_approved', 'login_with_xbox 403');
  if (!mc.ok || !mc.body || !mc.body.access_token) throw new ClaimError('failed', 'login_with_xbox ' + mc.status);

  const prof = await fetchJson('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: 'Bearer ' + mc.body.access_token },
  });
  if (prof.status === 404) throw new ClaimError('no_java', 'no profile');
  if (!prof.ok || !prof.body || !prof.body.id || !prof.body.name) throw new ClaimError('failed', 'profile ' + prof.status);

  return { id: String(prof.body.id).toLowerCase(), name: String(prof.body.name) };
}

// ── claim storage (shared by every verification method) ──────────────────────

async function writeClaim(kv, { clerkUserId, uuid, name, method = 'microsoft' }) {
  const METHOD_LABEL = { microsoft: 'Microsoft', skin: 'skin challenge' }[method] || method;
  const now = Date.now();

  const [existingClaimRaw, ownAccountsRaw] = await kv([
    ['GET', `claimed:${uuid}`],
    ['GET', `user-minecraft:${clerkUserId}`],
  ]);

  let prev = null;
  try { prev = existingClaimRaw ? JSON.parse(existingClaimRaw) : null; } catch { prev = null; }
  const transferredFrom = prev && prev.clerkUserId && prev.clerkUserId !== clerkUserId ? prev.clerkUserId : null;

  let accounts = [];
  try {
    const parsed = ownAccountsRaw ? JSON.parse(ownAccountsRaw) : [];
    accounts = Array.isArray(parsed) ? parsed : [parsed];
  } catch { accounts = []; }
  accounts = accounts.filter(a => a && a.minecraftUuid !== uuid);
  accounts.push({ minecraftUuid: uuid, minecraftName: name });

  const cmds = [
    ['SET', `claimed:${uuid}`, JSON.stringify({
      clerkUserId,
      minecraftName: name,
      claimedAt: prev && !transferredFrom && prev.claimedAt ? prev.claimedAt : now,
      verifiedWith: method,
    })],
    ['SET', `user-minecraft:${clerkUserId}`, JSON.stringify(accounts)],
    ['ZADD', 'claimed-profiles', 'NX', String(now), uuid],
    ['SET', `pname:${uuid}`, name],
    ['ZADD', 'audit-log', String(now), JSON.stringify({
      ts: now, actorName: name, actorUuid: uuid, action: 'claim.' + method,
      targetName: name, targetUuid: uuid,
      detail: transferredFrom ? `Verified with ${METHOD_LABEL}; claim transferred from another account` : `Verified with ${METHOD_LABEL}`,
    })],
    ['ZREMRANGEBYRANK', 'audit-log', '0', '-501'],
  ];
  await kv(cmds);

  // Real owner proved ownership: take the profile away from whoever claimed it before.
  if (transferredFrom) {
    const [prevAccountsRaw] = await kv([['GET', `user-minecraft:${transferredFrom}`]]);
    try {
      const parsed = prevAccountsRaw ? JSON.parse(prevAccountsRaw) : [];
      const list = (Array.isArray(parsed) ? parsed : [parsed]).filter(a => a && a.minecraftUuid !== uuid);
      await kv([list.length
        ? ['SET', `user-minecraft:${transferredFrom}`, JSON.stringify(list)]
        : ['DEL', `user-minecraft:${transferredFrom}`]]);
    } catch { /* leave the old list alone if it can't be parsed */ }
  }

  // Auto-assign the Beta Tester badge while beta enrollment is open.
  const [betaEnabled] = await kv([['GET', 'beta-enabled']]);
  if (betaEnabled === '1') await kv([['SET', `role-beta:${uuid}`, '1']]);

  return { transferred: !!transferredFrom };
}

// ── HTTP handlers ────────────────────────────────────────────────────────────

function redirect(res, location) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', location);
  return res.status(302).end();
}

function profileUrl(name, params) {
  const base = /^[A-Za-z0-9_]{1,16}$/.test(name || '') ? '/profile?name=' + encodeURIComponent(name) : '/profile?';
  return base + (base.endsWith('?') ? '' : '&') + params;
}

async function rateLimited(kv, req, action, max, windowS) {
  const ip = String(req.headers['x-forwarded-for'] || '127.0.0.1').split(',')[0].trim();
  const key = `rl:${action}:${ip}`;
  const [count] = await kv([['INCR', key], ['EXPIRE', key, String(windowS), 'NX']]);
  const n = typeof count === 'number' ? count : parseInt(count, 10);
  return Number.isFinite(n) && n > max;
}

// POST /api/claim?action=ms-start   Authorization: Bearer <Clerk session token>
// Body: { expectUuid, expectName }  ->  { url }
async function start(req, res, { kv }) {
  res.removeHeader && res.removeHeader('Access-Control-Allow-Origin'); // same-origin only
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!isConfigured()) return res.status(503).json({ error: 'not_configured' });
  if (await rateLimited(kv, req, 'ms-start', 15, 600)) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });

  const clerkUserId = await verifyClerkJwt(req.headers.authorization);
  if (!clerkUserId) return res.status(401).json({ error: 'Please sign in first.' });

  const { expectUuid, expectName } = req.body || {};
  const uuid = String(expectUuid || '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(uuid)) return res.status(400).json({ error: 'Invalid UUID' });
  if (!/^[A-Za-z0-9_]{1,16}$/.test(String(expectName || ''))) return res.status(400).json({ error: 'Invalid name' });

  const c = cfg();
  const state    = b64url(crypto.randomBytes(32));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

  await kv([['SET', `msauth:${state}`, JSON.stringify({
    clerkUserId, expectUuid: uuid, expectName: String(expectName), verifier,
  }), 'EX', String(STATE_TTL_S)]]);

  // Binds this OAuth round-trip to this browser so a crafted link can't make a
  // *different* person's Microsoft login get attached to the attacker's account.
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=${STATE_TTL_S}`);

  const url = MS_AUTHORITY + '/authorize?' + new URLSearchParams({
    client_id: c.clientId, response_type: 'code', redirect_uri: c.redirectUri, response_mode: 'query',
    scope: 'XboxLive.signin', state, code_challenge: challenge, code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  return res.status(200).json({ url });
}

// GET /api/ms-callback?code=&state=   (vercel.json rewrites to ?action=ms-callback)
async function callback(req, res, { kv }) {
  res.removeHeader && res.removeHeader('Access-Control-Allow-Origin');
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0`);
  if (!isConfigured()) return redirect(res, profileUrl(null, 'claim_error=not_approved'));

  const q = req.query || {};
  const state = String(q.state || '');
  const cookieState = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!state || !cookieState || !safeEqual(state, cookieState)) {
    return redirect(res, profileUrl(null, 'claim_error=state'));
  }

  // One-time use: read and delete in the same round trip.
  const [raw] = await kv([['GET', `msauth:${state}`], ['DEL', `msauth:${state}`]]);
  let record = null;
  try { record = raw ? JSON.parse(raw) : null; } catch { record = null; }
  if (!record || !record.clerkUserId || !record.verifier) {
    return redirect(res, profileUrl(null, 'claim_error=state'));
  }
  const back = code => redirect(res, profileUrl(record.expectName, 'claim_error=' + code));

  if (q.error) return back('denied');
  if (!q.code) return back('failed');

  let verified;
  try {
    verified = await verifyMicrosoftAccount(String(q.code), record.verifier);
  } catch (e) {
    return back(e && e.claimCode ? e.claimCode : 'failed');
  }

  if (verified.id !== record.expectUuid) return back('mismatch');

  try {
    await writeClaim(kv, { clerkUserId: record.clerkUserId, uuid: verified.id, name: verified.name });
  } catch {
    return back('failed');
  }
  return redirect(res, profileUrl(verified.name, 'claim=ok'));
}

module.exports = {
  isConfigured, start, callback, verifyClerkJwt, writeClaim, rateLimited,
  _internal: { verifyMicrosoftAccount, ClaimError },
};
