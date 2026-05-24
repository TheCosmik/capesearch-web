// Toggles a follow relationship between a Clerk user and a Minecraft profile.
//
// POST /api/follow
// Body: { clerkUserId, targetUuid, displayName, mcUuid }
//   clerkUserId  — the logged-in user doing the follow/unfollow
//   targetUuid   — the Minecraft UUID (clean, no dashes) being followed
//   displayName  — follower's display name (for followers list on target profile)
//   mcUuid       — follower's active Minecraft UUID (for avatar, optional)
//
// KV keys:
//   following:{clerkUserId}                    ZSET  score=timestamp, member=targetUuid
//   followers:{targetUuid}                     ZSET  score=timestamp, member=clerkUserId
//   follower-display:{targetUuid}:{clerkUserId} STRING JSON {name, mcUuid}
//
// Returns: { following: bool, followersCount: number }

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { clerkUserId, targetUuid, displayName, mcUuid } = req.body || {};
  if (!clerkUserId || !targetUuid) return res.status(400).json({ error: 'clerkUserId and targetUuid required' });

  const cleanTarget = targetUuid.replace(/-/g, '').toLowerCase();

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(500).json({ error: 'KV not configured' });

  // Check if already following
  const [score] = await kvPipeline(url, token, [
    ['ZSCORE', `following:${clerkUserId}`, cleanTarget],
  ]);
  const isFollowing = score !== null;
  const now = Date.now();

  if (isFollowing) {
    // Unfollow
    await kvPipeline(url, token, [
      ['ZREM', `following:${clerkUserId}`, cleanTarget],
      ['ZREM', `followers:${cleanTarget}`, clerkUserId],
      ['DEL',  `follower-display:${cleanTarget}:${clerkUserId}`],
    ]);
  } else {
    // Follow
    const displayInfo = JSON.stringify({ name: displayName || 'Unknown', mcUuid: mcUuid || '' });
    await kvPipeline(url, token, [
      ['ZADD', `following:${clerkUserId}`, String(now), cleanTarget],
      ['ZADD', `followers:${cleanTarget}`, String(now), clerkUserId],
      ['SET',  `follower-display:${cleanTarget}:${clerkUserId}`, displayInfo],
    ]);
  }

  // Get updated follower count
  const [count] = await kvPipeline(url, token, [
    ['ZCARD', `followers:${cleanTarget}`],
  ]);

  return res.status(200).json({
    following:      !isFollowing,
    followersCount: parseInt(count) || 0,
  });
};
