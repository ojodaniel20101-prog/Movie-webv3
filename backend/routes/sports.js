/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SPORTS API ROUTE — Live Match Data & Streams
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Primary Source: Cineverse (cinverse.com.ng)
 *   - GET /api/football/matches — Match listings by date/sport
 *   - GET /api/football/match/<id> — Match details & stream tokens
 *   - GET /api/sports/streams?source=cinverse&id=<id> — Stream extraction
 *
 * Stream Provider: embed.st (JW Player-based embeds)
 *   Cineverse uses embed.st as their streaming backend. Each match has
 *   embed URLs like: https://embed.st/embed/<source>/<id>/<streamNo>
 *   Sources include: admin (Premium HD), echo, golf
 *
 * Endpoints provided:
 *   GET  /api/sports/matches?sport=football&date=YYYY-MM-DD
 *   GET  /api/sports/match/:id
 *   GET  /api/sports/stream?source=<source>&id=<match_id>
 *   GET  /api/sports/stream-proxy?url=<m3u8_url>
 *   POST /api/sports/test-streams
 *
 * Cache: 60-second TTL for match lists
 */

const express = require('express');
const router = express.Router();
const { extractStream, proxyStream } = require('./streamfinder');

// ─── Config ─────────────────────────────────────────────────────────────────

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const STREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
  'Referer': 'https://cinverse.com.ng/',
};

const STATUS_MAP = {
  upcoming: 'UPCOMING',
  live: 'LIVE',
  finished: 'FINISHED',
  halftime: 'HALF_TIME',
  ended: 'FINISHED',
};

// ─── Cache ──────────────────────────────────────────────────────────────────

const cache = {};
const CACHE_TTL = 60 * 1000; // 60 seconds

// Cineverse session cache
let cvSession = null;
let cvSessionExpiry = 0;
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes

// Stream test cache: url -> { ms, ok, testedAt }
const streamCache = {};
const STREAM_CACHE_TTL = 2 * 60 * 1000;

// ─── Cineverse Session Manager ──────────────────────────────────────────────

async function getCvSession() {
  const now = Date.now();
  if (cvSession && now - cvSessionExpiry < SESSION_TTL) {
    return cvSession;
  }

  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const resp = await fetch('https://cinverse.com.ng/football', {
      headers: HEADERS,
      redirect: 'follow',
    });

    const cookies = resp.headers.raw()['set-cookie'];
    const cookieStr = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';

    cvSession = { cookies: cookieStr };
    cvSessionExpiry = now;
    return cvSession;
  } catch (err) {
    return cvSession || { cookies: '' };
  }
}

// ─── Fetch Matches from Cineverse ───────────────────────────────────────────

