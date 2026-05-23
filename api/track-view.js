// Records a unique profile page view.
//
// GET /api/track-view?uuid=&name=
//
// Dedup strategy: hash the visitor IP and use SET NX EX as a gate.
//   Monthly dedup key: vd-m:{YYYY-MM}:{ipHash}:{uuid}  — TTL = seconds until end of month
//   Alltime dedup key: vd-a:{ipHash}:{uuid}             — TTL = 365 days
// If the key already exists the visit is a duplicate and counters are NOT incremented.
// Raw IPs are never stored — only a 12-char SHA-256 prefix.
//
// Increments on a unique visit:
//   profile-views:YYYY-MM   — monthly leaderboard (auto-expires via key rotation)
//   profile-views-alltime   — permanent all-time sorted set
//   pname:{uuid}            — keeps player name current

const crypto = require('crypto');

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 12);
}

function secondsUntilMonthEnd() {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  // Add a 1-day buffer so the key doesn't expire right at midnight
  return Math.ceil((nextMonth - now) / 1000) + 86400;
}

async function kvPipeline(url, token, commands) {
  try {
    const res = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(commands),
      signal:  AbortSignal.timeout(4000),
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

  const { uuid, name } = req.query;
  if (!uuid) return res.status(200).json({ ok: false });

  const cleanUuid = uuid.replace(/-/g, '').toLowerCase();

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(200).json({ ok: false });

  // Get visitor IP (Vercel sets x-forwarded-for)
  const rawIp  = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
               || req.headers['x-real-ip']
               || req.socket?.remoteAddress
               || 'unknown';
  const ipHash = hashIp(rawIp);

  const now      = new Date();
  const monthKey = `profile-views:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const dedupM   = `vd-m:${monthKey.split(':')[1]}:${ipHash}:${cleanUuid}`;
  const dedupA   = `vd-a:${ipHash}:${cleanUuid}`;
  const monthTTL = secondsUntilMonthEnd();
  const yearTTL  = 31536000; // 365 days

  // Step 1: attempt to claim both dedup keys atomically
  const [setM, setA] = await kvPipeline(url, token, [
    ['SET', dedupM, '1', 'NX', 'EX', String(monthTTL)],
    ['SET', dedupA, '1', 'NX', 'EX', String(yearTTL)],
  ]);
  // SET NX returns "OK" if the key was newly created, null if it already existed
  const isNewMonthly  = setM === 'OK';
  const isNewAlltime  = setA === 'OK';

  if (!isNewMonthly && !isNewAlltime) {
    // Duplicate visit — nothing to do
    return res.status(200).json({ ok: true, unique: false });
  }

  // Step 2: increment whichever counters are for a new visit
  const incrCommands = [];
  if (isNewMonthly) incrCommands.push(['ZINCRBY', monthKey,                '1', cleanUuid]);
  if (isNewAlltime) incrCommands.push(['ZINCRBY', 'profile-views-alltime', '1', cleanUuid]);
  if (name)         incrCommands.push(['SET', `pname:${cleanUuid}`, name]);

  await kvPipeline(url, token, incrCommands);

  return res.status(200).json({ ok: true, unique: true });
};
