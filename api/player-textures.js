// Vercel serverless function — returns a player's current skin + cape (from
// Mojang directly) and their full cape history (stored in Vercel KV).
//
// KV is optional: if KV_REST_API_URL / KV_REST_API_TOKEN env vars are not set
// (e.g. before you connect a KV store in the Vercel dashboard) the function
// still works — it just returns an empty history array.

// ── Cape texture hash → cape ID lookup (kept in sync with CAPE_HASH_DATA in profile.html) ──
const CAPE_HASH_IDS = {
  '2340c0e03dd24a11b15a8b33c2a7e9e32abb2051b2481d0ba7defd635ca7a933': 'migrator',
  '7658c5025c77cfac7574aab3af94a46a8886e3b7722a895255fbf22ab8652434': 'experience',
  '28de4a81688ad18b49e735a273e086c18f1e3966956123ccb574034c06f5d336': 'pan',
  '9e507afc56359978a3eb3e32367042b853cddd0995d17d0da995662913fb00f7': 'mojangstudios',
  '5786fe99be377dfb6858859f926c4dbc995751e91cee373468c5fbf4865e7151': 'mojang',
  'cb40a92e32b57fd732a00fc325e7afb00a7ca74936ad50d8e860152e482cfbde': 'purpleheart',
  'dbc21e222528e30dc88445314f7be6ff12d3aeebc3c192054fba7e3b3f8c77b1': 'menace',
  'cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625': 'anniversary15',
  '5ec930cdd2629c8771655c60eebeb867b4b6559b0e6d3bc71c40c96347fa03f0': 'common',
  'afd553b39358a24edfe3b8a9a939fa5fa4faa4d9a9c3d6af8eafb377fa05c2bb': 'cherry',
  'a3f6e4f14801f3ea55e3d95b9b4ef3b5e8802d947f669de93d6ec4b9354a436b': 'zombiehorse',
  '308b32a9e303155a0b4262f9e5483ad4a22e3412e84fe8385a0bdd73dc41fa89': 'yearn',
  'ca29f5dd9e94fb1748203b92e36b66fda80750c87ebc18d6eafdb0e28cc1d05f': 'translatorjp',
  '23ec737f18bfe4b547c95935fc297dd767bb84ee55bfd855144d279ac9bfd9fe': 'snowman',
  '5048ea61566353397247d2b7d946034de926b997d5e66c86483dfb1e031aee95': 'turtle',
  '70efffaf86fe5bc089608d3cb297d3e276b9eb7a8f9f2fe6659c23a2d8b18edf': 'millionth',
  'd8f8d13a1adf9636a16c31d47f3ecc9bb8d8533108aa5ad2a01b13b1a0c55eac': 'prismarine',
  'ae677f7d98ac70a533713518416df4452fe5700365c09cf45d0d156ea9396551': 'mojiramod',
  '569b7f2a1d00d26f30efe3f9ab9ac817b1e6d35f4f3cfb0324ef2d328223d350': 'follower',
  '2e002d5e1758e79ba51d08d92a0f3a95119f2f435ae7704916507b6c565a7da8': 'spade',
  '953cac8b779fe41383e675ee2b86071a71658f2180f56fbce8aa315ea70e2ed6': 'minecon11',
  'a2e8d97ec79100e90a75d369d1b3ba81273c4f82bc1b737e934eed4a854be1b6': 'minecon12',
  'b0cc08840700447322d953a02b965f1d65a13a603bf64b17c803c21446fe1635': 'minecon15',
  '153b1a0dfcbae953cdeb6f2c2bf6bf79943239b1372780da44bcbb29273131da': 'minecon13',
  'e7dfea16dc83c97df01a12fabbd1216359c0cd0ea42f9999b6e97c584963e980': 'minecon16',
  '5e6f3193e74cd16cdd6637d9bae5484e3a37ff2a14c2d157c659a07810b1bdca': 'copper',
  '1de21419009db483900da6298a1e6cbf9f1bc1523a0dcdc16263fab150693edd': 'home',
  '5c29410057e32abec02d870ecb52ec25fb45ea81e785a7854ae8429d7236ca26': 'mojangoffice',
  '56c35628fe1c4d59dd52561a3d03bfa4e1a76d397c8b9c476c2f77cb6aebb1df': 'mcc15',
  'f9a76537647989f9a0b6d001e320dac591c359e9e61a31f4ce11c88f207f0ad4': 'vanilla',
  '2262fb1d24912209490586ecae98aca8500df3eff91f2a07da37ee524e7e3cb6': 'translatorcn',
  '3efadf6510961830f9fcc077f19b4daf286d502b5f5aafbd807c7bbffcaca245': 'scrolls',
  'ca35c56efe71ed290385f4ab5346a1826b546a54d519e6a3ff01efa01acce81':  'cobalt',
  '8f120319222a9f4a104e2f5cb97b2cda93199a2ee9e1585cb8d09d6f687cb761': 'mojangclassic',
  '1bf91499701404e21bd46b0191d63239a4ef76ebde88d27e4d430ac211df681e': 'translator',
  '17912790ff164b93196f08ba71d0e62129304776d0f347334f8a6eae509f8a56': 'realmsmapper',
  '99aba02ef05ec6aa4d42db8ee43796d6cd50e4b2954ab29f0caeb85f96bf52a1': 'founders',
  '2056f2eebd759cce93460907186ef44e9192954ae12b227d817eb4b55627a7fc': 'birthday',
  'e578ef995fabcf0a94768f9651ac3aaba30c59ef85d2438e9b3e0cc1d810652b': 'valentine',
  '7706b5f5fc90329691e59277dcc66ba20572219fa8e5da472afd5235fad12cc8': 'oxeye',
  'bcfbe84c6542a4a5c213c1cacf8979b5e913dcb4ad783a8b80e3c4a7d5c8bdac': 'db',
  '479eacefa3cdd7aca94207f36c0dd449653ddf259daf40544a5866baf05eee22': 'crafter',
  '2c579968c64c1719740fd8c2a451461879b238002574fce48f7d1a7c36a1c7d4': 'builder',
};

