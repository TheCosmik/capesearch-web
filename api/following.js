// Returns the list of Minecraft profiles a Clerk user follows.
//
// GET /api/following?clerkUserId=&limit=50
// Returns: { following: [{ uuid, name }] }

async function kvPipeline(url, token, commands) {
  try {
    const res = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(commands),
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) return commands.map(() => null);
    const data = await res.json();
    return Array.isArray(data) ? data.map(d => d.result ?? null) : commands.map(() => null);
  } catch {
    return commands.map(() => null);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { clerkUserId } = req.query;
  if (!clerkUserId) return res.status(400).json({ error: 'clerkUserId required' });

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(200).json({ following: [] });

  // Get UUIDs this user follows (newest first)
  const [uuids] = await kvPipeline(url, token, [
    ['ZREVRANGE', `following:${clerkUserId}`, '0', String(limit - 1)],
  ]);
  if (!Array.isArray(uuids) || !uuids.length) return res.status(200).json({ following: [] });

  // Resolve names
  const names = await kvPipeline(url, token, uuids.map(u => ['GET', `pname:${u}`]));

  const following = uuids.map((uuid, i) => ({
    uuid,
    name: names[i] || uuid.slice(0, 8),
  }));

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ following });
};
