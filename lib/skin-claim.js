// "Verify with a skin" profile claiming - no server, plugin, or Microsoft app needed.
//
// Only the account's owner can change that account's skin, so if the skin Mojang
// currently serves for a UUID contains a pattern only we generated for this attempt,
// the person who completed the challenge controls the account.
//
//   POST /api/claim?action=skin-start   (Clerk-authenticated)
//        body { expectUuid, expectName } -> { image (data URL), expiresIn }
//        generates a 64x64 skin whose head-top face is filled with pixels derived from a
//        random 32-byte seed. Seed is stored server-side, keyed by the verified Clerk user.
//   POST /api/claim?action=skin-verify  (Clerk-authenticated)
//        reads the player's CURRENT skin straight from Mojang (never from our cache),
//        decodes it, and compares the pattern. On a match the claim is written.
//
// Safety properties:
//   * identity comes from a verified Clerk JWT, never from request fields
//   * challenge is single-use, expires in 15 min, and one active challenge per user
//   * pattern is 64 px x 24 bits derived from a CSPRNG seed - unguessable and unreusable
//   * the skin is only fetched from textures.minecraft.net and size-capped
//   * start/verify are rate-limited; nothing from Microsoft/Mojang accounts is stored

const crypto = require('crypto');
const { encodePng, decodePng } = require('./png');
const { verifyClerkJwt, writeClaim, rateLimited } = require('./microsoft-claim');

const CHALLENGE_TTL_S = 900;
const SIZE = 64;
const REGION = { x: 8, y: 0, w: 8, h: 8 };       // head top face in the skin layout
const MIN_MATCHING_PIXELS = 58;                  // of 64; tolerates a stray re-encode quirk, still ~2^-1392 to guess
const MAX_SKIN_BYTES = 200 * 1024;
const FETCH_TIMEOUT = 6000;

// Opaque UV regions of the base layer (head, body, arms, legs); the overlay layer is left transparent.
const BASE_RECTS = [
  [0, 0, 32, 16],    // head
  [16, 16, 24, 16],  // body
  [40, 16, 16, 16],  // right arm
  [0, 16, 16, 16],   // right leg
  [32, 48, 16, 16],  // left arm
  [16, 48, 16, 16],  // left leg
];

function patternPixels(seedHex) {
  const seed = Buffer.from(seedHex, 'hex');
  const out = [];
  for (let i = 0; i < REGION.w * REGION.h; i++) {
    const h = crypto.createHash('sha256').update(seed).update(Buffer.from([i])).digest();
    out.push([h[0], h[1], h[2]]);
  }
  return out;
}

function buildChallengePng(seedHex) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4); // fully transparent
  const set = (x, y, r, g, b) => { const o = (y * SIZE + x) * 4; rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255; };

  // base: dark navy fill with a subtle two-tone checker so the skin looks intentional
  for (const [rx, ry, rw, rh] of BASE_RECTS) {
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      const alt = (x + y) % 2 === 0;
      set(x, y, alt ? 20 : 26, alt ? 33 : 41, alt ? 46 : 56);
    }
  }
  // face on the head front (8,8)-(15,15): green eyes
  for (const [ex, ey] of [[10, 11], [13, 11]]) { set(ex, ey, 74, 222, 128); set(ex, ey + 1, 74, 222, 128); }

  // the verification pattern, on the head's top face
  const px = patternPixels(seedHex);
  for (let i = 0; i < px.length; i++) {
    set(REGION.x + (i % REGION.w), REGION.y + Math.floor(i / REGION.w), px[i][0], px[i][1], px[i][2]);
  }
  return encodePng(SIZE, SIZE, rgba);
}

// How many pattern pixels in a decoded skin match the challenge exactly.
function countMatches(img, seedHex) {
  if (img.width !== SIZE || img.height !== SIZE) return 0;
  const want = patternPixels(seedHex);
  let n = 0;
  for (let i = 0; i < want.length; i++) {
    const x = REGION.x + (i % REGION.w), y = REGION.y + Math.floor(i / REGION.w);
    const o = (y * SIZE + x) * 4;
    if (img.rgba[o] === want[i][0] && img.rgba[o + 1] === want[i][1] && img.rgba[o + 2] === want[i][2] && img.rgba[o + 3] === 255) n++;
  }
  return n;
}

async function fetchWithTimeout(url, opts) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
}

