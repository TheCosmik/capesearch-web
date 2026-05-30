// Vercel cron job — background cape poller + global cape count refresh.
//
// Runs daily at midnight UTC. Does two things:
//
// 1. CAPE COUNTS: Fetches the global wearer counts from laby.net and writes
//    them into KV (cape-counts-data / cape-counts-ts). This guarantees the
//    /api/cape-counts KV is always fresh, independent of site traffic.
//
// 2. PLAYER POLLING: Picks the BATCH_SIZE players whose cape data is most
//    stale (lowest last-polled score in "tracked:players") and refreshes their
//    cape history from the Mojang session server.
//
// KV schema:
//   cape-counts-data — JSON object: { migrator: N, pan: N, ... }
//   cape-counts-ts   — Unix ms timestamp of last laby.net fetch
//   tracked:players  — sorted set; member = UUID (no dashes), score = last-polled Unix ms
//                      (score 0 = never polled → highest priority)
//   cph:{uuid}       — sorted set; member = cape URL, score = last-seen Unix ms

const BATCH_SIZE    = 20;                // players per cron run
const TRACK_KEY     = 'tracked:players';
const RUN_BUDGET_MS = 8_000;            // bail before Vercel's 10 s hard limit

// ── Cape counts config ────────────────────────────────────────────────────────
const KV_COUNTS = 'cape-counts-data';
const KV_TS     = 'cape-counts-ts';
const NAME_MAP  = {
  'Migrator':'migrator','Pan':'pan','15th Anniversary':'anniversary15',
  'Common':'common','Vanilla':'vanilla','Cherry Blossom':'cherry',
  'Purple Heart':'purpleheart',"Follower's":'follower','Menace':'menace',
  'Home':'home','Copper':'copper','Mojang Office':'mojangoffice',
  'Yearn':'yearn',"Founder's":'founders','MCC 15th Year':'mcc15',
  'Zombie Horse':'zombiehorse','Minecraft Experience':'experience',
  'MineCon 2016':'minecon16','MineCon 2015':'minecon15',
  'MineCon 2013':'minecon13','MineCon 2012':'minecon12','MineCon 2011':'minecon11',
  'Realms Mapmaker':'realmsmapper','Mojang':'mojang','Mojang Studios':'mojangstudios',
  'Translator':'translator','Mojira Moderator':'mojiramod','Mojang Classic':'mojangclassic',
  'Cobalt':'cobalt','Scrolls':'scrolls','Turtle':'turtle',
  'Translator (Chinese)':'translatorcn','Valentine':'valentine','Oxeye':'oxeye',
  'Birthday':'birthday','Translator (Japanese)':'translatorjp','Spade':'spade',
  'Snowman':'snowman','Millionth Customer':'millionth','Moonlight Trail':'moonlighttrail',
  'dB':'db','Prismarine':'prismarine','Crafter':'crafter',
};

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

  // ── Step 1: Refresh global cape wearer counts from laby.net ─────────────────
  let countsUpdated = 0;
  try {
    const labyRes = await fetch(
      'https://laby.net/api/v3/search/textures/cape?order=most_used&size=100&page=0',
      { headers: { 'User-Agent': 'CapeSearch/1.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (labyRes.ok) {
      const labyData = await labyRes.json();
      const counts = {};
      for (const item of (labyData.results || [])) {
        const id  = NAME_MAP[item.name];
        const raw = item.use_count ?? item.wearer_count ?? item.count ?? item.wearers;
        const n   = Number(raw);
        if (id && !isNaN(n) && n >= 0) counts[id] = n;
      }
      if (Object.keys(counts).length >= 5) {
        await kvPipeline([
          ['SET', KV_COUNTS, JSON.stringify(counts)],
          ['SET', KV_TS,     String(Date.now())],
        ]);
        countsUpdated = Object.keys(counts).length;
      }
    }
  } catch { /* laby.net failure — skip, existing KV remains intact */ }

  // ── Step 2: Poll individual players for cape changes ─────────────────────────
  // Get the BATCH_SIZE players with the lowest scores (oldest / never polled).
  const [uuids] = await kvPipeline([['ZRANGE', TRACK_KEY, 0, BATCH_SIZE - 1]]);
  if (!Array.isArray(uuids) || uuids.length === 0) {
    return res.status(200).json({ polled: 0, countsUpdated, message: 'no tracked players yet' });
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

  return res.status(200).json({ polled, capeFound, countsUpdated, ms: Date.now() - start });
};
