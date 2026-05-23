// Returns all-time profile view stats for a single player.
//
// GET /api/profile-stats?uuid=
// Returns: { views: N }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { uuid } = req.query;
  if (!uuid) return res.status(400).json({ error: 'uuid required' });

  const cleanUuid = uuid.replace(/-/g, '').toLowerCase();

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(200).json({ views: 0 });

  try {
    const r = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify([
        ['ZSCORE', 'profile-views-alltime', cleanUuid],
      ]),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return res.status(200).json({ views: 0 });

    const data  = await r.json();
    const score = Array.isArray(data) && data[0]?.result ? parseInt(data[0].result) : 0;

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=15');
    return res.status(200).json({ views: score || 0 });
  } catch {
    return res.status(200).json({ views: 0 });
  }
};
