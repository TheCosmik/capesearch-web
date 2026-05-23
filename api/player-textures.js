// Vercel serverless function — proxies Mojang Session API to get a player's
// current skin + cape textures. Needed because sessionserver.mojang.com does
// not send CORS headers, so it cannot be called directly from the browser.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { uuid } = req.query;
  if (!uuid) {
    return res.status(400).json({ error: 'uuid query param required' });
  }

  // Mojang Session API requires UUID without dashes
  const cleanUuid = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(cleanUuid)) {
    return res.status(400).json({ error: 'Invalid UUID format' });
  }

  try {
    const mojangRes = await fetch(
      `https://sessionserver.mojang.com/session/minecraft/profile/${cleanUuid}`,
      {
        headers: { 'User-Agent': 'CapeSearch/1.0' },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (mojangRes.status === 204 || mojangRes.status === 404) {
      return res.status(404).json({ error: 'Player not found' });
    }
    if (mojangRes.status === 429) {
      return res.status(429).json({ error: 'Mojang rate limit hit' });
    }
    if (!mojangRes.ok) {
      return res.status(mojangRes.status).json({ error: 'Mojang API error' });
    }

    const profile = await mojangRes.json();

    // The "textures" property value is a base64-encoded JSON blob
    const texProp = profile.properties &&
      profile.properties.find(p => p.name === 'textures');

    if (!texProp || !texProp.value) {
      return res.status(200).json({ skin: null, cape: null, slim: false });
    }

    const decoded = Buffer.from(texProp.value, 'base64').toString('utf8');
    const payload = JSON.parse(decoded);
    const textures = payload.textures || {};

    const skin  = textures.SKIN  ? textures.SKIN.url  : null;
    const cape  = textures.CAPE  ? textures.CAPE.url  : null;
    const slim  = !!(textures.SKIN && textures.SKIN.metadata &&
                     textures.SKIN.metadata.model === 'slim');

    // Cache for 60 s at CDN edge; serve stale for 30 s while revalidating
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ skin, cape, slim, name: profile.name });

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
};
