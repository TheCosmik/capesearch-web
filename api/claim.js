// Merged claim handler. Vercel rewrites /api/check-claim here.
// Profiles are claimed by verifying the account's skin (see lib/skin-claim.js).
//
// GET  /api/check-claim?uuid=   → check if a UUID has been claimed
//
// Microsoft sign-in verification (optional, dormant until configured; lib/microsoft-claim.js):
// GET  /api/claim?action=ms-config    → { enabled }  (are MS_CLIENT_ID/SECRET set?)
// POST /api/claim?action=ms-start     → { url }      (Clerk-authenticated)
//
// Skin-challenge verification (see lib/skin-claim.js), no server/plugin/Microsoft app needed:
// POST /api/claim?action=skin-start   → { image, expiresIn }  (Clerk-authenticated)
// POST /api/claim?action=skin-verify  → { status }            (Clerk-authenticated)
// GET  /api/ms-callback               → OAuth redirect target (rewritten to action=ms-callback)
// Everything lives in this file's route because Vercel's free plan allows 12 functions.

const msClaim = require('../lib/microsoft-claim');
const skinClaim = require('../lib/skin-claim');

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

  // ── Microsoft sign-in verification ────────────────────────────────────────
  const msAction = req.query && req.query.action;
  if (req.method === 'GET' && msAction === 'ms-config') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ enabled: msClaim.isConfigured() });
  }
  if (msAction === 'ms-start')    return msClaim.start(req, res, { kv: kvPipeline });
  if (msAction === 'skin-start')  return skinClaim.start(req, res, { kv: kvPipeline });
  if (msAction === 'skin-verify') return skinClaim.verify(req, res, { kv: kvPipeline });
  if (msAction === 'ms-callback') return msClaim.callback(req, res, { kv: kvPipeline });

  // ── GET /api/claim?action=rank&uuid=&secret= ──────────────────────────────
  // Used by the CapeSearchRanks Minecraft plugin to look up a player's rank.
  // Returns: { rank: 'owner' | 'betatester' | 'member' | null }
  if (req.method === 'GET' && req.query.action === 'rank') {
    const { uuid, secret } = req.query;
    const expectedSecret = process.env.PLUGIN_SECRET; // no default: it must be configured explicitly
    if (!expectedSecret || !secret || secret !== expectedSecret) {
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

  return res.status(405).end();
};