async function fetchMatches(sport = 'football', date = null) {
  const cacheKey = `${sport}:${date || 'today'}`;
  const now = Date.now();

  if (cache[cacheKey] && now - cache[cacheKey].lastFetch < CACHE_TTL) {
    return cache[cacheKey].data;
  }

  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  const session = await getCvSession();

  // Default to today if no date
  if (!date) {
    date = new Date().toISOString().slice(0, 10);
  }

  try {
    const url = `https://cinverse.com.ng/api/football/matches?sport=${encodeURIComponent(sport)}&date=${date}`;
    const resp = await fetch(url, {
      headers: {
        ...HEADERS,
        'Accept': 'application/json',
        'Referer': 'https://cinverse.com.ng/football',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': session.cookies,
      },
      timeout: 15000,
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const rawMatches = data.matches || [];

    // Normalize to unified format
    // Cineverse stream source: embed.st (JW Player embeds)
    const CV_BASE = 'https://cinverse.com.ng';
    const EMBED_BASE = 'https://embed.st';
    const matches = rawMatches.map(m => {
      // Build embed.st stream URLs from channels if available
      const streamSources = (m.channels || []).map((ch, idx) => ({
        source: 'cinverse',
        label: ch.title || `Stream ${idx + 1}`,
        embedUrl: ch.embedUrl || `${EMBED_BASE}/embed/${m.sourceType || 'admin'}/${m.id}/${idx + 1}`,
        key: ch.key || String(idx),
      }));

      return {
        id: m.id || '',
        slug: m.slug || m.id || '',
        sport_type: m.sportType || sport,
        homeTeam: m.homeTeam || 'Unknown',
        awayTeam: m.awayTeam || 'Unknown',
        homeScore: m.homeScore ?? '-',
        awayScore: m.awayScore ?? '-',
        status: STATUS_MAP[m.status] || m.status || 'UPCOMING',
        rawStatus: m.status || 'unknown',
        minute: m.minute || null,
        league: m.league || '',
        startTime: m.startTime || null,
        source: m.source || 'cinverse',
        streamProvider: 'embed.st',
        homeTeamLogo: m.homeTeamLogo ? `/api/sports/logo-proxy?url=${encodeURIComponent(m.homeTeamLogo.startsWith('http') ? m.homeTeamLogo : `${CV_BASE}${m.homeTeamLogo}`)}` : '',
        awayTeamLogo: m.awayTeamLogo ? `/api/sports/logo-proxy?url=${encodeURIComponent(m.awayTeamLogo.startsWith('http') ? m.awayTeamLogo : `${CV_BASE}${m.awayTeamLogo}`)}` : '',
        channelCount: m.channelCount || 0,
        channels: m.channels || [],
        streamSources,
        scrapedAt: new Date().toISOString(),
      };
    });

    // Sort: LIVE first, then UPCOMING, then FINISHED
    const statusOrder = { LIVE: 0, HALF_TIME: 1, UPCOMING: 2, FINISHED: 3 };
    matches.sort((a, b) => (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4));

    const result = {
      matches,
      sport,
      date,
      source: 'cinverse',
      streamProvider: 'embed.st',
      total: matches.length,
    };

    cache[cacheKey] = { data: result, lastFetch: now };
    return result;

  } catch (err) {
    // Return cached data if available, otherwise error
    if (cache[cacheKey]?.data) {
      return cache[cacheKey].data;
    }
    return { matches: [], sport, date, source: 'cinverse', total: 0, error: err.message };
  }
}

// ─── Fetch Single Match Detail ──────────────────────────────────────────────

async function fetchMatchDetail(matchSlug) {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  const session = await getCvSession();

  try {
    const resp = await fetch(`https://cinverse.com.ng/api/football/match/${encodeURIComponent(matchSlug)}`, {
      headers: {
        ...HEADERS,
        'Accept': 'application/json',
        'Referer': `https://cinverse.com.ng/match/${matchSlug}`,
        'Cookie': session.cookies,
      },
      timeout: 15000,
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();

    return {
      success: true,
      match: data.match || null,
      sources: data.sources || [],
      streamToken: data.streamToken || null,
      streamPath: data.streamPath || null,
      embedUrl: data.embedUrl || null,
      directStreamUrl: data.directStreamUrl || null,
      provider: data.provider || 'cinverse',
      channelKey: data.channelKey || null,
    };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Test a single stream ───────────────────────────────────────────────────

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

// ─── GET /api/sports/matches ────────────────────────────────────────────────
// Query: ?sport=football&date=YYYY-MM-DD
router.get('/matches', async (req, res) => {
  try {
    const sport = req.query.sport || 'football';
    const date = req.query.date || null;

    const result = await fetchMatches(sport, date);
    const matches = result.matches || [];
    const live = matches.filter(m => m.status === 'LIVE');
    const upcoming = matches.filter(m => m.status === 'UPCOMING');
    const finished = matches.filter(m => m.status === 'FINISHED');

    res.json({
      success: true,
      sport: result.sport || sport,
      date: result.date,
      source: result.source || 'cinverse',
      streamProvider: result.streamProvider || 'embed.st',
      count: matches.length,
      live: live.length,
      upcoming: upcoming.length,
      finished: finished.length,
      matches: [...live, ...upcoming, ...finished],
      cached: !!cache[`${sport}:${date || 'today'}`] && (Date.now() - cache[`${sport}:${date || 'today'}`].lastFetch < CACHE_TTL),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/sports/match/:id ──────────────────────────────────────────────
// Get detailed match info including stream tokens
router.get('/match/:id', async (req, res) => {
  try {
    const matchSlug = req.params.id;
    const detail = await fetchMatchDetail(matchSlug);

    if (!detail.success) {
      return res.status(404).json({ success: false, error: detail.error || 'Match not found' });
    }

    res.json(detail);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/sports/stream ─────────────────────────────────────────────────
// Query: ?source=cinverse&id=<match_id_or_slug>
router.get('/stream', async (req, res) => {
  const { source, id } = req.query;

  if (!source || !id) {
    return res.status(400).json({ success: false, error: 'source and id are required' });
  }

  try {
    const result = await extractStream(source, id, {
      streamIndex: req.query.stream_index || 0,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/sports/streams ────────────────────────────────────────────────
// Query: ?source=cinverse&id=<match_id> — Returns available streams
router.get('/streams', async (req, res) => {
  const { source, id } = req.query;

  if (!source || !id) {
    return res.status(400).json({ success: false, error: 'source and id are required' });
  }

  try {
    const result = await extractStream(source, id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/sports/test-streams ──────────────────────────────────────────
// Body: { streams: [{ name, url }] }
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

// ─── GET /api/sports/stream-proxy ───────────────────────────────────────────
// Proxy m3u8 streams with proper headers
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
        return `${host}/api/sports/stream-proxy?url=${encodeURIComponent(absUrl)}`;
      }).join('\n');
      return res.send(rewritten);
    }

    streamResp.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sports/logo-proxy ─────────────────────────────────────────────
// Proxy team logos from Cineverse with proper authentication headers
router.get('/logo-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const logoResp = await fetch(url, {
      headers: {
        ...HEADERS,
        'Referer': 'https://cinverse.com.ng/football',
      },
      timeout: 10000,
    });

    if (!logoResp.ok) {
      return res.status(logoResp.status).send('Logo fetch failed');
    }

    const contentType = logoResp.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.setHeader('Access-Control-Allow-Origin', '*');

    logoResp.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
