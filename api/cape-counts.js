// Vercel serverless function — fetches live wearer counts from crafty.gg
// Cached at the CDN for 10 minutes so crafty.gg isn't hammered on every page load

const CAPE_SLUGS = {
  migrator:      'migrator',
  pan:           'pan',
  anniversary15: '15th-anniversary',
  common:        'common',
  vanilla:       'vanilla',
  cherry:        'cherry',
  purpleheart:   'purple-heart',
  follower:      'followers',
  menace:        'menace',
  copper:        'copper',
  home:          'home',
  mojangoffice:  'mojang-office',
  yearn:         'yearn',
  founders:      'founders',
  // mcc15 has no known working slug on crafty.gg — falls back to hardcoded value
  zombiehorse:   'zombie-horse',
  experience:    'minecraft-experience',
  minecon16:     'minecon-2016',
  minecon13:     'minecon-2013',
  minecon15:     'minecon-2015',
  minecon12:     'minecon-2012',
  minecon11:     'minecon-2011',
  realmsmapper:  'realms-mapmaker',
  mojangstudios: 'mojang-studios',
  mojang:        'mojang',
  translator:    'translator',
  mojiramod:     'mojira-moderator',
  mojangclassic: 'mojang-classic',
  cobalt:        'cobalt',
  scrolls:       'scrolls',
  translatorcn:  'translator-chinese',
  birthday:      'birthday',
  turtle:        'turtle',
  valentine:     'valentine',
  prismarine:    'prismarine',
  oxeye:         'oxeye',
  snowman:       'snowman',
  spade:         'spade',
  db:            'db',
  translatorjp:  'translator-japanese',
  millionth:     'millionth-customer',
};

async function fetchCount(slug) {
  try {
    const res = await fetch(`https://crafty.gg/capes/${slug}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // crafty.gg renders count as e.g. "Players Using\n          6,645"
    const match = html.match(/Players\s+Using\D{0,30}?([\d,]+)/i);
    if (!match) return null;
    return parseInt(match[1].replace(/,/g, ''), 10);
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const entries = Object.entries(CAPE_SLUGS);

  const results = await Promise.all(
    entries.map(async ([id, slug]) => {
      const count = await fetchCount(slug);
      return { id, count };
    })
  );

  const counts = {};
  for (const { id, count } of results) {
    if (count !== null) counts[id] = count;
  }

  // Cache at Vercel CDN for 10 min; serve stale for 60s while revalidating
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(counts);
};
