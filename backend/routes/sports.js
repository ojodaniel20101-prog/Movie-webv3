const express = require('express');
const router  = express.Router();

// ─── Config ────────────────────────────────────────────────────────────────
const DOMAINS = [
  'https://sportslivetoday.com',
  'https://thesports.today',
  'https://moviebox.pk',
  'https://moviebox.ph',
  'https://moviebox.co',
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://sportslivetoday.com/',
};

const STREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
  'Referer': 'https://thesports.today/',
  'Origin': 'https://thesports.today',
};

const STATUS_MAP = {
  MatchNotStart: 'UPCOMING',
  MatchIng:      'LIVE',
  MatchEnded:    'FINISHED',
  MatchEnd:      'FINISHED',
  HalfTime:      'HALF_TIME',
  NoStart:       'UPCOMING',
  Finished:      'FINISHED',
};

// Cache
const cache = {};
const CACHE_TTL = 60 * 1000;

// Stream test cache: url -> { ms, ok, testedAt }
const streamCache = {};
const STREAM_CACHE_TTL = 2 * 60 * 1000;

// ─── Nuxt Ref Resolver ──────────────────────────────────────────────────────
function resolveNuxtRef(payload, ref, depth = 0, visited = new Set()) {
  if (depth > 12 || visited.has(ref)) return null;
  if (typeof ref !== 'number' || ref < 0 || ref >= payload.length) return ref;
  visited = new Set(visited);
  visited.add(ref);
  const value = payload[ref];
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(item => resolveNuxtRef(payload, item, depth + 1, visited));
  if (typeof value === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (!key.startsWith('$')) result[key] = resolveNuxtRef(payload, val, depth + 1, visited);
    }
    return result;
  }
  return value;
}

// ─── Extract m3u8 ──────────────────────────────────────────────────────────
function extractM3u8(url) {
  if (!url) return null;
  if (url.includes('.m3u8') && !url.includes('url=')) return url;
  if (url.includes('.m3u8') && url.includes('url=')) {
    const m = url.match(/[?&]url=(https?:\/\/[^&]+\.m3u8)/);
    if (m) return m[1];
  }
  if (url.startsWith('http')) return url;
  return null;
}

// ─── Parse Nuxt Payload ─────────────────────────────────────────────────────
function parseNuxtMatches(payload) {
  const matches = [];
  if (!Array.isArray(payload)) return matches;

  for (let i = 0; i < payload.length; i++) {
    const item = payload[i];
    if (item && typeof item === 'object' && 'team1' in item && 'team2' in item) {
      try {
        const match = resolveNuxtRef(payload, i);
        if (!match || typeof match !== 'object') continue;

        const team1 = match.team1 || {};
        const team2 = match.team2 || {};

        // Extract streams — same logic as v3 Python
        const streams = [];

        const playPath = match.playPath || '';
        if (playPath && playPath.includes('.m3u8')) {
          streams.push({ name: 'Primary HD', url: playPath, type: 'm3u8', quality: 'HD' });
        }

        for (const ch of (match.playSource || [])) {
          if (ch && typeof ch === 'object') {
            const chPath = ch.path || '';
            if (chPath) {
              const m3u8 = extractM3u8(chPath);
              streams.push({
                name: ch.title || 'Channel',
                url: m3u8 || chPath,
                type: m3u8 ? 'm3u8' : 'player',
                quality: 'HD',
              });
            }
          }
        }

        // Period scores
        const t1Info = match.teamMatchInfo1 || {};
        const t2Info = match.teamMatchInfo2 || {};
        const t1Scores = t1Info.scores || [];
        const t2Scores = t2Info.scores || [];
        const periodNames = ['1H', '2H', 'ET1', 'ET2', 'P1', 'P2', 'P3'];
        const periodScores = t1Scores.slice(0, t2Scores.length).map((s1, idx) => ({
          name: periodNames[idx] || `P${idx + 1}`,
          home: s1,
          away: t2Scores[idx],
        }));

        let startTime = 0;
        try { startTime = parseInt(match.startTime || 0) / 1000; } catch {}

        const rawStatus = match.status || 'Unknown';

        matches.push({
          id:           String(match.id || ''),
          sport_type:   match.type || 'football',
          homeTeam:     team1.name || 'Unknown',
          awayTeam:     team2.name || 'Unknown',
          homeScore:    String(team1.score ?? '-'),
          awayScore:    String(team2.score ?? '-'),
          homeAbbr:     team1.abbreviation || '',
          awayAbbr:     team2.abbreviation || '',
          homeLogo:     team1.avatar || '',
          awayLogo:     team2.avatar || '',
          status:       STATUS_MAP[rawStatus] || rawStatus,
          rawStatus,
          statusLive:   match.statusLive || '',
          league:       match.league || '',
          round:        match.matchRound || '',
          startTime,
          streams,
          periodScores,
          scrapedAt:    new Date().toISOString(),
        });
      } catch { continue; }
    }
  }
  return matches;
}

// ─── Fetch Matches ──────────────────────────────────────────────────────────
async function fetchMatches(sport = 'football') {
  const now = Date.now();
  if (cache[sport] && now - cache[sport].lastFetch < CACHE_TTL) {
    return cache[sport].data;
  }

  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

  for (const domain of DOMAINS) {
    try {
      const url = `${domain.replace(/\/$/, '')}/_payload.json?live&sportType=${sport}`;
      const resp = await fetch(url, { headers: BROWSER_HEADERS, timeout: 12000 });
      if (resp.ok) {
        const text = await resp.text();
        if (text.length < 1000) continue;
        const payload = JSON.parse(text);
        const raw = parseNuxtMatches(payload);
        // Deduplicate by match ID
        const seen = new Set();
        const matches = raw.filter(m => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        if (matches.length > 0) {
          cache[sport] = { data: matches, lastFetch: now };
          return matches;
        }
      }
    } catch { continue; }
  }

  return cache[sport]?.data || [];
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

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/sports/matches?sport=football
router.get('/matches', async (req, res) => {
  try {
    const sport = req.query.sport || 'football';
    const matches = await fetchMatches(sport);
    const live     = matches.filter(m => m.status === 'LIVE');
    const upcoming = matches.filter(m => m.status === 'UPCOMING');
    const other    = matches.filter(m => !['LIVE', 'UPCOMING'].includes(m.status));

    res.json({
      success: true,
      sport,
      count: matches.length,
      live: live.length,
      matches: [...live, ...upcoming, ...other],
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/sports/test-streams
// Body: { streams: [{ name, url }] }
// Returns streams sorted by speed, fastest first
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

    // Sort: working streams first, then by speed
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

// GET /api/sports/stream-proxy?url=<m3u8_url>
router.get('/stream-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const streamResp = await fetch(url, { headers: STREAM_HEADERS });

    if (!streamResp.ok) return res.status(streamResp.status).send('Stream error');

    const contentType = streamResp.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');

    if (url.includes('.m3u8')) {
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

module.exports = router;