// ── Hardcoded site owner (C0smik) — always has Owner role regardless of KV ───
const OWNER_UUID = '97a449ca635d44da9e021fe62eef5bda';

// ── Vercel KV helpers (Upstash REST API, no npm package needed) ───────────────
// Sentinel returned by kvGet when the READ itself failed (timeout / network error).
// Distinct from null (key doesn't exist) so callers can skip writes on errors.
const KV_READ_ERROR = Symbol('KV_READ_ERROR');

async function kvPipeline(commands) {
  // Support both Upstash direct integration and legacy Vercel KV env var names
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return commands.map(() => null);
  try {
    const res = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(commands),
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) return commands.map(() => KV_READ_ERROR);
    const data = await res.json();
    return Array.isArray(data) ? data.map(d => d.result ?? null) : commands.map(() => KV_READ_ERROR);
  } catch {
    return commands.map(() => KV_READ_ERROR);
  }
}

async function kvGet(key) {
  const [result] = await kvPipeline([['GET', key]]);
  if (result === KV_READ_ERROR) return KV_READ_ERROR;
  if (!result) return null;                           // key doesn't exist
  try { return JSON.parse(result); } catch { return null; }
}

async function kvSet(key, value) {
  await kvPipeline([['SET', key, JSON.stringify(value)]]);
}

// ── Role helpers ──────────────────────────────────────────────────────────────
// Returns 'owner' | 'admin' | null for a clean (no-dash) UUID.
// C0smik is always owner — no KV write needed.
async function getRole(cleanUuid) {
  if (cleanUuid === OWNER_UUID) return 'owner';
  const [stored] = await kvPipeline([['GET', `role:${cleanUuid}`]]);
  return (stored && stored !== KV_READ_ERROR) ? stored : null;
}

// Returns true if the given UUID is a Beta Tester.
async function getBeta(cleanUuid) {
  const [stored] = await kvPipeline([['GET', `role-beta:${cleanUuid}`]]);
  return stored === '1';
}

// Returns true if the given UUID has an active VIP subscription.
async function getVip(cleanUuid) {
  const [stored] = await kvPipeline([['GET', `perk-vip:${cleanUuid}`]]);
  return stored === '1';
}

// Returns true if ANY Minecraft account linked to clerkUserId has owner role.
async function isOwnerByClerkId(clerkUserId) {
  const [raw] = await kvPipeline([['GET', `user-minecraft:${clerkUserId}`]]);
  if (!raw || raw === KV_READ_ERROR) return false;
  try {
    const parsed   = JSON.parse(raw);
    const accounts = Array.isArray(parsed) ? parsed : [parsed];
    // Fast path: hardcoded owner needs no KV lookup
    if (accounts.some(a => a.minecraftUuid === OWNER_UUID)) return true;
    // Check KV roles for all linked accounts in one pipeline
    const roles = await kvPipeline(accounts.map(a => ['GET', `role:${a.minecraftUuid}`]));
    return roles.some(r => r === 'owner');
  } catch { return false; }
}

// Returns true if ANY Minecraft account linked to clerkUserId has owner or admin role.
async function isAdminOrOwnerByClerkId(clerkUserId) {
  const [raw] = await kvPipeline([['GET', `user-minecraft:${clerkUserId}`]]);
  if (!raw || raw === KV_READ_ERROR) return false;
  try {
    const parsed   = JSON.parse(raw);
    const accounts = Array.isArray(parsed) ? parsed : [parsed];
    if (accounts.some(a => a.minecraftUuid === OWNER_UUID)) return true;
    const roles = await kvPipeline(accounts.map(a => ['GET', `role:${a.minecraftUuid}`]));
    return roles.some(r => r === 'owner' || r === 'admin');
  } catch { return false; }
}

// ── Cape history helpers ───────────────────────────────────────────────────────
// Key format: cph:{uuid}  (cape profile history — sorted set)
// Type: Redis Sorted Set
//   Member: cape texture URL
//   Score:  Unix ms of most-recent wear (last_seen)
//
// Using ZADD instead of GET→modify→SET eliminates the read-modify-write
// race condition that caused rapid cape-switching to drop entries.
// ZADD atomically adds or updates the score for a member — two concurrent
// requests can never clobber each other.

