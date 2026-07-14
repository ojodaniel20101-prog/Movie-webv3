/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SPORTS API ROUTE — h5-sport-api.aoneroom.com Integration
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Primary Source: h5-sport-api.aoneroom.com
 *   - GET /api/sports-v2/leagues — List available leagues
 *   - GET /api/sports-v2/matches?leagueId=<id> — Match listings by league
 *   - GET /api/sports-v2/match/:id — Match details with replays & highlights
 *   - GET /api/sports-v2/stream-proxy?url=<m3u8_url> — Stream proxy
 *   - POST /api/sports-v2/test-streams — Test stream availability
 *
 * Features:
 *   - Live matches with English streams
 *   - Upcoming matches
 *   - Past matches with replays & highlights
 *   - Direct m3u8 stream URLs
 *   - 60-second cache for match lists
 */

const express = require('express');
const router = express.Router();

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
};

// ─── Status Mapping ─────────────────────────────────────────────────────────

const STATUS_MAP = {
  'Live': 'LIVE',
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
};

// ─── Cache ──────────────────────────────────────────────────────────────────

const cache = {};
const CACHE_TTL = 60 * 1000; // 60 seconds

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

  // ── Safety checks for incorrectly classified matches ────────────────

  // If marked FINISHED but 0:0 and hasn't started yet → treat as UPCOMING
  if (status === 'FINISHED' && isZeroZero && isFutureMatch) {
    status = 'UPCOMING';
  }

  // If status is UNKNOWN but match is in the future → assume UPCOMING
  if (status === 'UNKNOWN' && isFutureMatch) {
    status = 'UPCOMING';
  }

  // Parse streams from playSource
  const streams = (raw.playSource || []).map((src, idx) => ({
    name: src.title || `Channel ${idx + 1}`,
    url: src.path || '',
    type: 'hls',
    quality: 'HD',
  })).filter(s => s.url);

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
    startTime: raw.startTime ? Math.floor(raw.startTime / 1000) : null,
    endTime: raw.endTime ? Math.floor(raw.endTime / 1000) : null,
    sportType: raw.type || 'football',
    playType: raw.playType || '',
    playPath: raw.playPath || '',
    streams,
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

  if (cache[cacheKey] && now - cache[cacheKey].lastFetch < CACHE_TTL) {
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

    cache[cacheKey] = { data: result, lastFetch: now };
    return result;

  } catch (err) {
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

    return {
      success: !!match,
      match,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Fetch Leagues ──────────────────────────────────────────────────────────

async function fetchLeagues() {
  const cacheKey = 'leagues';
  const now = Date.now();

  if (cache[cacheKey] && now - cache[cacheKey].lastFetch < CACHE_TTL) {
    return cache[cacheKey].data;
  }

  try {
    const data = await fetchFromAPI('/live/league-tab');
    const leagues = (data.list || []).map(l => ({
      id: String(l.id),
      name: l.name || l.localName || '',
      localName: l.localName || '',
    })).filter(l => l.id && l.name);

    const result = { leagues, total: leagues.length };
    cache[cacheKey] = { data: result, lastFetch: now };
    return result;

  } catch (err) {
    if (cache[cacheKey]?.data) {
      return cache[cacheKey].data;
    }
    // Fallback leagues
    return {
      leagues: [
        { id: '0', name: 'All', localName: 'All' },
        { id: '4186762757372631736', name: 'FIFA World Cup', localName: 'FIFA World Cup' },
        { id: '1247297119346653536', name: 'NBA', localName: 'NBA' },
      ],
      total: 3,
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
        const result = await testStream(s.url);
        return { ...s, ok: result.ok, ms: result.ms };
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
router.get('/stream-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const rangeHeader = req.headers['range'];
    const fetchHeaders = { ...STREAM_HEADERS };
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

    const streamResp = await fetch(url, { headers: fetchHeaders });

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

    if (url.includes('.m3u8') && !rangeHeader) {
      const text = await streamResp.text();
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const host = `${req.protocol}://${req.get('host')}`;
      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const absUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
        return `${host}/api/sports-v2/stream-proxy?url=${encodeURIComponent(absUrl)}`;
      }).join('\n');
      return res.send(rewritten);
    }

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

module.exports = router;
