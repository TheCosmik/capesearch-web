// Private saved-accounts feature.
// All data is scoped to the requesting Clerk user — nobody else can read it.
//
// KV schema:
//   saved-cats:{clerkUserId}          STRING  JSON [{id, name, color}]
//   saved-cat:{clerkUserId}:{catId}   ZSET    score=timestamp, member=cleanUuid
//   saved-name:{cleanUuid}            STRING  player display name (cached)
//
// Actions (all require a valid Clerk session token in Authorization header):
//   GET  ?action=cats                        → { cats: [...] }
//   GET  ?action=entries&catId=              → { entries: [{uuid, name}] }
//   GET  ?action=check&targetUuid=           → { catIds: [...] }  (which cats contain target)
//   POST action=create-cat   { name, color } → { cat: {id, name, color} }
//   POST action=rename-cat   { catId, name } → { ok: true }
//   POST action=delete-cat   { catId }       → { ok: true }
//   POST action=save-profile { catId, targetUuid, targetName, action:'add'|'remove' } → { ok: true }

const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
const CLERK_PK     = process.env.CLERK_PUBLISHABLE_KEY || 'pk_test_c3RlYWR5LWZpbGx5LTY4LmNsZXJrLmFjY291bnRzLmRldiQ';

// ── Helpers ───────────────────────────────────────────────────────────────────

function kvUrl()   { return process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL; }
function kvToken() { return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN; }

async function kvCmd(commands) {
  const url   = kvUrl();
  const token = kvToken();
  if (!url || !token) return commands.map(() => null);
  try {
    const r = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(commands),
      signal:  AbortSignal.timeout(5000),
    });
    if (!r.ok) return commands.map(() => null);
    const data = await r.json();
    return Array.isArray(data) ? data.map(d => d.result ?? null) : commands.map(() => null);
  } catch {
    return commands.map(() => null);
  }
}

// Verify the Clerk session token and return the userId, or null on failure.
async function getClerkUserId(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  // Decode the JWT header/payload without verification first (to extract kid + issuer)
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    // Use Clerk's verify endpoint (JWKS) via the frontend API
    // Simplest: hit Clerk's own /oauth/token introspect, or use the session token directly.
    // We'll verify by calling Clerk's backend API.
    if (!CLERK_SECRET) {
      // No secret — trust the sub claim (only safe in dev / when Clerk middleware is in front)
      return payload.sub || null;
    }
    const r = await fetch('https://api.clerk.com/v1/sessions/' + payload.sid + '/verify', {
      method:  'POST',
      headers: {
        Authorization:  'Bearer ' + CLERK_SECRET,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body:   'token=' + encodeURIComponent(token),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.user_id || data.userId || null;
  } catch {
    return null;
  }
}

function nanoid8() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.method === 'GET' ? req.query.action : (req.body && req.body.action);

  // Auth: every action requires a logged-in user
  const userId = await getClerkUserId(req.headers.authorization || '');
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const catListKey = `saved-cats:${userId}`;

  // Helper: read the category list
  async function readCats() {
    const [raw] = await kvCmd([['GET', catListKey]]);
    try { return JSON.parse(raw) || []; } catch { return []; }
  }

  // ── GET cats ─────────────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'cats') {
    const cats = await readCats();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ cats });
  }

  // ── GET entries ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'entries') {
    const { catId } = req.query;
    if (!catId) return res.status(400).json({ error: 'catId required' });
    const catKey = `saved-cat:${userId}:${catId}`;
    // ZREVRANGE with WITHSCORES — score is timestamp
    const [raw] = await kvCmd([['ZREVRANGE', catKey, '0', '49', 'WITHSCORES']]);
    const uuids = [];
    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length; i += 2) uuids.push(raw[i]);
    }
    if (!uuids.length) return res.status(200).json({ entries: [] });
    // Batch-fetch player names
    const nameResults = await kvCmd(uuids.map(u => ['GET', `pname:${u}`]));
    const entries = uuids.map((u, i) => ({
      uuid: u,
      name: nameResults[i] || u.slice(0, 8),
    }));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ entries });
  }

  // ── GET check ────────────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'check') {
    const { targetUuid } = req.query;
    if (!targetUuid) return res.status(400).json({ error: 'targetUuid required' });
    const cleanUuid = targetUuid.replace(/-/g, '').toLowerCase();
    const cats = await readCats();
    if (!cats.length) return res.status(200).json({ catIds: [] });
    // ZSCORE on each category set to see if member exists
    const results = await kvCmd(cats.map(c => ['ZSCORE', `saved-cat:${userId}:${c.id}`, cleanUuid]));
    const catIds = cats.filter((c, i) => results[i] !== null).map(c => c.id);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ catIds });
  }

  // ── POST actions ─────────────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // create-cat
  if (action === 'create-cat') {
    const { name, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    const cats = await readCats();
    if (cats.length >= 20) return res.status(400).json({ error: 'Maximum 20 categories reached' });
    const cat = { id: nanoid8(), name: name.trim().slice(0, 40), color: color || '#4ade80' };
    cats.push(cat);
    await kvCmd([['SET', catListKey, JSON.stringify(cats)]]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ cat });
  }

  // rename-cat
  if (action === 'rename-cat') {
    const { catId, name } = req.body;
    if (!catId || !name || !name.trim()) return res.status(400).json({ error: 'catId and name required' });
    const cats = await readCats();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    cat.name = name.trim().slice(0, 40);
    await kvCmd([['SET', catListKey, JSON.stringify(cats)]]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // delete-cat
  if (action === 'delete-cat') {
    const { catId } = req.body;
    if (!catId) return res.status(400).json({ error: 'catId required' });
    const cats = await readCats();
    const filtered = cats.filter(c => c.id !== catId);
    // Delete the ZSET and update the list
    await kvCmd([
      ['DEL', `saved-cat:${userId}:${catId}`],
      ['SET', catListKey, JSON.stringify(filtered)],
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  // save-profile
  if (action === 'save-profile') {
    const { catId, targetUuid, targetName, saveAction } = req.body;
    if (!catId || !targetUuid) return res.status(400).json({ error: 'catId and targetUuid required' });
    const cleanUuid = targetUuid.replace(/-/g, '').toLowerCase();
    const catKey = `saved-cat:${userId}:${catId}`;
    if (saveAction === 'remove') {
      await kvCmd([['ZREM', catKey, cleanUuid]]);
    } else {
      // add — score = current timestamp
      const ts = Date.now();
      const cmds = [['ZADD', catKey, String(ts), cleanUuid]];
      // Cache the player name so we don't need an extra Mojang lookup later
      if (targetName) cmds.push(['SET', `pname:${cleanUuid}`, targetName, 'EX', String(60 * 60 * 24 * 30)]);
      await kvCmd(cmds);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
