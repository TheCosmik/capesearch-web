// Fetches live cape wearer counts from laby.net's public API.
// Cached at the CDN for 10 minutes so laby.net isn't hammered on every load.
//
// GET /api/cape-counts
// Returns: { migrator: 6385474, pan: 3378467, ... }

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
  'dB':                    'db',
  'Prismarine':            'prismarine',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const r = await fetch(
      'https://laby.net/api/v3/search/textures/cape?order=most_used&size=50&page=0',
      {
        headers: { 'User-Agent': 'CapeSearch/1.0' },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!r.ok) throw new Error('laby returned ' + r.status);

    const data = await r.json();
    const counts = {};

    for (const item of (data.results || [])) {
      const id = NAME_MAP[item.name];
      if (id && typeof item.use_count === 'number') {
        counts[id] = item.use_count;
      }
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json(counts);
  } catch (err) {
    // Return empty so the frontend falls back to hardcoded values
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({});
  }
};
