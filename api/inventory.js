// Inventory API
// GET  /api/inventory?uuid={cleanUuid}         — returns owned items + equipped state
// POST /api/inventory?action=equip             — saves equipped cosmetics
//
// KV keys:
//   perk-items:{cleanUuid}     → JSON array of owned Tebex package IDs (written by tebex-webhook.js)
//   inv-equipped:{cleanUuid}   → JSON object { background: pkgId, border: pkgId, ... }

async function kvPipeline(commands) {
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return commands.map(() => null);
  try {
    const res = await fetch(`${url}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(commands),
      signal:  AbortSignal.timeout(4000),
    });
    if (!res.ok) return commands.map(() => null);
    const data = await res.json();
    return Array.isArray(data) ? data.map(d => d.result ?? null) : commands.map(() => null);
  } catch {
    return commands.map(() => null);
  }
}

async function kvGet(key) {
  const [val] = await kvPipeline([['GET', key]]);
  if (!val) return null;
  try { return JSON.parse(val); } catch { return val; }
}

async function kvSet(key, value) {
  await kvPipeline([['SET', key, JSON.stringify(value)]]);
}

// Verify Clerk session token and return userId, or null if invalid
async function getClerkUserId(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const clerkUrl = process.env.CLERK_SECRET_KEY
      ? 'https://api.clerk.com/v1/sessions/' + token + '/verify'
      : null;
    if (!clerkUrl) return null;
    const r = await fetch(clerkUrl, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.CLERK_SECRET_KEY },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.user_id || null;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  // ── GET — fetch owned items + equipped state ────────────────────────────────
  if (req.method === 'GET') {
    const uuid = (req.query.uuid || '').replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(uuid)) return res.status(400).json({ error: 'invalid uuid' });

    const [itemsRaw, equippedRaw] = await kvPipeline([
      ['GET', `perk-items:${uuid}`],
      ['GET', `inv-equipped:${uuid}`],
    ]);

    let items    = [];
    let equipped = {};
    try { items    = itemsRaw    ? JSON.parse(itemsRaw)    : []; } catch { items = []; }
    try { equipped = equippedRaw ? JSON.parse(equippedRaw) : {}; } catch { equipped = {}; }

    return res.status(200).json({ items, equipped });
  }

  // ── POST action=equip — save equipped cosmetics ────────────────────────────
  if (req.method === 'POST' && req.query.action === 'equip') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

    const uuid = ((body.uuid || '')).replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(uuid)) return res.status(400).json({ error: 'invalid uuid' });

    const equipped = body.equipped && typeof body.equipped === 'object' ? body.equipped : {};

    // Verify the caller actually owns this profile
    const clerkUserId = await getClerkUserId(req);
    if (clerkUserId) {
      const claim = await kvGet(`claimed:${uuid}`);
      if (!claim || claim.clerkUserId !== clerkUserId) {
        return res.status(403).json({ error: 'not your profile' });
      }
    }

    // Only allow equipping items the player actually owns
    const [itemsRaw] = await kvPipeline([['GET', `perk-items:${uuid}`]]);
    let owned = [];
    try { owned = itemsRaw ? JSON.parse(itemsRaw) : []; } catch { owned = []; }
    const ownedSet = new Set(owned);

    const safeEquipped = {};
    for (const [slot, pkgId] of Object.entries(equipped)) {
      if (ownedSet.has(String(pkgId))) safeEquipped[slot] = String(pkgId);
    }

    await kvSet(`inv-equipped:${uuid}`, safeEquipped);
    return res.status(200).json({ ok: true, equipped: safeEquipped });
  }

  return res.status(405).json({ error: 'method not allowed' });
};
