/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SPORTS API ROUTE — h5-sport-api.aoneroom.com Integration  (FIXED v2)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Primary Source: h5-sport-api.aoneroom.com
 *   - GET /api/sports-v2/leagues — List available leagues
 *   - GET /api/sports-v2/matches?leagueId=<id> — Match listings by league
 *   - GET /api/sports-v2/match/:id — Match details with replays & highlights
 *   - GET /api/sports-v2/stream-proxy?url=<m3u8_url> — Stream proxy
 *   - POST /api/sports-v2/test-streams — Test stream availability
 *
 * FIXES applied (v2):
 *   1. playPath (main direct m3u8) is now included as the FIRST stream in
 *      the streams array — previously it was omitted, causing "Loading..."
 *   2. stream-proxy now uses URL() constructor for correct relative-path
 *      resolution (handles ../ ./ and absolute paths inside m3u8)
 *   3. stream-proxy forwards Origin + Referer to upstream to avoid 403s
 *   4. stream-proxy handles #EXT-X-KEY URI=, #EXT-X-MAP URI=, and
 *      #EXT-X-MEDIA URI= attributes comprehensively
 *   5. Added VioletFlix fallback when aoneroom returns no matches / no streams
 */

const express = require('express');
const router = express.Router();

// ─── VioletFlix Fallback ────────────────────────────────────────────────────
const { fetchVioletFlixMatches, fetchVioletFlixDetail } = require('./sports-violetflix');

// ─── Config ─────────────────────────────────────────────────────────────────

const API_BASE = 'https://h5-sport-api.aoneroom.com/wefeed-h5api-bff';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://sportsnow.top',
  'Referer': 'https://sportsnow.top/',
};

const STREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
  'Referer': 'https://sportsnow.top/',
  'Origin': 'https://sportsnow.top',
};

// ─── Status Mapping ─────────────────────────────────────────────────────────

const STATUS_MAP = {
  'Live': 'LIVE',
  'MatchIng': 'LIVE',
  'MatchEnded': 'FINISHED',
  'Upcoming': 'UPCOMING',
  'HalfTime': 'HALF_TIME',
  'Postponed': 'POSTPONED',
  'Cancelled': 'CANCELLED',
  'MatchNotStart': 'UPCOMING',
};

const STATUS_LIVE_MAP = {
  0: 'UPCOMING',
  1: 'LIVE',
  2: 'HALF_TIME',
  3: 'FINISHED',
  'Living': 'LIVE',
  'UnLive': 'UPCOMING',
};

// ─── Cache ──────────────────────────────────────────────────────────────────

const cache = {};
const LIVE_CACHE_TTL = 15 * 1000;
const DEFAULT_CACHE_TTL = 30 * 1000;

const streamCache = {};
const STREAM_CACHE_TTL = 2 * 60 * 1000;

// ─── Fetch Helper ───────────────────────────────────────────────────────────

async function fetchFromAPI(endpoint, params = {}) {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });

  const resp = await fetch(url.toString(), {
    headers: HEADERS,
    timeout: 15000,
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(data.message || 'API error');
  }

  return data.data;
}

// ─── Extract Real Stream URL ────────────────────────────────────────────────

function extractStreamUrl(url) {
  if (!url) return null;

  // Already a direct m3u8 URL (and not an HTML page)
  if (url.match(/\.m3u8(?:\?|$)/i) && !url.includes('.html')) {
    return url;
  }

  // 88player-style: https://play.88player.top/m3u8.html?url=REAL_M3U8
  const urlParamMatch = url.match(/[?&]url=([^&]+)/i);
  if (urlParamMatch) {
    const decoded = decodeURIComponent(urlParamMatch[1]);
    if (decoded.match(/\.m3u8(?:\?|$)/i)) {
      return decoded;
    }
  }

  // sportsteam368-style: return as-is for iframe embedding
  if (url.includes('sportsteam368.com')) {
    return url;
  }

  // Generic fallback: look for any m3u8 or http URL in query params
  if (url.includes('?')) {
    const genericMatch = url.match(/[?&](?:url|src|video|stream|link)=([^&]+)/i);
    if (genericMatch) {
      const decoded = decodeURIComponent(genericMatch[1]);
      if (decoded.match(/\.m3u8(?:\?|$)/i) || decoded.startsWith('http')) {
        return decoded;
      }
    }
  }

  return url;
}

