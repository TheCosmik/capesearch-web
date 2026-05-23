// Returns the claim status for a Minecraft profile UUID.
//
// GET /api/check-claim?uuid=
// Returns: { claimed: false }
//       or { claimed: true, clerkUserId, minecraftName, claimedAt }

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { uuid } = req.query;
  if (!uuid) return res.status(400).json({ error: 'uuid required' });

  const cleanUuid = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(cleanUuid)) {
    return res.status(400).json({ error: 'Invalid UUID' });
  }

  const [stored] = await kvPipeline([['GET', `claimed:${cleanUuid}`]]);
  if (!stored) {
    return res.status(200).json({ claimed: false });
  }

  let info;
  try { info = JSON.parse(stored); } catch {
    return res.status(200).json({ claimed: false });
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');
  return res.status(200).json({
    claimed:      true,
    clerkUserId:  info.clerkUserId,
    minecraftName: info.minecraftName,
    claimedAt:    info.claimedAt,
  });
};
