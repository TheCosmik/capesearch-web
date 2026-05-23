// Returns the most-viewed player profiles on the site.
//
// GET /api/top-profiles?limit=8
// Reads the profile-views sorted set (highest score first),
// resolves names via pname:{uuid}, and returns the list.
//
// Returns: { profiles: [{ uuid, name, views }] }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const limit = Math.min(parseInt(req.query.limit) || 8, 20);

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(200).json({ profiles: [] });

  try {
    // Step 1: get top UUIDs + scores from the sorted set
    const zRes = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify([
        ['ZREVRANGE', 'profile-views', '0', String(limit - 1), 'WITHSCORES'],
      ]),
      signal: AbortSignal.timeout(5000),
    });
    if (!zRes.ok) return res.status(200).json({ profiles: [] });

    const zData = await zRes.json();
    const flat  = Array.isArray(zData) && Array.isArray(zData[0]?.result) ? zData[0].result : [];
    // flat = [uuid, score, uuid, score, ...]
    const entries = [];
    for (let i = 0; i < flat.length; i += 2) {
      entries.push({ uuid: flat[i], views: parseInt(flat[i + 1]) || 0 });
    }
    if (!entries.length) return res.status(200).json({ profiles: [] });

    // Step 2: batch-fetch player names
    const nameRes = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(entries.map(e => ['GET', `pname:${e.uuid}`])),
      signal:  AbortSignal.timeout(5000),
    });
    const nameData = nameRes.ok ? await nameRes.json() : [];
    const names    = Array.isArray(nameData) ? nameData.map(d => d.result ?? null) : [];

    const profiles = entries.map((e, i) => ({
      uuid:  e.uuid,
      name:  names[i] || e.uuid.slice(0, 8),
      views: e.views,
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ profiles });
  } catch {
    return res.status(200).json({ profiles: [] });
  }
};
