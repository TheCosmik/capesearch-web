// Returns the Minecraft profile linked to a Clerk user account.
//
// GET /api/get-user-minecraft?clerkUserId=
// Returns: { linked: false }
//       or { linked: true, minecraftUuid, minecraftName }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { clerkUserId } = req.query;
  if (!clerkUserId) return res.status(400).json({ error: 'clerkUserId required' });

  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(200).json({ linked: false });

  try {
    const r = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify([['GET', `user-minecraft:${clerkUserId}`]]),
      signal:  AbortSignal.timeout(5000),
    });
    if (!r.ok) return res.status(200).json({ linked: false });

    const data   = await r.json();
    const stored = Array.isArray(data) && data[0] ? data[0].result : null;
    if (!stored)  return res.status(200).json({ linked: false });

    const parsed = JSON.parse(stored);
    // Normalise legacy single-object format to array
    const accounts = Array.isArray(parsed) ? parsed : [parsed];
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ linked: true, accounts });
  } catch {
    return res.status(200).json({ linked: false });
  }
};
