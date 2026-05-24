// Returns the list of users who follow a Minecraft profile.
//
// GET /api/followers?uuid=&limit=50
// Returns: { followers: [{ clerkUserId, name, mcUuid }] }

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

  const { uuid } = req.query;
  if (!uuid) return res.status(400).json({ error: 'uuid required' });

  const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(200).json({ followers: [] });

  // Get Clerk user IDs who follow this profile (newest first)
  const [clerkIds] = await kvPipeline(url, token, [
    ['ZREVRANGE', `followers:${cleanUuid}`, '0', String(limit - 1)],
  ]);
  if (!Array.isArray(clerkIds) || !clerkIds.length) return res.status(200).json({ followers: [] });

  // Fetch display info for each follower
  const displayResults = await kvPipeline(url, token,
    clerkIds.map(id => ['GET', `follower-display:${cleanUuid}:${id}`])
  );

  const followers = clerkIds.map((clerkUserId, i) => {
    let name = 'Unknown', mcUuid = '';
    try {
      const parsed = displayResults[i] ? JSON.parse(displayResults[i]) : null;
      if (parsed) { name = parsed.name || name; mcUuid = parsed.mcUuid || ''; }
    } catch {}
    return { clerkUserId, name, mcUuid };
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ followers });
};
