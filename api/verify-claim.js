// Called by the Minecraft plugin when a player types /claim <code>.
// Verifies the code matches the player's username, then permanently links
// the Minecraft profile to the website account.
//
// POST /api/verify-claim
// Body: { code, minecraftName, secret }
// Returns: { success, chat }  — chat is the coloured in-game message to show
//
// KV keys written on success:
//   claimed:{minecraftUuid}          → { clerkUserId, minecraftName, claimedAt }
//   user-minecraft:{clerkUserId}     → { minecraftUuid, minecraftName }
// KV keys deleted on success:
//   claimcode:{code}  +  claimbyuser:{clerkUserId}

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
  if (req.method !== 'POST') return res.status(405).end();

  // Authenticate the plugin request
  const pluginSecret = process.env.CLAIM_PLUGIN_SECRET;
  const { code, minecraftName, secret } = req.body || {};

  if (!pluginSecret || secret !== pluginSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!code || !minecraftName) {
    return res.status(400).json({ error: 'code and minecraftName required' });
  }

  const normalizedCode = code.trim().toUpperCase();

  // Look up the stored claim data
  const [stored] = await kvPipeline([['GET', `claimcode:${normalizedCode}`]]);
  if (!stored) {
    return res.status(404).json({
      error: 'Code not found or expired',
      chat:  '§cThat code is invalid or has expired. Please visit the website to get a new one.',
    });
  }

  let payload;
  try { payload = JSON.parse(stored); } catch {
    return res.status(500).json({ error: 'Corrupt claim data' });
  }

  // The player typing the command must be the Minecraft account being claimed
  if (payload.minecraftName.toLowerCase() !== minecraftName.toLowerCase()) {
    return res.status(403).json({
      error: 'Username mismatch',
      chat:  `§cThis code is for §e${payload.minecraftName}§c, but you are logged in as §e${minecraftName}§c.`,
    });
  }

  const now = Date.now();

  // Permanently link the profile
  await kvPipeline([
    ['SET', `claimed:${payload.minecraftUuid}`, JSON.stringify({
      clerkUserId:   payload.clerkUserId,
      minecraftName: payload.minecraftName,
      claimedAt:     now,
    })],
    ['SET', `user-minecraft:${payload.clerkUserId}`, JSON.stringify({
      minecraftUuid: payload.minecraftUuid,
      minecraftName: payload.minecraftName,
    })],
    // Clean up the used code
    ['DEL', `claimcode:${normalizedCode}`],
    ['DEL', `claimbyuser:${payload.clerkUserId}`],
  ]);

  return res.status(200).json({
    success: true,
    minecraftName: payload.minecraftName,
    chat: `§aSuccess! §e${payload.minecraftName} §ahas been claimed and linked to your account on §bcapesearch.net§a.`,
  });
};
