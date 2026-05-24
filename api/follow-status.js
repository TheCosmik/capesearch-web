// Returns follow status and counts for a profile.
//
// GET /api/follow-status?clerkUserId=&targetUuid=
// Returns: { following: bool, followersCount: N, followingCount: N }
// followingCount is only returned when clerkUserId matches the profile owner.

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

  const { clerkUserId, targetUuid } = req.query;
  if (!targetUuid) return res.status(400).json({ error: 'targetUuid required' });

  const cleanTarget = targetUuid.replace(/-/g, '').toLowerCase();

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(200).json({ following: false, followersCount: 0 });

  const commands = [
    ['ZCARD', `followers:${cleanTarget}`],
  ];
  if (clerkUserId) {
    commands.push(['ZSCORE', `following:${clerkUserId}`, cleanTarget]);
  }

  const results = await kvPipeline(url, token, commands);
  const followersCount = parseInt(results[0]) || 0;
  const isFollowing    = clerkUserId ? results[1] !== null : false;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ following: isFollowing, followersCount });
};
