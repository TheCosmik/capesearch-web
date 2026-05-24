// Unified follow API — all follow endpoints in one file (Vercel Hobby = 12 fn limit).
//
// POST /api/follow
//   Body: { clerkUserId, targetUuid, displayName, mcUuid }
//   Returns: { following: bool, followersCount: number }
//
// GET /api/follow?action=status&targetUuid=&clerkUserId=
//   Returns: { following: bool, followersCount: N }
//
// GET /api/follow?action=following&clerkUserId=&limit=50
//   Returns: { following: [{uuid, name}] }
//
// GET /api/follow?action=followers&uuid=&limit=50
//   Returns: { followers: [{clerkUserId, name, mcUuid}] }
//
// GET /api/follow?action=notifications&clerkUserId=
//   Returns: { notifications: [{type,fromName,fromMcUuid,profileUuid,ts,seen}], unseenCount: N }
//
// GET /api/follow?action=mark-seen&clerkUserId=
//   Marks all notifications as seen. Returns: { ok: true }
//
// KV keys:
//   following:{clerkUserId}                     ZSET  score=ts, member=targetUuid
//   followers:{targetUuid}                      ZSET  score=ts, member=clerkUserId
//   follower-display:{targetUuid}:{clerkUserId} STRING JSON {name, mcUuid}
//   notifs:{clerkUserId}                        ZSET  score=ts, member=JSON notif (last 50)
//   notifs-seen:{clerkUserId}                   STRING last-seen timestamp

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  // ── POST — toggle follow ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { clerkUserId, targetUuid, displayName, mcUuid } = req.body || {};
    if (!clerkUserId || !targetUuid) return res.status(400).json({ error: 'clerkUserId and targetUuid required' });
    if (!url || !token) return res.status(500).json({ error: 'KV not configured' });

    const cleanTarget = targetUuid.replace(/-/g, '').toLowerCase();
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

      // Create notification for profile owner (fire-and-forget, don't block response)
      try {
        const [claimRaw] = await kvPipeline(url, token, [['GET', `claimed:${cleanTarget}`]]);
        if (claimRaw) {
          const claim = JSON.parse(claimRaw);
          const ownerClerkId = claim && claim.clerkUserId;
          // Don't notify if following your own claimed profile
          if (ownerClerkId && ownerClerkId !== clerkUserId) {
            const notif = JSON.stringify({
              type:       'new_follower',
              fromName:   displayName || 'Unknown',
              fromMcUuid: mcUuid || '',
              profileUuid: cleanTarget,
              ts:         now,
            });
            await kvPipeline(url, token, [
              ['ZADD',             `notifs:${ownerClerkId}`, String(now), notif],
              ['ZREMRANGEBYRANK',  `notifs:${ownerClerkId}`, '0', '-51'],  // keep last 50
            ]);
          }
        }
      } catch {}
    }

    const [count] = await kvPipeline(url, token, [['ZCARD', `followers:${cleanTarget}`]]);
    return res.status(200).json({ following: !isFollowing, followersCount: parseInt(count) || 0 });
  }

  // ── GET — route by action param ────────────────────────────────────────────
  if (req.method !== 'GET') return res.status(405).end();

  const { action } = req.query;

  // action=status
  if (action === 'status') {
    const { clerkUserId, targetUuid } = req.query;
    if (!targetUuid) return res.status(400).json({ error: 'targetUuid required' });
    const cleanTarget = targetUuid.replace(/-/g, '').toLowerCase();
    if (!url || !token) return res.status(200).json({ following: false, followersCount: 0 });

    const commands = [['ZCARD', `followers:${cleanTarget}`]];
    if (clerkUserId) commands.push(['ZSCORE', `following:${clerkUserId}`, cleanTarget]);

    const results = await kvPipeline(url, token, commands);
    const followersCount = parseInt(results[0]) || 0;
    const isFollowing    = clerkUserId ? results[1] !== null : false;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ following: isFollowing, followersCount });
  }

  // action=following
  if (action === 'following') {
    const { clerkUserId } = req.query;
    if (!clerkUserId) return res.status(400).json({ error: 'clerkUserId required' });
    if (!url || !token) return res.status(200).json({ following: [] });

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const [uuids] = await kvPipeline(url, token, [
      ['ZREVRANGE', `following:${clerkUserId}`, '0', String(limit - 1)],
    ]);
    if (!Array.isArray(uuids) || !uuids.length) return res.status(200).json({ following: [] });

    const names = await kvPipeline(url, token, uuids.map(u => ['GET', `pname:${u}`]));
    const following = uuids.map((uuid, i) => ({ uuid, name: names[i] || uuid.slice(0, 8) }));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ following });
  }

  // action=followers
  if (action === 'followers') {
    const { uuid } = req.query;
    if (!uuid) return res.status(400).json({ error: 'uuid required' });
    if (!url || !token) return res.status(200).json({ followers: [] });

    const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const [clerkIds] = await kvPipeline(url, token, [
      ['ZREVRANGE', `followers:${cleanUuid}`, '0', String(limit - 1)],
    ]);
    if (!Array.isArray(clerkIds) || !clerkIds.length) return res.status(200).json({ followers: [] });

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
  }

  // action=notifications
  if (action === 'notifications') {
    const { clerkUserId } = req.query;
    if (!clerkUserId) return res.status(400).json({ error: 'clerkUserId required' });
    if (!url || !token) return res.status(200).json({ notifications: [], unseenCount: 0 });

    const [members, seenRaw] = await kvPipeline(url, token, [
      ['ZREVRANGE', `notifs:${clerkUserId}`, '0', '19'],
      ['GET',       `notifs-seen:${clerkUserId}`],
    ]);
    const seenTs = parseInt(seenRaw) || 0;
    const notifications = [];
    let unseenCount = 0;

    if (Array.isArray(members)) {
      for (const m of members) {
        try {
          const n = JSON.parse(m);
          const seen = n.ts <= seenTs;
          if (!seen) unseenCount++;
          notifications.push({ ...n, seen });
        } catch {}
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ notifications, unseenCount });
  }

  // action=mark-seen
  if (action === 'mark-seen') {
    const { clerkUserId } = req.query;
    if (!clerkUserId) return res.status(400).json({ error: 'clerkUserId required' });
    if (url && token) {
      await kvPipeline(url, token, [
        ['SET', `notifs-seen:${clerkUserId}`, String(Date.now())],
      ]);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'invalid action' });
};
