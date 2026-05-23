// Generates a short-lived verification code so a logged-in user can claim
// a Minecraft profile by typing the code in-game.
//
// POST /api/start-claim
// Body: { clerkUserId, minecraftUuid, minecraftName }
// Returns: { code, expiresIn }
//
// KV keys written:
//   claimcode:{CODE}         → JSON payload  (EX 600 s)
//   claimbyuser:{clerkUserId} → CODE          (EX 600 s, lets us cancel old codes)

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — easy to read
const CODE_LEN   = 6;
const TTL_S      = 600; // 10 minutes

function genCode() {
  let c = '';
  for (let i = 0; i < CODE_LEN; i++) {
    c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return c;
}

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
  if (req.method !== 'POST') return res.status(405).end();

  const { clerkUserId, minecraftUuid, minecraftName } = req.body || {};
  if (!clerkUserId || !minecraftUuid || !minecraftName) {
    return res.status(400).json({ error: 'clerkUserId, minecraftUuid and minecraftName required' });
  }

  const cleanUuid = minecraftUuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(cleanUuid)) {
    return res.status(400).json({ error: 'Invalid UUID' });
  }

  // Cancel any previous code this user generated (one active code at a time)
  const userKey = `claimbyuser:${clerkUserId}`;
  const [existing] = await kvPipeline([['GET', userKey]]);
  if (existing) {
    await kvPipeline([['DEL', `claimcode:${existing}`], ['DEL', userKey]]);
  }

  // Generate code and store
  const code    = genCode();
  const payload = JSON.stringify({ clerkUserId, minecraftUuid: cleanUuid, minecraftName });

  await kvPipeline([
    ['SET', `claimcode:${code}`, payload, 'EX', TTL_S],
    ['SET', userKey,              code,    'EX', TTL_S],
  ]);

  return res.status(200).json({ code, expiresIn: TTL_S });
};
