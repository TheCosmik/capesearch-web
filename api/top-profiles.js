// Returns the most-viewed player profiles for the current calendar month.
//
// GET /api/top-profiles?limit=8
// Reads profile-views:YYYY-MM (current month) — highest score first.
// Because the key changes each month the leaderboard resets automatically.
// Resolves player names via pname:{uuid}.
//
// Returns: { profiles: [{ uuid, name, views }], month: "May 2026" }

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

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  // ── GET recent cape caches (homepage feed) ────────────────────────────────
  // GET /api/top-profiles?action=recent-capes&limit=8
  // Returns: { changes: [{uuid, name, capeHash, ts}] }
  if (req.query.action === 'recent-capes') {
    const limit = Math.min(parseInt(req.query.limit) || 8, 20);
    if (!url || !token) return res.status(200).json({ changes: [] });
    // Fetch extra entries to allow for per-player deduplication
    const [raw] = await kvPipeline(url, token, [
      ['ZREVRANGEBYSCORE', 'recent-capes', '+inf', '-inf', 'WITHSCORES', 'LIMIT', '0', '80'],
    ]);
    const seen    = new Set();
    const changes = [];
    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length && changes.length < limit; i += 2) {
        try {
          const entry = JSON.parse(raw[i]);
          const ts    = parseInt(raw[i + 1]) || 0;
          if (!seen.has(entry.uuid)) {
            seen.add(entry.uuid);
            changes.push({ uuid: entry.uuid, name: entry.name, capeHash: entry.capeHash, ts });
          }
        } catch {}
      }
    }
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');
    return res.status(200).json({ changes });
  }

  const limit = Math.min(parseInt(req.query.limit) || 8, 20);

  if (!url || !token) return res.status(200).json({ profiles: [], month: '' });

  // Build current month key and human-readable label
  const now      = new Date();
  const monthKey = `profile-views:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  try {
    // Step 1: top UUIDs + scores for this month
    const zRes = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify([
        ['ZREVRANGE', monthKey, '0', String(limit - 1), 'WITHSCORES'],
      ]),
      signal: AbortSignal.timeout(5000),
    });
    if (!zRes.ok) return res.status(200).json({ profiles: [], month: monthLabel });

    const zData = await zRes.json();
    const flat  = Array.isArray(zData) && Array.isArray(zData[0]?.result) ? zData[0].result : [];
    // flat = [uuid, score, uuid, score, ...]
    const entries = [];
    for (let i = 0; i < flat.length; i += 2) {
      entries.push({ uuid: flat[i], views: parseInt(flat[i + 1]) || 0 });
    }
    if (!entries.length) return res.status(200).json({ profiles: [], month: monthLabel });

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
    return res.status(200).json({ profiles, month: monthLabel });
  } catch {
    return res.status(200).json({ profiles: [], month: monthLabel });
  }
};
