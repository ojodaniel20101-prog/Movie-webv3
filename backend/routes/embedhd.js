/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EMBEDHD ROUTE — Streaming Source (Currently Unavailable)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Source: embedhd.org / exposestrat.com
 * Status: DOWN — SSL certificate issues since mid-2025
 *
 * This module is kept for when the service comes back online.
 * All endpoints return graceful error messages.
 *
 * Working alternative: Use /api/sports (Cineverse source)
 */

const express = require('express');
const router = express.Router();

const API_URL = 'https://embedhd.org/api-event.php';
const FETCH_BASE = 'https://embedhd.org/source/fetch.php';
const MAESTRO_URL = 'https://exposestrat.com/maestrohd1.php';
const REFERER = 'https://exposestrat.com/';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ─── Health Check ───────────────────────────────────────────────────────────

async function isServiceAvailable() {
  try {
    const fetch = await import('node-fetch').then(m => m.default);
    const resp = await fetch(API_URL, {
      headers: { ...HEADERS, Referer: 'https://embedhd.org/' },
      timeout: 5000,
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/embedhd/matches
router.get('/matches', async (req, res) => {
  const available = await isServiceAvailable();
  if (!available) {
    return res.status(503).json({
      success: false,
      error: 'EmbedHD service is currently unavailable (SSL/connection error)',
      alternative: 'Use /api/sports/matches for live match data from Cineverse',
      status: 'service_down',
    });
  }

  // If service comes back, attempt to fetch
  try {
    const fetch = await import('node-fetch').then(m => m.default);
    const data = await fetch(API_URL, {
      headers: { ...HEADERS, Referer: 'https://embedhd.org/' },
      timeout: 15000,
    }).then(r => r.json());

    if (!data || !data.days) {
      return res.json({ success: true, count: 0, matches: [] });
    }

    const matches = [];
    for (const day of data.days) {
      for (const item of (day.items || [])) {
        matches.push({
          id: item.id,
          title: item.title || 'Unknown',
          home: item.home_team || '',
          away: item.away_team || '',
          homeLogo: item.home_logo || '',
          awayLogo: item.away_logo || '',
          league: (item.league || '').toUpperCase(),
          category: item.category || '',
          status: item.status || 'UNKNOWN',
          time: item.ts_et ? new Date(item.ts_et * 1000).toISOString() : null,
          streams: item.streams || [],
          source: 'embedhd',
        });
      }
    }

    matches.sort((a, b) => {
      const order = { LIVE: 0, UPCOMING: 1 };
      return (order[a.status] ?? 2) - (order[b.status] ?? 2);
    });

    res.json({ success: true, count: matches.length, matches });
  } catch (err) {
    res.status(503).json({
      success: false,
      error: `EmbedHD fetch failed: ${err.message}`,
      alternative: 'Use /api/sports/matches for live match data from Cineverse',
    });
  }
});

// GET /api/embedhd/stream?id=<match_id>&stream_index=0
router.get('/stream', async (req, res) => {
  const available = await isServiceAvailable();
  if (!available) {
    return res.status(503).json({
      success: false,
      error: 'EmbedHD service is currently unavailable',
      alternative: 'Use /api/sports/stream?source=cinverse&id=<match_id>',
    });
  }

  const { id, stream_index = 0 } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const fetch = await import('node-fetch').then(m => m.default);

    // Fetch matches to find the one requested
    const data = await fetch(API_URL, {
      headers: { ...HEADERS, Referer: 'https://embedhd.org/' },
      timeout: 15000,
    }).then(r => r.json());

    let match = null;
    for (const day of data.days) {
      for (const item of (day.items || [])) {
        if (String(item.id) === String(id)) {
          match = item;
          break;
        }
      }
      if (match) break;
    }

    if (!match) return res.status(404).json({ error: 'Match not found' });

    const streams = match.streams || [];
    if (!streams.length) return res.json({ success: false, error: 'No streams' });

    const stream = streams[Math.min(parseInt(stream_index), streams.length - 1)];
    const hdId = stream.hd;

    // Extract fid
    const fetchText = await fetch(`${FETCH_BASE}?hd=${hdId}`, {
      headers: { ...HEADERS, Referer: 'https://embedhd.org/' },
    }).then(r => r.text());

    const fidMatch = fetchText.match(/fid\s*=\s*"([^"]+)"/);
    const fid = fidMatch ? fidMatch[1] : null;

    if (!fid) return res.json({ success: false, error: 'Could not extract fid' });

    // Extract m3u8
    const maestroText = await fetch(`${MAESTRO_URL}?player=desktop&live=${fid}`, {
      headers: { ...HEADERS, Referer: 'https://embedhd.org/' },
    }).then(r => r.text());

    // Method 1: char array join
    const arrays = [...maestroText.matchAll(/\[("(?:[^"]*)"(?:,"(?:[^"]*)")*)\]\.join\(\"\"\)/g)];
    for (const arr of arrays) {
      const chars = [...arr[1].matchAll(/"([^"]*)"/g)].map(m => m[1]);
      const url = chars.join('').replace(/\\\//g, '/');
      if (url.includes('.m3u8') && url.startsWith('http')) {
        return res.json({ success: true, m3u8: url, fid, hdId, referer: REFERER });
      }
    }

    // Method 2: direct m3u8 URL
    const direct = maestroText.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
    if (direct) {
      return res.json({ success: true, m3u8: direct[1], fid, hdId, referer: REFERER });
    }

    res.json({ success: false, error: 'Could not extract m3u8' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/embedhd/proxy?url=<m3u8_url>
router.get('/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const fetch = await import('node-fetch').then(m => m.default);
    const rangeHeader = req.headers['range'];
    const fetchHeaders = { ...HEADERS, Referer: REFERER };
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

    const upstream = await fetch(url, { headers: fetchHeaders });
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Upstream error' });

    const ct = upstream.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    res.setHeader('Content-Type', ct);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');
    if (upstream.headers.get('content-length')) res.setHeader('Content-Length', upstream.headers.get('content-length'));
    if (upstream.headers.get('content-range')) res.setHeader('Content-Range', upstream.headers.get('content-range'));

    if (url.includes('.m3u8')) {
      const text = await upstream.text();
      const base = url.substring(0, url.lastIndexOf('/') + 1);
      const host = `${req.protocol}://${req.get('host')}`;
      const rewritten = text.split('\n').map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        const abs = t.startsWith('http') ? t : base + t;
        return `${host}/api/embedhd/proxy?url=${encodeURIComponent(abs)}`;
      }).join('\n');
      return res.send(rewritten);
    }

    upstream.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
