// Tebex webhook handler — applies/removes perks when purchases complete.
//
// Verified via HMAC-SHA256 using TEBEX_WEBHOOK_SECRET env var.
// bodyParser is disabled so we can read the raw body for signature verification.
//
// KV keys written:
//   perk-vip:{cleanUuid}      → '1' while VIP is active; deleted on cancellation
//   perk-items:{cleanUuid}    → JSON array of Tebex package IDs the player owns
//
// Supported event types:
//   payment.completed          → grant perks for purchased packages
//   payment.refunded           → revoke perks for refunded packages
//   recurring-payment.started  → grant VIP
//   recurring-payment.renewed  → keep VIP active
//   recurring-payment.ended    → revoke VIP

const crypto = require('crypto');

// ── KV helper ─────────────────────────────────────────────────────────────────
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

// ── Raw body reader (required for HMAC verification) ──────────────────────────
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk.toString(); });
    req.on('end',  () => resolve(data));
    req.on('error', reject);
  });
}

// ── UUID helpers ──────────────────────────────────────────────────────────────
// one-time purchase: UUID lives in subject.customer.username.id
function uuidFromPayment(subject) {
  const id = subject?.customer?.username?.id;
  return id ? id.replace(/-/g, '').toLowerCase() : null;
}
// recurring payment: UUID lives in subject.username.id
function uuidFromRecurring(subject) {
  const id = subject?.username?.id;
  return id ? id.replace(/-/g, '').toLowerCase() : null;
}

// ── Package classification ────────────────────────────────────────────────────
// Returns true if the package grants VIP (matched by name — update if needed).
function isVip(pkg) {
  return !!(pkg?.name?.toLowerCase().includes('vip'));
}

// ── Perk operations ───────────────────────────────────────────────────────────
async function grantPerks(cleanUuid, packages) {
  if (!cleanUuid || !packages?.length) return;

  const cmds = [];

  // VIP flag
  if (packages.some(isVip)) cmds.push(['SET', `perk-vip:${cleanUuid}`, '1']);

  // Add package IDs to player's owned-items set
  const [raw] = await kvPipeline([['GET', `perk-items:${cleanUuid}`]]);
  let items = [];
  try { items = raw ? JSON.parse(raw) : []; } catch { items = []; }
  for (const pkg of packages) {
    const pid = String(pkg.id);
    if (!items.includes(pid)) items.push(pid);
  }
  cmds.push(['SET', `perk-items:${cleanUuid}`, JSON.stringify(items)]);

  if (cmds.length) await kvPipeline(cmds);
}

async function revokeVip(cleanUuid) {
  if (!cleanUuid) return;
  await kvPipeline([['DEL', `perk-vip:${cleanUuid}`]]);
}

async function revokePerks(cleanUuid, packages) {
  if (!cleanUuid || !packages?.length) return;

  const cmds = [];

  if (packages.some(isVip)) cmds.push(['DEL', `perk-vip:${cleanUuid}`]);

  // Remove refunded IDs from owned-items set
  const [raw] = await kvPipeline([['GET', `perk-items:${cleanUuid}`]]);
  let items = [];
  try { items = raw ? JSON.parse(raw) : []; } catch { items = []; }
  const refunded = new Set(packages.map(p => String(p.id)));
  items = items.filter(id => !refunded.has(id));
  cmds.push(['SET', `perk-items:${cleanUuid}`, JSON.stringify(items)]);

  if (cmds.length) await kvPipeline(cmds);
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  console.log('tebex-webhook hit:', req.method, req.headers['x-signature'] ? 'signed' : 'unsigned');

  // Allow GET so Tebex reachability checks pass
  if (req.method === 'GET') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.TEBEX_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: 'Webhook secret not configured' });

  // Read raw body before any parsing — needed for HMAC
  const rawBody = await getRawBody(req);

  // Verify Tebex HMAC-SHA256 signature.
  // Try secret as plain string first, then as hex-decoded bytes (Tebex uses plain string).
  const signature   = req.headers['x-signature'];
  const expectedStr = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedHex = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(rawBody).digest('hex');
  const expected    = expectedStr;
  if (!signature || (signature !== expectedStr && signature !== expectedHex)) {
    console.error('Tebex signature mismatch', { received: signature, expectedStr, expectedHex });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { type, subject } = payload;
  if (!type || !subject) return res.status(400).json({ error: 'Missing type or subject' });

  try {
    switch (type) {
      case 'payment.completed': {
        const uuid = uuidFromPayment(subject);
        if (uuid) await grantPerks(uuid, subject.packages || []);
        break;
      }
      case 'payment.refunded': {
        const uuid = uuidFromPayment(subject);
        if (uuid) await revokePerks(uuid, subject.packages || []);
        break;
      }
      case 'recurring-payment.started':
      case 'recurring-payment.renewed': {
        const uuid = uuidFromRecurring(subject);
        if (uuid) await grantPerks(uuid, subject.packages || []);
        break;
      }
      case 'recurring-payment.ended': {
        const uuid = uuidFromRecurring(subject);
        if (uuid) await revokeVip(uuid);
        break;
      }
      case 'validation.webhook':
        // Tebex challenge-response — echo the id back to confirm receipt
        return res.status(200).json({ id: payload.id });
      default:
        // Unknown event — acknowledge and ignore
        break;
    }
  } catch (err) {
    console.error('Tebex webhook error:', type, err);
    return res.status(500).json({ error: 'Processing error' });
  }

  return res.status(200).json({ ok: true });
};

// Disable Vercel body parser — we need the raw bytes for HMAC verification
module.exports.config = {
  api: { bodyParser: false },
};
