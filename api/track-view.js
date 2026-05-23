// Records a profile page view.
//
// GET /api/track-view?uuid=&name=
// Increments two sorted sets:
//   profile-views:YYYY-MM  — monthly leaderboard (auto-expires each calendar month)
//   profile-views-alltime  — permanent all-time counter
// Also refreshes pname:{uuid} with the current player name.
// Always returns 200 — callers fire-and-forget.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { uuid, name } = req.query;
  if (!uuid) return res.status(200).json({ ok: false });

  const cleanUuid = uuid.replace(/-/g, '').toLowerCase();

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(200).json({ ok: false });

  // Current month key — e.g. "profile-views:2026-05"
  const now      = new Date();
  const monthKey = `profile-views:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  try {
    const commands = [
      ['ZINCRBY', monthKey,                 '1', cleanUuid],
      ['ZINCRBY', 'profile-views-alltime',  '1', cleanUuid],
    ];
    if (name) {
      commands.push(['SET', `pname:${cleanUuid}`, name]);
    }

    await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(commands),
      signal:  AbortSignal.timeout(4000),
    });
  } catch { /* fire-and-forget, ignore errors */ }

  return res.status(200).json({ ok: true });
};
