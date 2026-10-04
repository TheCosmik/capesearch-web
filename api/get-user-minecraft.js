// Returns the Minecraft profile linked to a Clerk user account.
//
// GET /api/get-user-minecraft   (Authorization: Bearer <Clerk session token>)
// Returns: { linked: false }
//       or { linked: true, minecraftUuid, minecraftName }

const { authUser, unauthorized } = require('../lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Identity comes from the verified token. A ?clerkUserId= in the URL is ignored, so nobody can
  // read someone else's linked Minecraft accounts by guessing or scraping an account id.
  const clerkUserId = await authUser(req);
  if (!clerkUserId) return unauthorized(res);

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
    res.setHeader('Cache-Control', 'private, no-store'); // per-user data: never shared by a CDN
    return res.status(200).json({ linked: true, accounts });
  } catch {
    return res.status(200).json({ linked: false });
  }
};