// Reads the CURRENT skin for a UUID from Mojang. Returns { status, name?, png? }.
async function fetchCurrentSkin(uuid) {
  let r;
  try {
    r = await fetchWithTimeout(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, { headers: { 'User-Agent': 'CapeSearch/1.0' } });
  } catch { return { status: 'mojang_error' }; }
  if (r.status === 429) return { status: 'busy' };
  if (r.status === 204 || r.status === 404) return { status: 'no_player' };
  if (!r.ok) return { status: 'mojang_error' };

  let profile, skinUrl;
  try {
    profile = await r.json();
    const prop = (profile.properties || []).find(p => p.name === 'textures');
    const tex = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'));
    skinUrl = tex.textures && tex.textures.SKIN && tex.textures.SKIN.url;
  } catch { return { status: 'no_skin', name: profile && profile.name }; }
  if (!skinUrl) return { status: 'no_skin', name: profile.name };

  let host;
  try { host = new URL(skinUrl).hostname; } catch { return { status: 'mojang_error' }; }
  if (host !== 'textures.minecraft.net') return { status: 'mojang_error' }; // never fetch arbitrary hosts

  try {
    const t = await fetchWithTimeout(skinUrl.replace(/^http:/, 'https:'));
    if (!t.ok) return { status: 'mojang_error' };
    const png = Buffer.from(await t.arrayBuffer());
    if (png.length > MAX_SKIN_BYTES) return { status: 'mojang_error' };
    return { status: 'ok', name: profile.name, png };
  } catch { return { status: 'mojang_error' }; }
}

// ── handlers ─────────────────────────────────────────────────────────────────

function begin(res) {
  res.removeHeader && res.removeHeader('Access-Control-Allow-Origin'); // same-origin only
  res.setHeader('Cache-Control', 'no-store');
}

// POST /api/claim?action=skin-start
async function start(req, res, { kv }) {
  begin(res);
  if (req.method !== 'POST') return res.status(405).end();
  if (await rateLimited(kv, req, 'skin-start', 20, 600)) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });

  const clerkUserId = await verifyClerkJwt(req.headers.authorization);
  if (!clerkUserId) return res.status(401).json({ error: 'Please sign in first.' });

  const { expectUuid, expectName } = req.body || {};
  const uuid = String(expectUuid || '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(uuid)) return res.status(400).json({ error: 'Invalid UUID' });
  if (!/^[A-Za-z0-9_]{1,16}$/.test(String(expectName || ''))) return res.status(400).json({ error: 'Invalid name' });

  const seed = crypto.randomBytes(32).toString('hex');
  // one active challenge per user: a new one replaces the previous
  await kv([['SET', `skinch:${clerkUserId}`, JSON.stringify({ uuid, name: String(expectName), seed, createdAt: Date.now() }), 'EX', String(CHALLENGE_TTL_S)]]);

  const png = buildChallengePng(seed);
  return res.status(200).json({ image: 'data:image/png;base64,' + png.toString('base64'), expiresIn: CHALLENGE_TTL_S });
}

// POST /api/claim?action=skin-verify
async function verify(req, res, { kv }) {
  begin(res);
  if (req.method !== 'POST') return res.status(405).end();
  if (await rateLimited(kv, req, 'skin-verify', 30, 600)) return res.status(429).json({ error: 'Too many checks. Please wait a few minutes.' });

  const clerkUserId = await verifyClerkJwt(req.headers.authorization);
  if (!clerkUserId) return res.status(401).json({ error: 'Please sign in first.' });
  if (await rateLimited(kv, { headers: { 'x-forwarded-for': 'u:' + clerkUserId } }, 'skin-verify-user', 12, 600)) {
    return res.status(429).json({ error: 'Too many checks. Please wait a few minutes.' });
  }

  const [raw] = await kv([['GET', `skinch:${clerkUserId}`]]);
  let ch = null;
  try { ch = raw ? JSON.parse(raw) : null; } catch { ch = null; }
  if (!ch || !ch.seed || !ch.uuid) return res.status(200).json({ status: 'expired' });

  const skin = await fetchCurrentSkin(ch.uuid);
  if (skin.status === 'busy') return res.status(200).json({ status: 'busy' });
  if (skin.status === 'no_player') return res.status(200).json({ status: 'no_player' });
  if (skin.status === 'no_skin') return res.status(200).json({ status: 'no_match' });
  if (skin.status !== 'ok') return res.status(200).json({ status: 'mojang_error' });

  let img;
  try { img = decodePng(skin.png); } catch { return res.status(200).json({ status: 'no_match' }); }

  if (countMatches(img, ch.seed) < MIN_MATCHING_PIXELS) return res.status(200).json({ status: 'no_match' });

  // Proven. Consume the challenge first so it can never be replayed, then write the claim.
  await kv([['DEL', `skinch:${clerkUserId}`]]);
  try {
    await writeClaim(kv, { clerkUserId, uuid: ch.uuid, name: skin.name || ch.name, method: 'skin' });
  } catch {
    return res.status(200).json({ status: 'mojang_error' });
  }
  return res.status(200).json({ status: 'ok', name: skin.name || ch.name });
}

module.exports = { start, verify, _internal: { buildChallengePng, countMatches, patternPixels, MIN_MATCHING_PIXELS } };
