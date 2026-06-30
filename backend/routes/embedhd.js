const express = require('express');
const router  = express.Router();

const API_URL    = 'https://embedhd.org/api-event.php';
const FETCH_BASE = 'https://embedhd.org/source/fetch.php';
const MAESTRO    = 'https://exposestrat.com/maestrohd1.php';
const REFERER    = 'https://exposestrat.com/';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Cache
let matchCache = { data: null, lastFetch: 0 };
const CACHE_TTL = 60 * 1000;

async function getFetch() {
  return (await import('node-fetch')).default;
}

async function getText(url, referer = 'https://embedhd.org/') {
  const fetch = await getFetch();
  const resp = await fetch(url, {
    headers: { ...HEADERS, Referer: referer },
    timeout: 15000,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

async function getJson(url, referer = 'https://embedhd.org/') {
  const text = await getText(url, referer);
  return JSON.parse(text);
}

// ─── Fetch matches ────────────────────────────────────────────────
async function fetchMatches() {
  const now = Date.now();
  if (matchCache.data && now - matchCache.lastFetch < CACHE_TTL) {
    return matchCache.data;
  }

  const data = await getJson(API_URL);
  if (!data || !data.days) return [];

  const matches = [];
  for (const day of data.days) {
    for (const item of (day.items || [])) {
      matches.push({
        id:       item.id,
        title:    item.title || 'Unknown',
        home:     item.home_team || '',
        away:     item.away_team || '',
        homeLogo: item.home_logo || '',
        awayLogo: item.away_logo || '',
        league:   (item.league || '').toUpperCase(),
        category: item.category || '',
        status:   item.status || 'UNKNOWN',
        time:     item.ts_et ? new Date(item.ts_et * 1000).toISOString() : null,
        streams:  item.streams || [],
        source:   'embedhd',
      });
    }
  }

  // Sort: LIVE first, then UPCOMING
  matches.sort((a, b) => {
    const order = { LIVE: 0, UPCOMING: 1 };
    const ao = order[a.status] ?? 2;
    const bo = order[b.status] ?? 2;
    return ao - bo;
  });

  matchCache = { data: matches, lastFetch: now };
  return matches;
}

// ─── Extract fid from fetch.php ───────────────────────────────────
async function extractFid(hdId) {
  const text = await getText(`${FETCH_BASE}?hd=${hdId}`);
  const m = text.match(/fid\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

// ─── Extract m3u8 from maestrohd1.php ────────────────────────────
async function extractM3u8(fid) {
  const text = await getText(`${MAESTRO}?player=desktop&live=${fid}`, 'https://embedhd.org/');

  // Method 1: char array join pattern (obfuscated URL)
  const arrays = [...text.matchAll(/\[("(?:[^"]*)"(?:,"(?:[^"]*)")*)\]\.join\(""\)/g)];
  for (const arr of arrays) {
    const chars = [...arr[1].matchAll(/"([^"]*)"/g)].map(m => m[1]);
    const url = chars.join('').replace(/\\\//g, '/');
    if (url.includes('.m3u8') && url.startsWith('http')) return url;
  }

  // Method 2: direct m3u8 URL
  const direct = text.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
  if (direct) return direct[1];

  return null;
}

// ─── Routes ───────────────────────────────────────────────────────

// GET /api/embedhd/matches
router.get('/matches', async (req, res) => {
  try {
    const matches = await fetchMatches();
    const live     = matches.filter(m => m.status === 'LIVE');
    const upcoming = matches.filter(m => m.status === 'UPCOMING');
    const other    = matches.filter(m => !['LIVE','UPCOMING'].includes(m.status));
    res.json({ success: true, count: matches.length, live: live.length, matches: [...live, ...upcoming, ...other] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/embedhd/stream?id=<match_id>&stream_index=0
router.get('/stream', async (req, res) => {
  const { id, stream_index = 0 } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const matches = await fetchMatches();
    const match = matches.find(m => String(m.id) === String(id));
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const streams = match.streams;
    if (!streams.length) return res.json({ success: false, error: 'No streams available' });

    const stream = streams[Math.min(parseInt(stream_index), streams.length - 1)];
    const hdId   = stream.hd;

    // Step 1: Get fid
    const fid = await extractFid(hdId);
    if (!fid) return res.json({ success: false, error: 'Could not extract fid' });

    // Step 2: Get m3u8
    const m3u8 = await extractM3u8(fid);
    if (!m3u8) return res.json({ success: false, error: 'Could not extract m3u8' });

    const host = `${req.protocol}://${req.get('host')}`;
    res.json({
      success:     true,
      m3u8,
      fid,
      hdId,
      referer:     REFERER,
      streamUrl:   `${host}/api/embedhd/proxy?url=${encodeURIComponent(m3u8)}`,
      streamCount: streams.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/embedhd/proxy?url=<m3u8_url> — stream proxy with correct Referer
router.get('/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const fetch = await getFetch();
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
    if (upstream.headers.get('content-range'))  res.setHeader('Content-Range', upstream.headers.get('content-range'));

    if (url.includes('.m3u8')) {
      const text  = await upstream.text();
      const base  = url.substring(0, url.lastIndexOf('/') + 1);
      const host  = `${req.protocol}://${req.get('host')}`;
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
