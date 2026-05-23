// Vercel serverless function — returns a player's current skin + cape (from
// Mojang directly) and their full cape history (stored in Vercel KV).
//
// KV is optional: if KV_REST_API_URL / KV_REST_API_TOKEN env vars are not set
// (e.g. before you connect a KV store in the Vercel dashboard) the function
// still works — it just returns an empty history array.

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

async function updateCapeHistory(uuid, capeUrl) {
  const now = Date.now();
  // ZADD: if capeUrl already exists, score is updated (last_seen refreshed).
  //       If it's new, it's added. Either way — atomic, no race condition.
  const [r] = await kvPipeline([['ZADD', `cph:${uuid}`, now, capeUrl]]);
  if (r !== KV_READ_ERROR) {
    // Trim to 50 most-recently-worn capes (remove lowest scores = oldest)
    await kvPipeline([['ZREMRANGEBYRANK', `cph:${uuid}`, 0, -51]]);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

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

    // Fetch Mojang profile + KV history in parallel to keep latency low
    const [mojangRes, history] = await Promise.all([
      fetch(
        `https://sessionserver.mojang.com/session/minecraft/profile/${cleanUuid}`,
        { headers: { 'User-Agent': 'CapeSearch/1.0' }, signal: AbortSignal.timeout(8000) }
      ),
      getCapeHistory(uuid),
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

    // Update KV history in the background — doesn't block the response
    if (cape) {
      updateCapeHistory(uuid, cape).catch(() => {});
    }

    // Cache 15 s at the CDN edge; serve stale for 5 s while revalidating
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=5');
    return res.status(200).json({ skin, cape, slim, name: profile.name, history: Array.isArray(history) ? history : [] });

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
};
