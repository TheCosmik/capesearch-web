// Vercel serverless function — returns a player's current skin + cape (from
// Mojang directly) and their full cape history (stored in Vercel KV).
//
// KV is optional: if KV_REST_API_URL / KV_REST_API_TOKEN env vars are not set
// (e.g. before you connect a KV store in the Vercel dashboard) the function
// still works — it just returns an empty history array.

// ── Vercel KV helpers (Upstash REST API, no npm package needed) ───────────────
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
      signal:  AbortSignal.timeout(3000),
    });
    const data = await res.json();
    return Array.isArray(data) ? data.map(d => d.result ?? null) : commands.map(() => null);
  } catch {
    return commands.map(() => null);
  }
}

async function kvGet(key) {
  const [result] = await kvPipeline([['GET', key]]);
  if (!result) return null;
  try { return JSON.parse(result); } catch { return null; }
}

async function kvSet(key, value) {
  await kvPipeline([['SET', key, JSON.stringify(value)]]);
}

// ── Cape history helpers ───────────────────────────────────────────────────────
// Key format: ph:{uuid}  (profile history)
// Value: JSON array, newest entry first
//   [ { url, first_seen, last_seen }, … ]
// Timestamps are Unix ms (Date.now()).

async function getCapeHistory(uuid) {
  const data = await kvGet(`ph:${uuid}`);
  return Array.isArray(data) ? data : [];
}

async function updateCapeHistory(uuid, capeUrl) {
  const history = await getCapeHistory(uuid);
  const now = Date.now();

  if (history.length > 0 && history[0].url === capeUrl) {
    // Same cape — just refresh the last_seen timestamp
    history[0].last_seen = now;
  } else {
    // Cape changed (or first ever record) — prepend new entry
    history.unshift({ url: capeUrl, first_seen: now, last_seen: now });
  }

  // Keep at most 50 entries per player
  await kvSet(`ph:${uuid}`, history.slice(0, 50));
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { uuid } = req.query;
  if (!uuid) return res.status(400).json({ error: 'uuid query param required' });

  const cleanUuid = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(cleanUuid)) {
    return res.status(400).json({ error: 'Invalid UUID format' });
  }

  try {
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

    // Cache 60 s at the CDN edge; serve stale for 30 s while revalidating
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ skin, cape, slim, name: profile.name, history });

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
};