// ─── Normalize Match ────────────────────────────────────────────────────────

function normalizeMatch(raw) {
  const statusLive = raw.statusLive ?? 0;
  const statusText = raw.status || '';
  let status = STATUS_MAP[statusText] || STATUS_LIVE_MAP[statusLive] || 'UNKNOWN';

  const nowSec = Math.floor(Date.now() / 1000);
  const matchStartSec = raw.startTime ? Math.floor(Number(raw.startTime) / 1000) : null;
  const homeScore = raw.team1?.score ?? '';
  const awayScore = raw.team2?.score ?? '';
  const isZeroZero = homeScore === '0' && awayScore === '0';
  const isFutureMatch = matchStartSec !== null && matchStartSec > nowSec;

  // Safety checks for incorrectly classified matches
  if (status === 'FINISHED' && isZeroZero && isFutureMatch) {
    status = 'UPCOMING';
  }
  if (status === 'UNKNOWN' && isFutureMatch) {
    status = 'UPCOMING';
  }
  if (status === 'UNKNOWN' && matchStartSec !== null && matchStartSec <= nowSec) {
    status = 'LIVE';
  }
  if (statusText === 'MatchIng' && status !== 'LIVE') {
    status = 'LIVE';
  }

  // ── FIX v2: Build streams array ──────────────────────────────────────
  // playPath is the PRIMARY direct m3u8 feed from aoneroom. It MUST be
  // included as the first stream — previously it was omitted, leaving
  // only wrapper/aggregator links in playSource.
  const streams = [];

  // 1. Add playPath as the primary stream (direct m3u8)
  if (raw.playPath) {
    const extracted = extractStreamUrl(raw.playPath);
    if (extracted) {
      streams.push({
        name: 'Main Feed',
        url: extracted,
        originalUrl: raw.playPath,
        type: 'hls',
        quality: 'HD',
      });
    }
  }

  // 2. Add playSource channels
  (raw.playSource || []).forEach((src, idx) => {
    const extracted = extractStreamUrl(src.path || '');
    if (extracted) {
      streams.push({
        name: src.title || `Channel ${idx + 1}`,
        url: extracted,
        originalUrl: src.path || '',
        type: 'hls',
        quality: 'HD',
      });
    }
  });

  // Deduplicate by URL
  const seenUrls = new Set();
  const dedupedStreams = [];
  for (const s of streams) {
    if (!seenUrls.has(s.url)) {
      seenUrls.add(s.url);
      dedupedStreams.push(s);
    }
  }

  // Parse replays
  const replays = (raw.replay || []).map((r, idx) => ({
    id: r.id || String(idx),
    title: r.title || `Replay ${idx + 1}`,
    url: r.path || '',
    cover: r.cover?.url || '',
    duration: r.duration || '0',
  })).filter(r => r.url);

  // Parse highlights
  const highlights = (raw.highlights || []).map((h, idx) => ({
    id: h.id || String(idx),
    title: h.title || `Highlight ${idx + 1}`,
    url: h.path || '',
    cover: h.cover?.url || '',
    duration: h.duration || '0',
    views: h.stat?.viewCount || '0',
  })).filter(h => h.url);

  return {
    id: String(raw.id),
    homeTeam: raw.team1?.name || 'Home',
    awayTeam: raw.team2?.name || 'Away',
    homeScore: raw.team1?.score ?? '-',
    awayScore: raw.team2?.score ?? '-',
    homeAbbreviation: raw.team1?.abbreviation || '',
    awayAbbreviation: raw.team2?.abbreviation || '',
    homeLogo: raw.team1?.avatar || '',
    awayLogo: raw.team2?.avatar || '',
    status,
    statusLive,
    minute: raw.timeDesc || '',
    league: raw.league || '',
    matchRound: raw.matchRound || '',
    startTime: raw.startTime ? Number(raw.startTime) : null,
    endTime: raw.endTime ? Math.floor(raw.endTime / 1000) : null,
    sportType: raw.type || 'football',
    playType: raw.playType || '',
    playPath: raw.playPath || '',
    streams: dedupedStreams.slice(0, 6),
    replays,
    highlights,
    hasVideo: raw.playType === 'PlayTypeVideo',
    hasText: raw.playType === 'PlayTypeText',
    scrapedAt: new Date().toISOString(),
  };
}

