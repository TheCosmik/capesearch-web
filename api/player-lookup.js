// Vercel serverless function — proxies Mojang username → profile lookup.
// Called by the nav search on all pages to avoid CORS issues with
// direct browser-to-Mojang requests.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { name } = req.query;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name param required' });
  }

  try {
    // Step 1: username → UUID
    const uuidRes = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name.trim())}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (uuidRes.status === 204 || uuidRes.status === 404) {
      return res.status(404).json({ error: 'Player not found' });
    }
    if (!uuidRes.ok) {
      return res.status(uuidRes.status).json({ error: 'Mojang error' });
    }

    const { name: username, id: uuid } = await uuidRes.json();

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ name: username, uuid });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
