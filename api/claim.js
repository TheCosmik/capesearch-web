// Merged claim handler — replaces check-claim.js and start-claim.js.
// Vercel rewrites route both old URLs here transparently.
//
// GET  /api/check-claim?uuid=   → check if a UUID has been claimed
// POST /api/start-claim         → generate a verification code for in-game claiming

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

// Hardcoded owner UUID (C0smik)
const OWNER_UUID = '97a449ca635d44da9e021fe62eef5bda';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── GET /api/claim?action=rank&uuid=&secret= ──────────────────────────────
  // Used by the CapeSearchRanks Minecraft plugin to look up a player's rank.
  // Returns: { rank: 'owner' | 'betatester' | 'member' | null }
  if (req.method === 'GET' && req.query.action === 'rank') {
    const { uuid, secret } = req.query;
    const expectedSecret = process.env.PLUGIN_SECRET || '123123jdsflkjsdflksdfl';
    if (!secret || secret !== expectedSecret) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!uuid) return res.status(400).json({ error: 'uuid required' });
    const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(cleanUuid)) return res.status(400).json({ error: 'Invalid UUID' });

    // Owner check (hardcoded)
    if (cleanUuid === OWNER_UUID) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ rank: 'owner' });
    }

    // KV checks: beta tester first, then claimed member
    const [betaRaw, claimRaw] = await kvPipeline([
      ['GET', `beta:${cleanUuid}`],
      ['GET', `claimed:${cleanUuid}`],
    ]);
    const rank = betaRaw ? 'betatester' : claimRaw ? 'member' : null;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ rank });
  }

  // ── GET /api/check-claim?uuid= ────────────────────────────────────────────
  if (req.method === 'GET') {
    const { uuid } = req.query;
    if (!uuid) return res.status(400).json({ error: 'uuid required' });

    const cleanUuid = uuid.replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/i.test(cleanUuid)) {
      return res.status(400).json({ error: 'Invalid UUID' });
    }

    const [stored] = await kvPipeline([['GET', `claimed:${cleanUuid}`]]);
    if (!stored) return res.status(200).json({ claimed: false });

    let info;
    try { info = JSON.parse(stored); } catch {
      return res.status(200).json({ claimed: false });
    }

    // Keep claimed-profiles index up-to-date
    kvPipeline([['ZADD', 'claimed-profiles', 'NX', String(info.claimedAt || Date.now()), cleanUuid]]).catch(() => {});

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');
    return res.status(200).json({
      claimed:       true,
      clerkUserId:   info.clerkUserId,
      minecraftName: info.minecraftName,
      claimedAt:     info.claimedAt,
    });
  }

  // ── POST /api/start-claim ─────────────────────────────────────────────────
  if (req.method === 'POST') {
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

    // Generate code and store with TTL
    const code    = genCode();
    const payload = JSON.stringify({ clerkUserId, minecraftUuid: cleanUuid, minecraftName });

    await kvPipeline([
      ['SET', `claimcode:${code}`, payload, 'EX', TTL_S],
      ['SET', userKey,              code,    'EX', TTL_S],
    ]);

    return res.status(200).json({ code, expiresIn: TTL_S });
  }

  return res.status(405).end();
};
