// Fetches live cape wearer counts from laby.net's public API.
// Results are stored in KV so a laby.net outage or CDN cache issue
// can never freeze counts permanently — we always serve the last
// successful fetch and refresh it once it is older than REFRESH_MS.
//
// GET /api/cape-counts
// Returns: { migrator: 6385474, pan: 3378467, ... }

const REFRESH_MS  = 30 * 60 * 1000; // re-fetch from laby.net after 30 minutes
const KV_COUNTS   = 'cape-counts-data';
const KV_TS       = 'cape-counts-ts';

const NAME_MAP = {
  'Migrator':              'migrator',
  'Pan':                   'pan',
  '15th Anniversary':      'anniversary15',
  'Common':                'common',
  'Vanilla':               'vanilla',
  'Cherry Blossom':        'cherry',
  'Purple Heart':          'purpleheart',
  "Follower's":            'follower',
  'Menace':                'menace',
  'Home':                  'home',
  'Copper':                'copper',
  'Mojang Office':         'mojangoffice',
  'Yearn':                 'yearn',
  "Founder's":             'founders',
  'MCC 15th Year':         'mcc15',
  'Zombie Horse':          'zombiehorse',
  'Minecraft Experience':  'experience',
  'MineCon 2016':          'minecon16',
  'MineCon 2015':          'minecon15',
  'MineCon 2013':          'minecon13',
  'MineCon 2012':          'minecon12',
  'MineCon 2011':          'minecon11',
  'Realms Mapmaker':       'realmsmapper',
  'Mojang':                'mojang',
  'Mojang Studios':        'mojangstudios',
  'Translator':            'translator',
  'Mojira Moderator':      'mojiramod',
  'Mojang Classic':        'mojangclassic',
  'Cobalt':                'cobalt',
  'Scrolls':               'scrolls',
  'Turtle':                'turtle',
  'Translator (Chinese)':  'translatorcn',
  'Valentine':             'valentine',
  'Oxeye':                 'oxeye',
  'Birthday':              'birthday',
  'Translator (Japanese)': 'translatorjp',
  'Spade':                 'spade',
  'Snowman':               'snowman',
  'Millionth Customer':    'millionth',
  'Moonlight Trail':       'moonlighttrail',
  'dB':                    'db',
  'Prismarine':            'prismarine',
};

// ── KV helpers ────────────────────────────────────────────────────────────────
async function kvPipeline(commands) {
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return commands.map(() => null);
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

// ── Fetch from laby.net and parse counts ─────────────────────────────────────
async function fetchFromLaby() {
  const r = await fetch(
    'https://laby.net/api/v3/search/textures/cape?order=most_used&size=100&page=0',
    {
      headers: { 'User-Agent': 'CapeSearch/1.0' },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!r.ok) throw new Error('laby returned ' + r.status);

  const data = await r.json();
  const counts  = {};
  const missed  = [];
  const unmatched = [];

  for (const item of (data.results || [])) {
    const id  = NAME_MAP[item.name];
    // Try all field names laby.net has used; coerce string→number
    const raw = item.use_count ?? item.wearer_count ?? item.count ?? item.wearers;
    const n   = Number(raw);
    if (id && !isNaN(n) && n >= 0) {
      counts[id] = n;
    } else if (id) {
      missed.push({ name: item.name, id, fields: Object.keys(item), raw });
    } else {
      unmatched.push({ name: item.name, fields: Object.keys(item), raw });
    }
  }

  return { counts, missed, unmatched, total: (data.results || []).length, sample: (data.results || []).slice(0, 3) };
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Never let the CDN cache this — we manage freshness via KV ourselves
  res.setHeader('Cache-Control', 'no-store');

  // ── Read KV cache ─────────────────────────────────────────────────────────
  const [cachedRaw, cachedTs] = await kvPipeline([
    ['GET', KV_COUNTS],
    ['GET', KV_TS],
  ]);

  const ts    = cachedTs ? Number(cachedTs) : 0;
  const age   = Date.now() - ts;
  const fresh = age < REFRESH_MS && cachedRaw;

  if (fresh && req.query.debug !== 'true') {
    // KV data is recent enough — serve it immediately
    try {
      return res.status(200).json(JSON.parse(cachedRaw));
    } catch { /* fall through to laby.net */ }
  }

  // ── Fetch fresh data from laby.net ────────────────────────────────────────
  try {
    const { counts, missed, unmatched, total, sample } = await fetchFromLaby();

    if (req.query.debug === 'true') {
      const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
      return res.status(200).json({
        counts,
        missed,
        unmatched,
        total,
        sample,
        kv_age_minutes: Math.round(age / 60000),
        kv_cached: cached,
      });
    }

    // Only persist to KV if we got meaningful data (at least 5 capes matched)
    if (Object.keys(counts).length >= 5) {
      kvPipeline([
        ['SET', KV_COUNTS, JSON.stringify(counts)],
        ['SET', KV_TS,     String(Date.now())],
      ]).catch(() => {});
    }

    return res.status(200).json(counts);

  } catch (err) {
    // laby.net failed — return KV cache (however old) so the page
    // doesn't revert to hardcoded fallbacks
    if (cachedRaw) {
      try {
        if (req.query.debug === 'true') {
          return res.status(200).json({
            error: err.message,
            serving: 'stale_kv_cache',
            kv_age_minutes: Math.round(age / 60000),
            counts: JSON.parse(cachedRaw),
          });
        }
        return res.status(200).json(JSON.parse(cachedRaw));
      } catch { /* fall through */ }
    }

    // No KV cache either — return empty so frontend uses hardcoded defaults
    if (req.query.debug === 'true') {
      return res.status(200).json({ error: err.message, counts: {} });
    }
    return res.status(200).json({});
  }
};
