// Vercel cron job — background cape poller.
//
// Every minute Vercel calls this endpoint.  It picks the BATCH_SIZE players
// whose cape data is most stale (lowest last-polled score in the
// "tracked:players" sorted set), fetches their current cape from Mojang,
// and records anything new into their cph:{uuid} sorted set.
//
// Players are registered into "tracked:players" automatically the first time
// their profile is loaded via /api/player-textures.
//
// KV schema:
//   tracked:players  — sorted set; member = UUID (no dashes), score = last-polled Unix ms
//                      (score 0 = never polled → highest priority)
//   cph:{uuid}       — sorted set; member = cape URL, score = last-seen Unix ms

const BATCH_SIZE    = 8;                 // players per cron run
const TRACK_KEY     = 'tracked:players';
const RUN_BUDGET_MS = 8_000;            // bail before Vercel's 10 s hard limit

// ── KV helper ─────────────────────────────────────────────────────────────────
async function kvPipeline(commands) {
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return commands.map(() => null);
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

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Vercel adds Authorization: Bearer {CRON_SECRET} to cron requests.
  // If CRON_SECRET is set in env, reject anything that doesn't match.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).end();
  }

  const kvUrl   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const kvToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) {
    return res.status(200).json({ skipped: 'no KV configured' });
  }

  // Get the BATCH_SIZE players with the lowest scores (oldest / never polled).
  const [uuids] = await kvPipeline([['ZRANGE', TRACK_KEY, 0, BATCH_SIZE - 1]]);
  if (!Array.isArray(uuids) || uuids.length === 0) {
    return res.status(200).json({ polled: 0, message: 'no tracked players yet' });
  }

  const start    = Date.now();
  let   polled   = 0;
  let   capeFound = 0;

  for (const uuid of uuids) {
    // Hard deadline — stop processing before Vercel kills the function
    if (Date.now() - start > RUN_BUDGET_MS) break;

    const now = Date.now();

    // Update last-polled score immediately so a crash/timeout on this UUID
    // doesn't cause it to be retried on every single run
    await kvPipeline([['ZADD', TRACK_KEY, now, uuid]]);

    try {
      const mojangRes = await fetch(
        `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`,
        { headers: { 'User-Agent': 'CapeSearch/1.0' }, signal: AbortSignal.timeout(3000) }
      );

      if (mojangRes.ok) {
        const profile = await mojangRes.json();
        const texProp = profile.properties?.find(p => p.name === 'textures');

        if (texProp?.value) {
          const payload    = JSON.parse(Buffer.from(texProp.value, 'base64').toString('utf8'));
          const capeUrl    = payload?.textures?.CAPE?.url;
          const playerName = profile.name || null;

          if (capeUrl) {
            const hash = capeUrl.replace(/.*\//, '');
            // Single pipeline: cape history + reverse cape→wearers index + display name
            const cmds = [
              ['ZADD', `cph:${uuid}`, now, capeUrl],
              ['ZREMRANGEBYRANK', `cph:${uuid}`, 0, -51],
              ['ZADD', `cw:${hash}`, now, uuid],
              ['ZREMRANGEBYRANK', `cw:${hash}`, 0, -51],
            ];
            if (playerName) cmds.push(['SET', `pname:${uuid}`, playerName]);
            await kvPipeline(cmds);
            capeFound++;
          }
        }
      }
    } catch {
      // Network error or timeout — score already bumped, move on
    }

    polled++;

    // 300 ms breathing room between Mojang requests
    if (polled < uuids.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return res.status(200).json({ polled, capeFound, ms: Date.now() - start });
};
