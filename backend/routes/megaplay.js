/*
  Zentrix — MegaPlay Backend Proxy  v2.0
  ──────────────────────────────────────────────────────────────────
  Resolves the correct megaplay.buzz stream URL for anime episodes.

  URL FORMAT REFERENCE (confirmed working):
    ✅  /stream/ani/{anilistId}/{ep}/{lang}   — direct AniList ID
    ✅  /stream/s-2/{hianimeEpisodeId}/{lang} — HiAnime/Anikoto episode ID
    ❌  /stream/mal/{malId}/{ep}/{lang}       — 410 Gone, never use

  Resolution strategy (in order):
    1. Try HEAD on /stream/ani/{anilistId}/{ep}/{lang}
    2. If not OK → call Anikoto /series/{anilistId} (direct, returns episodes)
       → build /stream/s-2/{episodeId}/{lang}
    3. If Anikoto /series/ fails → try legacy two-step Anikoto lookup
    4. If all Anikoto attempts fail → return /stream/ani/ anyway (let client try)

  Routes:
    GET /api/megaplay/stream   ?anilistId=&episode=&lang=
    GET /api/megaplay/health
*/

const express = require('express');
const router  = express.Router();

const MEGAPLAY_BASE   = 'https://megaplay.buzz';
const ANIKOTO_BASE    = 'https://anikotoapi.site';
const PROXY_TIMEOUT   = 8000; // ms

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BROWSER_HEADERS = {
  'User-Agent': BROWSER_UA,
  'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer':    MEGAPLAY_BASE + '/',
};

const JSON_HEADERS = {
  'User-Agent': BROWSER_UA,
  'Accept':     'application/json',
};

function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}