// ─── Fetch Matches ──────────────────────────────────────────────────────────

async function fetchMatches(leagueId = '0') {
  const cacheKey = `matches:${leagueId}`;
  const now = Date.now();

  const hasLiveMatch = cache[cacheKey]?.data?.live > 0;
  const cacheTtl = hasLiveMatch ? LIVE_CACHE_TTL : DEFAULT_CACHE_TTL;

  if (cache[cacheKey] && now - cache[cacheKey].lastFetch < cacheTtl) {
    return cache[cacheKey].data;
  }

  try {
    const data = await fetchFromAPI('/live/match-list-v5', { leagueId });
    const rawMatches = data.list || [];
    const matches = rawMatches.map(normalizeMatch);

    // Sort: LIVE first, then UPCOMING, then FINISHED
    const statusOrder = { LIVE: 0, HALF_TIME: 1, UPCOMING: 2, FINISHED: 3 };
    matches.sort((a, b) => (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4));

    const result = {
      matches,
      leagueId,
      hasMore: data.hasMore || false,
      total: matches.length,
      live: matches.filter(m => m.status === 'LIVE').length,
      upcoming: matches.filter(m => m.status === 'UPCOMING').length,
      finished: matches.filter(m => m.status === 'FINISHED').length,
    };

    // ── FIX v2: Fallback to VioletFlix if aoneroom returns nothing ──
    if (matches.length === 0) {
      try {
        const vfMatches = await fetchVioletFlixMatches(leagueId);
        if (vfMatches && vfMatches.length > 0) {
          const vfNormalized = vfMatches.map(normalizeMatch);
          vfNormalized.sort((a, b) => {
            const statusOrder = { LIVE: 0, HALF_TIME: 1, UPCOMING: 2, FINISHED: 3 };
            return (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
          });
          return {
            matches: vfNormalized,
            leagueId,
            hasMore: false,
            total: vfNormalized.length,
            live: vfNormalized.filter(m => m.status === 'LIVE').length,
            upcoming: vfNormalized.filter(m => m.status === 'UPCOMING').length,
            finished: vfNormalized.filter(m => m.status === 'FINISHED').length,
            source: 'violetflix',
          };
        }
      } catch (vfErr) {
        // VioletFlix fallback failed too — return empty
      }
    }

    cache[cacheKey] = { data: result, lastFetch: now };
    return result;

  } catch (err) {
    // Try VioletFlix as fallback on aoneroom error
    try {
      const vfMatches = await fetchVioletFlixMatches(leagueId);
      if (vfMatches && vfMatches.length > 0) {
        const vfNormalized = vfMatches.map(normalizeMatch);
        vfNormalized.sort((a, b) => {
          const statusOrder = { LIVE: 0, HALF_TIME: 1, UPCOMING: 2, FINISHED: 3 };
          return (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
        });
        return {
          matches: vfNormalized,
          leagueId,
          hasMore: false,
          total: vfNormalized.length,
          live: vfNormalized.filter(m => m.status === 'LIVE').length,
          upcoming: vfNormalized.filter(m => m.status === 'UPCOMING').length,
          finished: vfNormalized.filter(m => m.status === 'FINISHED').length,
          source: 'violetflix',
        };
      }
    } catch (vfErr) {
      // ignore
    }

    if (cache[cacheKey]?.data) {
      return cache[cacheKey].data;
    }
    return { matches: [], leagueId, hasMore: false, total: 0, live: 0, upcoming: 0, finished: 0, error: err.message };
  }
}

// ─── Fetch Match Detail ─────────────────────────────────────────────────────

async function fetchMatchDetail(matchId) {
  try {
    const data = await fetchFromAPI('/sport/detail-v1', { matchId });
    const match = data.match ? normalizeMatch(data.match) : null;

    // ── FIX v2: Fallback to VioletFlix if aoneroom detail has no streams ──
    if (!match || (match.streams.length === 0 && match.replays.length === 0 && match.highlights.length === 0)) {
      try {
        const vfDetail = await fetchVioletFlixDetail(matchId);
        if (vfDetail) {
          const vfMatch = normalizeMatch(vfDetail);
          if (vfMatch.streams.length > 0 || vfMatch.replays.length > 0) {
            return { success: true, match: vfMatch, source: 'violetflix' };
          }
        }
      } catch (vfErr) {
        // ignore
      }
    }

    return {
      success: !!match,
      match,
    };
  } catch (err) {
    // Try VioletFlix fallback
    try {
      const vfDetail = await fetchVioletFlixDetail(matchId);
      if (vfDetail) {
        const vfMatch = normalizeMatch(vfDetail);
        return { success: true, match: vfMatch, source: 'violetflix' };
      }
    } catch (vfErr) {
      // ignore
    }

    return { success: false, error: err.message };
  }
}

// ─── Fetch Leagues ──────────────────────────────────────────────────────────

async function fetchLeagues() {
  const cacheKey = 'leagues';
  const now = Date.now();

  if (cache[cacheKey] && now - cache[cacheKey].lastFetch < DEFAULT_CACHE_TTL) {
    return cache[cacheKey].data;
  }

  try {
    const data = await fetchFromAPI('/live/league-tab');
    const leagues = (data.list || []).map(l => ({
      id: String(l.id),
      name: l.name || l.localName || '',
      localName: l.localName || '',
    })).filter(l => l.id && l.name && l.id !== '0');

    const result = { leagues, total: leagues.length };
    cache[cacheKey] = { data: result, lastFetch: now };
    return result;

  } catch (err) {
    if (cache[cacheKey]?.data) {
      return cache[cacheKey].data;
    }
    return {
      leagues: [
        { id: '4186762757372631736', name: 'FIFA World Cup', localName: 'FIFA World Cup' },
        { id: '1247297119346653536', name: 'NBA', localName: 'NBA' },
      ],
      total: 2,
      error: err.message,
    };
  }
}

// ─── Test Stream ────────────────────────────────────────────────────────────

async function testStream(url) {
  const now = Date.now();
  if (streamCache[url] && now - streamCache[url].testedAt < STREAM_CACHE_TTL) {
    return streamCache[url];
  }

  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, {
      method: 'HEAD',
      headers: STREAM_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const ms = Date.now() - start;
    const result = { ok: resp.ok || resp.status < 400, ms, testedAt: now };
    streamCache[url] = result;
    return result;
  } catch {
    const result = { ok: false, ms: 9999, testedAt: now };
    streamCache[url] = result;
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/sports-v2/leagues ─────────────────────────────────────────────
router.get('/leagues', async (_req, res) => {
  try {
    const result = await fetchLeagues();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/sports-v2/matches ─────────────────────────────────────────────
router.get('/matches', async (req, res) => {
  try {
    const leagueId = req.query.leagueId || '0';
    const result = await fetchMatches(leagueId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/sports-v2/match/:id ───────────────────────────────────────────
router.get('/match/:id', async (req, res) => {
  try {
    const matchId = req.params.id;
    const detail = await fetchMatchDetail(matchId);

    if (!detail.success) {
      return res.status(404).json({ success: false, error: detail.error || 'Match not found' });
    }

    res.json(detail);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/sports-v2/test-streams ───────────────────────────────────────
router.post('/test-streams', async (req, res) => {
  try {
    const { streams = [] } = req.body;
    if (!streams.length) return res.json({ streams: [] });

    const results = await Promise.all(
      streams.map(async (s) => {
        const resolved = extractStreamUrl(s.url || s.originalUrl || '');
        const result = await testStream(resolved);
        return { ...s, url: resolved, ok: result.ok, ms: result.ms };
      })
    );

    results.sort((a, b) => {
      if (a.ok && !b.ok) return -1;
      if (!a.ok && b.ok) return 1;
      return a.ms - b.ms;
    });

    res.json({ streams: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sports-v2/stream-proxy ────────────────────────────────────────
// FIX v2: Complete rewrite with proper relative-URL resolution and
// comprehensive URI attribute rewriting.
router.get('/stream-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
  } catch {
    targetUrl = url;
  }

  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const rangeHeader = req.headers['range'];

    // Build upstream headers — forward Origin/Referer to avoid 403s
    const fetchHeaders = { ...STREAM_HEADERS };
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

    // If client sent an Origin, forward a plausible one for the upstream domain
    const clientOrigin = req.headers['origin'];
    if (clientOrigin) {
      fetchHeaders['Origin'] = clientOrigin;
    }

    const streamResp = await fetch(targetUrl, {
      headers: fetchHeaders,
      redirect: 'follow',
    });

    if (!streamResp.ok && streamResp.status !== 206) {
      return res.status(streamResp.status).send('Stream error');
    }

    const contentType = streamResp.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');

    if (streamResp.headers.get('content-length')) {
      res.setHeader('Content-Length', streamResp.headers.get('content-length'));
    }
    if (streamResp.headers.get('content-range')) {
      res.setHeader('Content-Range', streamResp.headers.get('content-range'));
    }

    // ── M3U8 manifest rewriting ───────────────────────────────────────
    if (targetUrl.match(/\.m3u8(?:\?|$)/i) && !rangeHeader) {
      const text = await streamResp.text();
      const proxyBase = `${req.protocol}://${req.get('host')}/api/sports-v2/stream-proxy`;

      // Resolve any relative URL against the m3u8's base using the URL constructor
      const resolveUrl = (href) => {
        try {
          return new URL(href, targetUrl).toString();
        } catch {
          return href;
        }
      };

      const proxyify = (absUrl) => `${proxyBase}?url=${encodeURIComponent(absUrl)}`;

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();

        // Pass through comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) {
          // But rewrite URI="..." attributes inside tags
          return line.replace(/URI="([^"]+)"/g, (m0, uri) => {
            const abs = resolveUrl(uri);
            return `URI="${proxyify(abs)}"`;
          });
        }

        // Media segment or sub-playlist line
        const absUrl = resolveUrl(trimmed);
        return proxyify(absUrl);
      }).join('\n');

      return res.send(rewritten);
    }

    // ── Binary segment pass-through ───────────────────────────────────
    streamResp.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sports-v2/logo-proxy ──────────────────────────────────────────
router.get('/logo-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const logoResp = await fetch(url, {
      headers: {
        ...HEADERS,
        'Referer': 'https://sportsnow.top/',
      },
      timeout: 10000,
    });

    if (!logoResp.ok) {
      return res.status(logoResp.status).send('Logo fetch failed');
    }

    const contentType = logoResp.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    logoResp.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sports-v2/resolve-stream ──────────────────────────────────────
router.get('/resolve-stream', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  const resolved = extractStreamUrl(url);
  const isHtmlWrapper = url !== resolved;

  res.json({
    success: true,
    original: url,
    resolved: resolved || url,
    isHtmlWrapper,
    type: resolved?.match(/\.m3u8(?:\?|$)/i) ? 'hls' : 'html',
  });
});

// ─── GET /api/sports-v2/iframe-player ───────────────────────────────────────
router.get('/iframe-player', async (req, res) => {
  const { url, title = 'Live Stream' } = req.query;
  if (!url) return res.status(400).send('url required');

  const decodedUrl = decodeURIComponent(url);
  const resolved = extractStreamUrl(decodedUrl);

  if (resolved && resolved.match(/\.m3u8(?:\?|$)/i) && !resolved.includes('.html')) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    return res.redirect(`/api/sports-v2/stream-proxy?url=${encodeURIComponent(resolved)}`);
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; width: 100vw; height: 100vh; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
    .error { color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; flex-direction: column; gap: 10px; }
    .error a { color: #22D3EE; }
  </style>
</head>
<body>
  <iframe src="${resolved || decodedUrl}" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(html);
});

module.exports = router;