async function getCapeHistory(uuid) {
  const [result] = await kvPipeline([['ZREVRANGE', `cph:${uuid}`, 0, 49]]);
  if (result === KV_READ_ERROR) return KV_READ_ERROR;

  // New sorted set has data — return it
  if (Array.isArray(result) && result.length > 0) {
    return result.map(url => ({ url, first_seen: null, last_seen: null }));
  }

  // ── Migration: check legacy ph:{uuid} key (JSON array from old format) ────
  // Old code stored history as GET/SET JSON under ph:{uuid}.  If the new
  // cph:{uuid} sorted set is empty, migrate any existing legacy data across.
  const legacy = await kvGet(`ph:${uuid}`);
  if (Array.isArray(legacy) && legacy.length > 0) {
    const now = Date.now();
    const zadd = legacy.map(entry => ['ZADD', `cph:${uuid}`, entry.last_seen || now, entry.url]);
    await kvPipeline(zadd);
    return legacy;
  }

  return [];
}

async function updateCapeHistory(uuid, capeUrl, playerName) {
  const cleanUuid = uuid.replace(/-/g, '');
  const hash = capeUrl.replace(/.*\//, '');
  const now = Date.now();

  // Check if this exact cape URL is already in this player's history.
  // Only write to the global recent-capes feed on first-time caches.
  const [existingScore] = await kvPipeline([['ZSCORE', `cph:${uuid}`, capeUrl]]);
  const isNewCape = existingScore === null;

  const capeId = CAPE_HASH_IDS[hash] || null;
  const commands = [
    ['ZADD', `cph:${uuid}`, now, capeUrl],
    ['ZREMRANGEBYRANK', `cph:${uuid}`, 0, -51],       // keep 50 per player
    ['ZADD', `cw:${hash}`, now, cleanUuid],
    ['ZREMRANGEBYRANK', `cw:${hash}`, 0, -51],         // keep 50 per cape
  ];
  if (isNewCape) {
    // Only add to the global homepage feed when this is a brand-new cape for the player
    const recentEntry = JSON.stringify({ uuid: cleanUuid, name: playerName || cleanUuid.slice(0, 8), capeHash: hash, capeId });
    commands.push(['ZADD', 'recent-capes', String(now), recentEntry]);
    commands.push(['ZREMRANGEBYRANK', 'recent-capes', '0', '-51']);   // keep global 50 most recent
  }
  if (playerName) commands.push(['SET', `pname:${cleanUuid}`, playerName]);
  await kvPipeline(commands);
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Name history proxy (laby.net — avoids CORS from the browser) ─────────
  // Called as /api/player-textures?action=names&uuid={hyphenated-uuid}
  if (req.query.action === 'names') {
    const raw = req.query.uuid || '';
    const clean = raw.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(clean)) return res.status(400).json({ error: 'invalid uuid' });
    const hUuid = clean.replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/, '$1-$2-$3-$4-$5');
    try {
      const r = await fetch(`https://laby.net/api/v3/user/${hUuid}/names`, {
        headers: { 'User-Agent': 'CapeSearch/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) return res.status(200).json([]);
      const data = await r.json();
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
      return res.status(200).json(Array.isArray(data) ? data : []);
    } catch {
      return res.status(200).json([]);
    }
  }

  // ── Profile settings GET ──────────────────────────────────────────────────
  // GET /api/player-textures?action=get-settings&uuid={uuid}
  if (req.query.action === 'get-settings') {
    const raw = req.query.uuid || '';
    const clean = raw.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(clean)) return res.status(200).json({});
    const val = await kvGet(`profile-settings:${clean}`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json((val && typeof val === 'object') ? val : {});
  }

  // ── Unclaim profile ───────────────────────────────────────────────────────
  // POST /api/player-textures?action=unclaim
  // Body: { clerkUserId, uuid }
  if (req.method === 'POST' && req.query.action === 'unclaim') {
    const { clerkUserId, uuid: unclaimUuid } = req.body || {};
    if (!clerkUserId || !unclaimUuid) return res.status(400).json({ error: 'missing fields' });
    const unclaimClean = unclaimUuid.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(unclaimClean)) return res.status(400).json({ error: 'invalid uuid' });
    const unclaimData = await kvGet(`claimed:${unclaimClean}`);
    if (!unclaimData || unclaimData.clerkUserId !== clerkUserId) {
      return res.status(403).json({ error: 'not your profile' });
    }
    // Build commands: delete the claim + remove from user's linked accounts list + remove from panel index
    const cmds = [['DEL', `claimed:${unclaimClean}`], ['ZREM', 'claimed-profiles', unclaimClean]];
    const [userMcRaw] = await kvPipeline([['GET', `user-minecraft:${clerkUserId}`]]);
    if (userMcRaw) {
      try {
        const allParsed  = JSON.parse(userMcRaw);
        const allAccounts = Array.isArray(allParsed) ? allParsed : [allParsed];
        const filtered   = allAccounts.filter(a => a.minecraftUuid !== unclaimClean);
        if (filtered.length === 0) {
          cmds.push(['DEL', `user-minecraft:${clerkUserId}`]);
        } else {
          cmds.push(['SET', `user-minecraft:${clerkUserId}`, JSON.stringify(filtered)]);
        }
      } catch {}
    }
    await kvPipeline(cmds);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // ── Get role ─────────────────────────────────────────────────────────────
  // GET /api/player-textures?action=get-role&uuid={uuid}
  if (req.query.action === 'get-role') {
    const raw = (req.query.uuid || '').replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(raw)) return res.status(400).json({ role: null });
    const role = await getRole(raw);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ role });
  }

  // ── Set role (owner only) ─────────────────────────────────────────────────
  // POST /api/player-textures?action=set-role
  // Body: { clerkUserId, targetUuid, role: 'admin' | null }
  if (req.method === 'POST' && req.query.action === 'set-role') {
    const { clerkUserId, targetUuid, role: newRole } = req.body || {};
    if (!clerkUserId || !targetUuid) return res.status(400).json({ error: 'missing fields' });
    if (!(await isOwnerByClerkId(clerkUserId))) return res.status(403).json({ error: 'Owner access required' });
    const targetClean = targetUuid.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(targetClean)) return res.status(400).json({ error: 'invalid uuid' });
    if (targetClean === OWNER_UUID) return res.status(400).json({ error: 'Cannot change owner role' });
    const allowed = ['admin'];
    if (newRole && !allowed.includes(newRole)) return res.status(400).json({ error: 'invalid role' });
    await kvPipeline(newRole
      ? [['SET', `role:${targetClean}`, newRole]]
      : [['DEL', `role:${targetClean}`]]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // ── Set VIP status (admin or owner) ──────────────────────────────────────
  // POST /api/player-textures?action=set-vip
  // Body: { clerkUserId, targetUuid, vip: true|false }
  if (req.method === 'POST' && req.query.action === 'set-vip') {
    const { clerkUserId, targetUuid, vip: newVip } = req.body || {};
    if (!clerkUserId || !targetUuid) return res.status(400).json({ error: 'missing fields' });
    if (!(await isAdminOrOwnerByClerkId(clerkUserId))) return res.status(403).json({ error: 'Admin access required' });
    const targetClean = targetUuid.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(targetClean)) return res.status(400).json({ error: 'invalid uuid' });
    await kvPipeline(newVip
      ? [['SET', `perk-vip:${targetClean}`, '1']]
      : [['DEL', `perk-vip:${targetClean}`]]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // ── Set beta tester status (owner only) ──────────────────────────────────
  // POST /api/player-textures?action=set-beta
  // Body: { clerkUserId, targetUuid, beta: true|false }
  if (req.method === 'POST' && req.query.action === 'set-beta') {
    const { clerkUserId, targetUuid, beta: newBeta } = req.body || {};
    if (!clerkUserId || !targetUuid) return res.status(400).json({ error: 'missing fields' });
    if (!(await isOwnerByClerkId(clerkUserId))) return res.status(403).json({ error: 'Owner access required' });
    const targetClean = targetUuid.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(targetClean)) return res.status(400).json({ error: 'invalid uuid' });
    await kvPipeline(newBeta
      ? [['SET', `role-beta:${targetClean}`, '1']]
      : [['DEL', `role-beta:${targetClean}`]]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // ── Get beta enrollment status ────────────────────────────────────────────
  // GET /api/player-textures?action=get-beta-enrollment
  if (req.query.action === 'get-beta-enrollment') {
    const [stored] = await kvPipeline([['GET', 'beta-enabled']]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ enabled: stored === '1' });
  }

  // ── Set beta enrollment (owner only) ─────────────────────────────────────
  // POST /api/player-textures?action=set-beta-enrollment
  // Body: { clerkUserId, enabled: true|false }
  if (req.method === 'POST' && req.query.action === 'set-beta-enrollment') {
    const { clerkUserId, enabled } = req.body || {};
    if (!clerkUserId) return res.status(400).json({ error: 'clerkUserId required' });
    if (!(await isOwnerByClerkId(clerkUserId))) return res.status(403).json({ error: 'Owner access required' });
    await kvPipeline(enabled
      ? [['SET', 'beta-enabled', '1']]
      : [['DEL', 'beta-enabled']]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // ── List claimed profiles (owner only) ────────────────────────────────────
  // GET /api/player-textures?action=list-claimed&clerkUserId={id}
  if (req.query.action === 'list-claimed') {
    const clerkUserId = req.query.clerkUserId || '';
    if (!clerkUserId) return res.status(400).json({ error: 'clerkUserId required' });
    if (!(await isOwnerByClerkId(clerkUserId))) return res.status(403).json({ error: 'Owner access required' });
    const [raw] = await kvPipeline([
      ['ZREVRANGEBYSCORE', 'claimed-profiles', '+inf', '-inf', 'WITHSCORES', 'LIMIT', '0', '200'],
    ]);
    const uuids = [];
    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length; i += 2) {
        uuids.push({ uuid: raw[i], ts: parseInt(raw[i + 1]) || 0 });
      }
    }
    if (!uuids.length) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ profiles: [] });
    }
    // Batch-fetch names, KV roles, beta flags, and VIP status in one pipeline
    const allCmds = [
      ...uuids.map(u => ['GET', `pname:${u.uuid}`]),
      ...uuids.map(u => ['GET', `role:${u.uuid}`]),
      ...uuids.map(u => ['GET', `role-beta:${u.uuid}`]),
      ...uuids.map(u => ['GET', `perk-vip:${u.uuid}`]),
    ];
    const allResults = await kvPipeline(allCmds);
    const names = allResults.slice(0, uuids.length);
    const roles = allResults.slice(uuids.length, uuids.length * 2);
    const betas = allResults.slice(uuids.length * 2, uuids.length * 3);
    const vips  = allResults.slice(uuids.length * 3);
    const profiles = uuids.map((u, i) => ({
      uuid:      u.uuid,
      name:      names[i] || u.uuid.slice(0, 8),
      role:      u.uuid === OWNER_UUID ? 'owner' : (roles[i] || null),
      beta:      betas[i] === '1',
      vip:       vips[i] === '1',
      claimedAt: u.ts,
    }));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ profiles });
  }

  // ── Profile settings SET ──────────────────────────────────────────────────
  // POST /api/player-textures?action=set-settings
  // Body: { clerkUserId, uuid, settings: { hideOldNames: bool } }
  if (req.method === 'POST' && req.query.action === 'set-settings') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    const { clerkUserId, uuid, settings } = req.body || {};
    if (!clerkUserId || !uuid || !settings) return res.status(400).json({ error: 'missing fields' });
    const clean = uuid.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(clean)) return res.status(400).json({ error: 'invalid uuid' });
    // Verify ownership
    const claim = await kvGet(`claimed:${clean}`);
    if (!claim || claim.clerkUserId !== clerkUserId) return res.status(403).json({ error: 'not your profile' });
    // Merge into existing settings so other keys (e.g. commentsEnabled) are preserved
    const existing = await kvGet(`profile-settings:${clean}`) || {};
    existing.hideOldNames = !!settings.hideOldNames;
    if (settings.socialLinks && typeof settings.socialLinks === 'object') {
      existing.socialLinks = settings.socialLinks;
    } else if (settings.socialLinks === null) {
      delete existing.socialLinks;
    }
    await kvSet(`profile-settings:${clean}`, existing);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // ── Comments: get ─────────────────────────────────────────────────────────
  // GET /api/player-textures?action=get-comments&uuid={uuid}
  if (req.query.action === 'get-comments') {
    const raw = (req.query.uuid || '').replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(raw)) return res.status(400).json({ error: 'invalid uuid' });
    const settings = await kvGet(`profile-settings:${raw}`);
    const enabled = !settings || settings.commentsEnabled !== false;
    // Always return existing comments regardless of enabled state —
    // disabling only prevents NEW comments, existing ones remain visible.
    const [members] = await kvPipeline([['ZREVRANGE', `comments:${raw}`, 0, 99]]);
    const comments = [];
    if (Array.isArray(members)) {
      for (const m of members) { try { comments.push(JSON.parse(m)); } catch {} }
    }
    // Enrich each comment with the author's current role/beta/vip
    const uniqueAuthorUuids = [...new Set(comments.map(c => c.authorUuid).filter(Boolean))];
    if (uniqueAuthorUuids.length) {
      const cmds = [];
      uniqueAuthorUuids.forEach(u => {
        cmds.push(['GET', `role:${u}`]);
        cmds.push(['GET', `role-beta:${u}`]);
        cmds.push(['GET', `perk-vip:${u}`]);
      });
      const results = await kvPipeline(cmds);
      const roleMap = {};
      uniqueAuthorUuids.forEach((u, i) => {
        const base = i * 3;
        let role = results[base];
        if (u === OWNER_UUID) role = 'owner';
        roleMap[u] = {
          authorRole: (role && role !== KV_READ_ERROR) ? role : null,
          authorBeta: results[base + 1] === '1',
          authorVip:  results[base + 2] === '1',
        };
      });
      comments.forEach(c => {
        const r = roleMap[c.authorUuid] || {};
        c.authorRole = r.authorRole || null;
        c.authorBeta = !!r.authorBeta;
        c.authorVip  = !!r.authorVip;
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ comments, enabled: true });
  }

  // ── Comments: post ────────────────────────────────────────────────────────
  // POST /api/player-textures?action=post-comment
  // Body: { clerkUserId, targetUuid, text }
  if (req.method === 'POST' && req.query.action === 'post-comment') {
    const { clerkUserId, targetUuid, text } = req.body || {};
    if (!clerkUserId || !targetUuid || !text) return res.status(400).json({ error: 'missing fields' });
    const cleanTarget = targetUuid.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(cleanTarget)) return res.status(400).json({ error: 'invalid uuid' });
    // Profile must be claimed
    const claim = await kvGet(`claimed:${cleanTarget}`);
    if (!claim) return res.status(403).json({ error: 'Profile not claimed' });
    // Comments must be enabled
    const settings = await kvGet(`profile-settings:${cleanTarget}`);
    if (settings && settings.commentsEnabled === false) return res.status(403).json({ error: 'Comments disabled' });
    // Get commenter's linked Minecraft account
    const [userMcRaw] = await kvPipeline([['GET', `user-minecraft:${clerkUserId}`]]);
    if (!userMcRaw) return res.status(403).json({ error: 'No Minecraft account linked' });
    let authorUuid, authorName;
    try {
      const parsed = JSON.parse(userMcRaw);
      const accounts = Array.isArray(parsed) ? parsed : [parsed];
      if (!accounts.length) return res.status(403).json({ error: 'No Minecraft account linked' });
      authorUuid = accounts[0].minecraftUuid;
      // Prefer the name stored on the account; fall back to pname key
      authorName = accounts[0].minecraftName || null;
      if (!authorName) {
        const [storedName] = await kvPipeline([['GET', `pname:${authorUuid}`]]);
        authorName = storedName || authorUuid.slice(0, 8);
      }
    } catch { return res.status(500).json({ error: 'Account lookup failed' }); }
    // Prevent commenting on your own profile
    if (authorUuid === cleanTarget) return res.status(403).json({ error: 'You cannot comment on your own profile.' });
    const trimmed = String(text).trim().slice(0, 500);
    if (!trimmed) return res.status(400).json({ error: 'Empty comment' });
    const now = Date.now();
    const comment = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      authorClerkId: clerkUserId,
      authorUuid,
      authorName,
      text: trimmed,
      ts: now,
    };
    await kvPipeline([
      ['ZADD', `comments:${cleanTarget}`, String(now), JSON.stringify(comment)],
      ['ZREMRANGEBYRANK', `comments:${cleanTarget}`, '0', '-101'], // keep newest 100
    ]);

    // Notify profile owner — fire and forget, don't block the response
    try {
      const ownerClaim = claim; // already fetched above
      const ownerClerkId = ownerClaim && ownerClaim.clerkUserId;
      // Don't notify if the commenter is the profile owner
      if (ownerClerkId && ownerClerkId !== clerkUserId) {
        const notif = JSON.stringify({
          type:        'new_comment',
          fromName:    authorName,
          fromMcUuid:  authorUuid,
          profileUuid: cleanTarget,
          ts:          now,
        });
        kvPipeline([
          ['ZADD',            `notifs:${ownerClerkId}`, String(now), notif],
          ['ZREMRANGEBYRANK', `notifs:${ownerClerkId}`, '0', '-51'], // keep last 50
        ]).catch(() => {});
      }
    } catch {}

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, comment });
  }

  // ── Comments: delete ──────────────────────────────────────────────────────
  // POST /api/player-textures?action=delete-comment
  // Body: { clerkUserId, targetUuid, commentId }
  if (req.method === 'POST' && req.query.action === 'delete-comment') {
    const { clerkUserId, targetUuid, commentId } = req.body || {};
    if (!clerkUserId || !targetUuid || !commentId) return res.status(400).json({ error: 'missing fields' });
    const cleanTarget = targetUuid.replace(/-/g, '').toLowerCase();
    const [members] = await kvPipeline([['ZRANGE', `comments:${cleanTarget}`, 0, -1]]);
    if (!Array.isArray(members)) return res.status(404).json({ error: 'Comment not found' });
    let toDelete = null; let parsedC = null;
    for (const m of members) {
      try { const c = JSON.parse(m); if (c.id === commentId) { toDelete = m; parsedC = c; break; } } catch {}
    }
    if (!toDelete) return res.status(404).json({ error: 'Comment not found' });
    const claim = await kvGet(`claimed:${cleanTarget}`);
    const isOwner = claim && claim.clerkUserId === clerkUserId;
    const isAuthor = parsedC.authorClerkId === clerkUserId;
    if (!isAuthor && !isOwner) return res.status(403).json({ error: 'Not authorized' });
    await kvPipeline([['ZREM', `comments:${cleanTarget}`, toDelete]]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // ── Comments: toggle enabled (profile owner only) ─────────────────────────
  // POST /api/player-textures?action=toggle-comments
  // Body: { clerkUserId, targetUuid, enabled: bool }
  if (req.method === 'POST' && req.query.action === 'toggle-comments') {
    const { clerkUserId, targetUuid, enabled } = req.body || {};
    if (!clerkUserId || !targetUuid) return res.status(400).json({ error: 'missing fields' });
    const cleanTarget = targetUuid.replace(/-/g, '').toLowerCase();
    const claim = await kvGet(`claimed:${cleanTarget}`);
    if (!claim || claim.clerkUserId !== clerkUserId) return res.status(403).json({ error: 'Not your profile' });
    const current = await kvGet(`profile-settings:${cleanTarget}`) || {};
    current.commentsEnabled = !!enabled;
    await kvSet(`profile-settings:${cleanTarget}`, current);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, commentsEnabled: !!enabled });
  }

  // ── Comment report: submit ────────────────────────────────────────────────
  // POST /api/player-textures?action=submit-report
  // Body: { clerkUserId, profileUuid, commentId, reason }
  if (req.method === 'POST' && req.query.action === 'submit-report') {
    const { clerkUserId, profileUuid, commentId, reason } = req.body || {};
    if (!clerkUserId || !profileUuid || !commentId || !reason) return res.status(400).json({ error: 'missing fields' });
    const cleanProfile = profileUuid.replace(/-/g, '').toLowerCase();
    // Get reporter's Minecraft info
    let reporterUuid = '', reporterName = 'Unknown';
    try {
      const [userMcRaw] = await kvPipeline([['GET', `user-minecraft:${clerkUserId}`]]);
      if (userMcRaw) {
        const parsed = JSON.parse(userMcRaw);
        const accounts = Array.isArray(parsed) ? parsed : [parsed];
        if (accounts[0]) { reporterUuid = accounts[0].minecraftUuid || ''; reporterName = accounts[0].minecraftName || 'Unknown'; }
      }
    } catch {}
    // Find the comment being reported
    const [members] = await kvPipeline([['ZRANGE', `comments:${cleanProfile}`, 0, -1]]);
    let targetComment = null;
    if (Array.isArray(members)) {
      for (const m of members) { try { const c = JSON.parse(m); if (c.id === commentId) { targetComment = c; break; } } catch {} }
    }
    if (!targetComment) return res.status(404).json({ error: 'Comment not found' });
    // Look up the profile owner's display name for the admin panel
    const [profileNameRaw] = await kvPipeline([['GET', `pname:${cleanProfile}`]]);
    const profileName = profileNameRaw || cleanProfile.slice(0, 8);
    const now = Date.now();
    const report = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      commentId, profileUuid: cleanProfile, profileName,
      commentAuthorUuid: targetComment.authorUuid, commentAuthorName: targetComment.authorName,
      commentText: targetComment.text,
      reporterClerkId: clerkUserId, reporterUuid, reporterName,
      reason: String(reason).trim().slice(0, 500), ts: now,
    };
    await kvPipeline([
      ['ZADD', 'reports', String(now), JSON.stringify(report)],
      ['ZREMRANGEBYRANK', 'reports', '0', '-201'],
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // ── Comment report: get list (admin/owner only) ───────────────────────────
  // GET /api/player-textures?action=get-reports&clerkUserId=
  if (req.query.action === 'get-reports') {
    const clerkUserId = req.query.clerkUserId || '';
    if (!clerkUserId) return res.status(400).json({ error: 'clerkUserId required' });
    if (!(await isAdminOrOwnerByClerkId(clerkUserId))) return res.status(403).json({ error: 'Admin access required' });
    const [members] = await kvPipeline([['ZREVRANGE', 'reports', 0, 199]]);
    const reports = [];
    if (Array.isArray(members)) { for (const m of members) { try { reports.push(JSON.parse(m)); } catch {} } }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ reports });
  }

  // ── Comment report: dismiss (admin/owner only) ────────────────────────────
  // POST /api/player-textures?action=dismiss-report
  // Body: { clerkUserId, reportId, deleteComment: bool }
  if (req.method === 'POST' && req.query.action === 'dismiss-report') {
    const { clerkUserId, reportId, deleteComment } = req.body || {};
    if (!clerkUserId || !reportId) return res.status(400).json({ error: 'missing fields' });
    if (!(await isAdminOrOwnerByClerkId(clerkUserId))) return res.status(403).json({ error: 'Admin access required' });
    const [members] = await kvPipeline([['ZRANGE', 'reports', 0, -1]]);
    let toDelete = null; let reportObj = null;
    if (Array.isArray(members)) {
      for (const m of members) { try { const r = JSON.parse(m); if (r.id === reportId) { toDelete = m; reportObj = r; break; } } catch {} }
    }
    if (!toDelete) return res.status(404).json({ error: 'Report not found' });
    const cmds = [['ZREM', 'reports', toDelete]];
    if (deleteComment && reportObj) {
      const [cmtMembers] = await kvPipeline([['ZRANGE', `comments:${reportObj.profileUuid}`, 0, -1]]);
      if (Array.isArray(cmtMembers)) {
        for (const m of cmtMembers) { try { const c = JSON.parse(m); if (c.id === reportObj.commentId) { cmds.push(['ZREM', `comments:${reportObj.profileUuid}`, m]); break; } } catch {} }
      }
    }
    await kvPipeline(cmds);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // ── TEMP: seed test inventory items for owner (remove after testing) ────────
  // GET /api/player-textures?action=seed-test-inventory
  if (req.method === 'GET' && req.query.action === 'seed-test-inventory') {
    const OWNER = '97a449ca635d44da9e021fe62eef5bda';
    await kvPipeline([
      ['SET', `perk-items:${OWNER}`, JSON.stringify(['bg-cherry-1','bg-cherry-2','bg-220234','bn-giphy123'])],
    ]);
    return res.status(200).json({ ok: true, seeded: ['bg-cherry-1','bg-cherry-2','bg-220234','bn-giphy123'] });
  }

  // ── Inventory: get owned items + equipped state ───────────────────────────
  // GET /api/player-textures?action=get-inventory&uuid={cleanUuid}
  if (req.method === 'GET' && req.query.action === 'get-inventory') {
    const raw = (req.query.uuid || '').replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(raw)) return res.status(400).json({ error: 'invalid uuid' });
    const [itemsRaw, equippedRaw] = await kvPipeline([
      ['GET', `perk-items:${raw}`],
      ['GET', `inv-equipped:${raw}`],
    ]);
    let items = []; let equipped = {};
    try { items    = itemsRaw    ? JSON.parse(itemsRaw)    : []; } catch { items = []; }
    try { equipped = equippedRaw ? JSON.parse(equippedRaw) : {}; } catch { equipped = {}; }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ items, equipped });
  }

  // ── Inventory: save equipped cosmetics ────────────────────────────────────
  // POST /api/player-textures?action=equip-inventory
  // Body: { clerkUserId, uuid, equipped: { background: pkgId, ... } }
  if (req.method === 'POST' && req.query.action === 'equip-inventory') {
    const { clerkUserId, uuid: rawUuid, equipped } = req.body || {};
    if (!clerkUserId || !rawUuid) return res.status(400).json({ error: 'missing fields' });
    const clean = rawUuid.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(clean)) return res.status(400).json({ error: 'invalid uuid' });
    const claim = await kvGet(`claimed:${clean}`);
    if (!claim || claim.clerkUserId !== clerkUserId) return res.status(403).json({ error: 'not your profile' });
    // Only allow equipping items the player actually owns
    const [itemsRaw] = await kvPipeline([['GET', `perk-items:${clean}`]]);
    let owned = [];
    try { owned = itemsRaw ? JSON.parse(itemsRaw) : []; } catch { owned = []; }
    const ownedSet = new Set(owned);
    const safeEquipped = {};
    if (equipped && typeof equipped === 'object') {
      for (const [slot, pkgId] of Object.entries(equipped)) {
        if (ownedSet.has(String(pkgId))) safeEquipped[slot] = String(pkgId);
      }
    }
    await kvSet(`inv-equipped:${clean}`, safeEquipped);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, equipped: safeEquipped });
  }

  // ── Name-only lookup mode (used by nav search on all pages) ───────────────
  // Called as /api/player-textures?name=SomePlayer
  // Returns { name, uuid } without fetching full profile or KV history.
  if (req.query.name && !req.query.uuid) {
    try {
      const r = await fetch(
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(req.query.name.trim())}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (r.status === 204 || r.status === 404) {
        return res.status(404).json({ error: 'Player not found' });
      }
      if (!r.ok) return res.status(r.status).json({ error: 'Mojang error' });
      const d = await r.json();
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
      return res.status(200).json({ name: d.name, uuid: d.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const { uuid } = req.query;
  if (!uuid) return res.status(400).json({ error: 'uuid query param required' });

  const cleanUuid = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(cleanUuid)) {
    return res.status(400).json({ error: 'Invalid UUID format' });
  }

  try {
    // Register this player for background polling if not already tracked.
    // NX = only add if the member doesn't exist (preserves existing poll schedule).
    // Score 0 = never polled → cron will prioritise them immediately.
    kvPipeline([['ZADD', 'tracked:players', 'NX', 0, cleanUuid]]).catch(() => {});

    // Fetch Mojang profile + KV history + role in parallel to keep latency low
    const [mojangRes, history, role, beta, vip] = await Promise.all([
      fetch(
        `https://sessionserver.mojang.com/session/minecraft/profile/${cleanUuid}`,
        { headers: { 'User-Agent': 'CapeSearch/1.0' }, signal: AbortSignal.timeout(8000) }
      ),
      getCapeHistory(uuid),
      getRole(cleanUuid),
      getBeta(cleanUuid),
      getVip(cleanUuid),
    ]);

    if (mojangRes.status === 204 || mojangRes.status === 404) {
      return res.status(404).json({ error: 'Player not found' });
    }
    if (mojangRes.status === 429) {
      return res.status(429).json({ error: 'Mojang rate limit — try again shortly' });
    }
    if (!mojangRes.ok) {
      return res.status(mojangRes.status).json({ error: 'Mojang API error' });
    }

    const profile = await mojangRes.json();
    const texProp = profile.properties &&
      profile.properties.find(p => p.name === 'textures');

    if (!texProp || !texProp.value) {
      return res.status(200).json({ skin: null, cape: null, slim: false, history });
    }

    const payload  = JSON.parse(Buffer.from(texProp.value, 'base64').toString('utf8'));
    const textures = payload.textures || {};

    const skin = textures.SKIN ? textures.SKIN.url : null;
    const cape = textures.CAPE ? textures.CAPE.url : null;
    const slim = !!(textures.SKIN && textures.SKIN.metadata &&
                    textures.SKIN.metadata.model === 'slim');

    // Update KV history + reverse index in the background — doesn't block the response
    if (cape) {
      updateCapeHistory(uuid, cape, profile.name).catch(() => {});
    }

    // Cache 15 s at the CDN edge; serve stale for 5 s while revalidating
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=5');
    return res.status(200).json({ skin, cape, slim, name: profile.name, history: Array.isArray(history) ? history : [], role: role || null, beta: !!beta, vip: !!vip });

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
};