// ── Verify a megaplay URL via HEAD ─────────────────────────────────
async function verifyMegaplayUrl(url) {
  try {
    const res = await fetch(url, {
      method:   'HEAD',
      headers:  BROWSER_HEADERS,
      redirect: 'follow',
      signal:   timeoutSignal(PROXY_TIMEOUT),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

// ── Anikoto Strategy 1: /series/{anilistId} ────────────────────────
// This endpoint returns the series object which includes its episode list.
// Episode objects have an `id` field that is the HiAnime episode ID used
// in the /stream/s-2/{id}/{lang} megaplay format.
async function resolveViaAnikotoSeries(anilistId, episodeNum) {
  try {
    const url = `${ANIKOTO_BASE}/series/${anilistId}`;
    const res = await fetch(url, {
      headers: JSON_HEADERS,
      signal:  timeoutSignal(PROXY_TIMEOUT),
    });

    if (!res.ok) return null;

    const data = await res.json();

    // The episodes array may be at data.episodes or data directly
    const episodes =
      Array.isArray(data?.episodes) ? data.episodes :
      Array.isArray(data?.data?.episodes) ? data.data.episodes :
      null;

    if (!episodes || episodes.length === 0) return null;

    // Episodes are 1-indexed; find by number field or by array position
    const ep =
      episodes.find(e => e.number === episodeNum || e.episode === episodeNum) ||
      episodes[episodeNum - 1];

    if (!ep) return null;

    const epId = ep.id ?? ep.episodeId ?? ep.episode_id ?? ep.hianimeId;
    return epId ? String(epId) : null;

  } catch {
    return null;
  }
}

// ── Anikoto Strategy 2: two-step (series search + episode fetch) ───
// Fallback for when the /series/{anilistId} endpoint doesn't return episodes
// directly. Tries several endpoint patterns to find the internal series ID,
// then fetches its episode list separately.
async function resolveViaAnikotoLegacy(anilistId, episodeNum) {
  // Step A: find internal series ID
  const searchAttempts = [
    `${ANIKOTO_BASE}/anime/anilist/${anilistId}`,
    `${ANIKOTO_BASE}/anime?anilistId=${anilistId}`,
    `${ANIKOTO_BASE}/series?anilistId=${anilistId}`,
    `${ANIKOTO_BASE}/series?anilist=${anilistId}`,
  ];

  let seriesId = null;

  for (const url of searchAttempts) {
    try {
      const res = await fetch(url, {
        headers: JSON_HEADERS,
        signal:  timeoutSignal(PROXY_TIMEOUT),
      });
      if (!res.ok) continue;
      const data = await res.json();

      seriesId =
        data?.id ??
        data?.data?.id ??
        (Array.isArray(data?.data) ? data.data[0]?.id : null) ??
        (Array.isArray(data)       ? data[0]?.id        : null);

      if (seriesId) break;
    } catch {
      continue;
    }
  }

  if (!seriesId) return null;

  // Step B: fetch episode list for that series
  const epAttempts = [
    `${ANIKOTO_BASE}/series/${seriesId}/episodes`,
    `${ANIKOTO_BASE}/anime/${seriesId}/episodes`,
  ];

  for (const url of epAttempts) {
    try {
      const res = await fetch(url, {
        headers: JSON_HEADERS,
        signal:  timeoutSignal(PROXY_TIMEOUT),
      });
      if (!res.ok) continue;
      const data = await res.json();

      const list =
        Array.isArray(data)            ? data :
        Array.isArray(data?.episodes)  ? data.episodes :
        Array.isArray(data?.data)      ? data.data :
        null;

      if (!list || list.length === 0) continue;

      const ep =
        list.find(e => e.number === episodeNum || e.episode === episodeNum) ||
        list[episodeNum - 1];

      const epId = ep?.id ?? ep?.episodeId ?? ep?.episode_id;
      if (epId) return String(epId);
    } catch {
      continue;
    }
  }

  return null;
}

// ── Master Anikoto resolver ────────────────────────────────────────
async function resolveAnikotoEpisodeId(anilistId, episodeNum) {
  // Try the direct /series/{anilistId} approach first (fastest, from AnimeNova)
  const direct = await resolveViaAnikotoSeries(anilistId, episodeNum);
  if (direct) return direct;

  // Fall back to the two-step approach
  return resolveViaAnikotoLegacy(anilistId, episodeNum);
}

// ══ GET /api/megaplay/stream ══════════════════════════════════════
// Query params:
//   anilistId  — AniList media ID (required)
//   episode    — episode number (default: 1)
//   lang       — "sub" | "dub" (default: "sub")
//
// Response:
//   { url, method, episodeId?, warning?, status? }
//   method: 'ani' | 's-2' | 'ani-unverified'
// ═════════════════════════════════════════════════════════════════
router.get('/stream', async (req, res) => {
  try {
    const { anilistId, episode = '1', lang = 'sub' } = req.query;

    // ── Validate ──────────────────────────────────────────────
    if (!anilistId) {
      return res.status(400).json({ error: 'anilistId is required' });
    }

    const langStr = String(lang).toLowerCase();
    if (!['sub', 'dub'].includes(langStr)) {
      return res.status(400).json({ error: "lang must be 'sub' or 'dub'" });
    }

    const ep       = Math.max(1, parseInt(String(episode), 10) || 1);
    const aniId    = String(anilistId).trim();

    // ── Step 1: Try /stream/ani/ directly ────────────────────
    const aniUrl  = `${MEGAPLAY_BASE}/stream/ani/${aniId}/${ep}/${langStr}`;
    const check   = await verifyMegaplayUrl(aniUrl);

    if (check.ok) {
      console.log(`[MegaPlay] ✓ /ani/ HTTP ${check.status} for AniList ${aniId} EP${ep} ${langStr}`);
      return res.json({ url: aniUrl, method: 'ani', status: check.status });
    }

    console.log(
      `[MegaPlay] /ani/ returned HTTP ${check.status} for AniList ${aniId} EP${ep} → trying Anikoto s-2 fallback`
    );

    // ── Step 2: Anikoto → /stream/s-2/ ───────────────────────
    const episodeId = await resolveAnikotoEpisodeId(Number(aniId), ep);

    if (episodeId) {
      const s2Url = `${MEGAPLAY_BASE}/stream/s-2/${encodeURIComponent(episodeId)}/${langStr}`;
      console.log(`[MegaPlay] ✓ Anikoto s-2 → ${s2Url}`);
      return res.json({ url: s2Url, method: 's-2', episodeId });
    }

    // ── Step 3: Return /ani/ unverified as last resort ────────
    console.log(`[MegaPlay] ⚠ Anikoto gave no episode ID — returning unverified /ani/ URL`);
    return res.json({
      url:     aniUrl,
      method:  'ani-unverified',
      warning: `Primary lookup returned HTTP ${check.status} and the episode ID could not be confirmed. The stream may still work.`,
    });

  } catch (err) {
    console.error('[MegaPlay] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ══ GET /api/megaplay/health ══════════════════════════════════════
router.get('/health', async (req, res) => {
  try {
    const mpRes = await fetch(`${MEGAPLAY_BASE}/`, {
      method:   'HEAD',
      headers:  { 'User-Agent': BROWSER_UA },
      redirect: 'follow',
      signal:   timeoutSignal(5000),
    });
    const ok = mpRes.ok || (mpRes.status >= 200 && mpRes.status < 400);
    res.status(ok ? 200 : 503).json({
      megaplay: ok ? 'ok' : 'degraded',
      status:   mpRes.status,
    });
  } catch (err) {
    res.status(503).json({ megaplay: 'error', error: err.message });
  }
});

module.exports = router;
