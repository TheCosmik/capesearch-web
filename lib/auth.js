// Server-side identity for CapeSearch API endpoints.
//
// The browser sends the user's Clerk session token as `Authorization: Bearer <token>`. We verify it
// here (RS256 signature against Clerk's public JWKS, plus issuer / expiry / not-before) and return
// the Clerk user id from the VERIFIED token. Endpoints must use this id and must never trust a
// `clerkUserId` that arrives in a request body or query string: those are trivially forged.
//
// No secret key is needed (JWKS is public) and nothing falls back to "trust the claims unverified".

const crypto = require('crypto');

const FETCH_TIMEOUT = 6000;

// Clerk publishable key -> Frontend API host -> JWT issuer + JWKS location.
const clerkPk = () =>
  process.env.CLERK_PUBLISHABLE_KEY || 'pk_test_c3RlYWR5LWZpbGx5LTY4LmNsZXJrLmFjY291bnRzLmRldiQ';

let jwksCache = { keys: null, fetchedAt: 0 };

function clerkIssuer() {
  const host = Buffer.from(clerkPk().split('_').slice(2).join('_'), 'base64').toString('utf8').replace(/\$$/, '');
  return 'https://' + host;
}

async function getJwks(forceRefresh) {
  if (!forceRefresh && jwksCache.keys && Date.now() - jwksCache.fetchedAt < 60 * 60 * 1000) return jwksCache.keys;
  const r = await fetch(clerkIssuer() + '/.well-known/jwks.json', { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  if (!r.ok || !body || !Array.isArray(body.keys)) throw new Error('jwks unavailable');
  jwksCache = { keys: body.keys, fetchedAt: Date.now() };
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

// Convenience for handlers: the verified user id of this request, or null.
async function authUser(req) {
  return verifyClerkJwt(req && req.headers ? req.headers.authorization : '');
}

function unauthorized(res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(401).json({ error: 'Please sign in.' });
}

module.exports = { verifyClerkJwt, authUser, unauthorized, clerkIssuer };
