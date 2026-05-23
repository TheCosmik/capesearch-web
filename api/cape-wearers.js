// Vercel serverless function — returns players known to wear a specific cape.
//
// Query params:
//   ?hash=  Mojang texture hash (the hex part after /texture/ in the URL)
//
// KV schema used:
//   cw:{hash}     — sorted set; member = UUID (no dashes), score = last-seen ms
//   pname:{uuid}  — string; player display name (plain string, not JSON-wrapped)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { hash } = req.query;
  if (!hash || !/^[0-9a-f]{32,128}$/i.test(hash)) {
    return res.status(400).json({ error: 'Valid hash query param required' });
  }

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return res.status(200).json({ wearers: [] });
  }

  try {
    // Get up to 50 UUIDs wearing this cape, most recently seen first
    const listRes = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify([['ZREVRANGE', `cw:${hash}`, 0, 49]]),
      signal:  AbortSignal.timeout(5000),
    });
    if (!listRes.ok) return res.status(200).json({ wearers: [] });

    const listData = await listRes.json();
    const uuids = Array.isArray(listData) && Array.isArray(listData[0]?.result)
      ? listData[0].result : [];

    if (uuids.length === 0) {
      return res.status(200).json({ wearers: [] });
    }

    // Fetch all display names in one pipeline call
    const nameRes = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(uuids.map(u => ['GET', `pname:${u}`])),
      signal:  AbortSignal.timeout(5000),
    });

    let wearers = uuids.map(u => ({ uuid: u, name: null }));

    if (nameRes.ok) {
      const nameData = await nameRes.json();
      if (Array.isArray(nameData)) {
        wearers = uuids.map((u, i) => ({
          uuid: u,
          // pname values are stored as plain strings (no JSON wrapping)
          name: (nameData[i] && nameData[i].result) ? String(nameData[i].result) : null,
        }));
      }
    }

    // Only include players whose name we have on record
    wearers = wearers.filter(w => w.name);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ wearers });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
