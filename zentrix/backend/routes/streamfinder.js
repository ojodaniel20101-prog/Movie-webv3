/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STREAM FINDER — Sports Streaming Link Extractor
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Extracts direct m3u8/stream URLs from various sport streaming sources.
 *
 * Sources:
 *   - Cineverse (cinverse.com.ng) — Primary
 *   - EmbedHD (embedhd.org) — Fallback (currently SSL-down)
 *   - MovieBox Sports (moviebox.pk) — Alternative
 *
 * Usage:
 *   const { extractStream } = require('./streamfinder');
 *   const stream = await extractStream('cinverse', 'cv-123456...');
 */

const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

// ─── Config ─────────────────────────────────────────────────────────────────

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Cineverse session cache
let cineverseSession = null;
let cineverseSessionExpiry = 0;
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Cineverse Session Manager ──────────────────────────────────────────────

async function getCineverseSession() {
  const now = Date.now();
  if (cineverseSession && now - cineverseSessionExpiry < SESSION_TTL) {
    return cineverseSession;
  }

  try {
    const resp = await fetch('https://cinverse.com.ng/football', {
      headers: HEADERS,
      redirect: 'follow',
    });

    const cookies = resp.headers.raw()['set-cookie'];
    const cookieStr = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';

    // Extract _cvt cookie
    const cvtMatch = cookieStr.match(/_cvt=[^;]+/);
    const cvt = cvtMatch ? cvtMatch[0] : '';

    cineverseSession = {
      cookies: cookieStr,
      cvt,
    };
    cineverseSessionExpiry = now;
    return cineverseSession;
  } catch (err) {
    // Return last known session or empty
    return cineverseSession || { cookies: '', cvt: '' };
  }
}

// ─── Cineverse Stream Extraction ────────────────────────────────────────────

async function extractCineverseStream(matchId) {
  const session = await getCineverseSession();

  try {
    // Step 1: Get match details with stream token
    const matchResp = await fetch(
      `https://cinverse.com.ng/api/football/match/${matchId}`,
      {
        headers: {
          ...HEADERS,
          'Accept': 'application/json',
          'Referer': `https://cinverse.com.ng/match/${matchId}`,
          'Cookie': session.cookies,
        },
      }
    );

    if (!matchResp.ok) {
      return { success: false, error: `Match API returned ${matchResp.status}` };
    }

    const matchData = await matchResp.json();

    // If there's a direct stream URL already
    if (matchData.directStreamUrl) {
      return {
        success: true,
        source: 'cinverse',
        matchId,
        directStreamUrl: matchData.directStreamUrl,
        embedUrl: matchData.embedUrl,
        streamToken: matchData.streamToken,
        streamPath: matchData.streamPath,
        provider: matchData.provider,
      };
    }

    // Step 2: Try the stream endpoint with token
    if (matchData.streamToken && matchData.streamPath) {
      const streamUrl = `https://cinverse.com.ng${matchData.streamPath}`;
      const streamResp = await fetch(streamUrl, {
        headers: {
          ...HEADERS,
          'Accept': 'application/json, text/html',
          'Referer': `https://cinverse.com.ng/match/${matchId}`,
          'Cookie': session.cookies,
        },
        redirect: 'manual',
      });

      // If it's a redirect, the Location header has the m3u8
      if (streamResp.status >= 300 && streamResp.status < 400) {
        const location = streamResp.headers.get('location');
        if (location) {
          return {
            success: true,
            source: 'cinverse',
            matchId,
            directStreamUrl: location,
            embedUrl: matchData.embedUrl,
            streamToken: matchData.streamToken,
            streamPath: matchData.streamPath,
            provider: matchData.provider,
          };
        }
      }
    }

    // Step 3: Check sources list
    if (matchData.sources && matchData.sources.length > 0) {
      const source = matchData.sources[0];
      return {
        success: true,
        source: 'cinverse',
        matchId,
        directStreamUrl: source.url || source.streamUrl || null,
        embedUrl: matchData.embedUrl,
        sources: matchData.sources,
        streamToken: matchData.streamToken,
        provider: matchData.provider,
      };
    }

    // Step 4: Return match info with embed URL if available
    return {
      success: true,
      source: 'cinverse',
      matchId,
      hasStream: false,
      status: 'stream_not_yet_available',
      embedUrl: matchData.embedUrl,
      streamToken: matchData.streamToken,
      streamPath: matchData.streamPath,
      provider: matchData.provider,
      message: 'Match found but stream not yet available (match may not be live yet)',
    };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── EmbedHD Stream Extraction (Fallback — currently broken) ─────────────────

const EMBEDHD_API = 'https://embedhd.org/api-event.php';
const FETCH_BASE = 'https://embedhd.org/source/fetch.php';
const MAESTRO_URL = 'https://exposestrat.com/maestrohd1.php';
const REFERER = 'https://exposestrat.com/';

async function extractEmbedhdStream(matchId, streamIndex = 0) {
  try {
    // Fetch matches
    const resp = await fetch(EMBEDHD_API, {
      headers: { ...HEADERS, Referer: 'https://embedhd.org/' },
      timeout: 15000,
    });

    if (!resp.ok) {
      return { success: false, error: `EmbedHD API returned ${resp.status}` };
    }

    const data = await resp.json();
    if (!data || !data.days) {
      return { success: false, error: 'Invalid EmbedHD response' };
    }

    // Find match
    let match = null;
    for (const day of data.days) {
      for (const item of (day.items || [])) {
        if (String(item.id) === String(matchId)) {
          match = item;
          break;
        }
      }
      if (match) break;
    }

    if (!match) {
      return { success: false, error: 'Match not found on EmbedHD' };
    }

    const streams = match.streams || [];
    if (!streams.length) {
      return { success: false, error: 'No streams available on EmbedHD' };
    }

    const stream = streams[Math.min(parseInt(streamIndex), streams.length - 1)];
    const hdId = stream.hd;

    // Extract fid from fetch.php
    const fetchResp = await fetch(`${FETCH_BASE}?hd=${hdId}`, {
      headers: { ...HEADERS, Referer: 'https://embedhd.org/' },
    });
    const fetchText = await fetchResp.text();
    const fidMatch = fetchText.match(/fid\s*=\s*"([^"]+)"/);
    const fid = fidMatch ? fidMatch[1] : null;

    if (!fid) {
      return { success: false, error: 'Could not extract fid from EmbedHD' };
    }

    // Extract m3u8 from maestrohd1.php
    const maestroResp = await fetch(`${MAESTRO_URL}?player=desktop&live=${fid}`, {
      headers: { ...HEADERS, Referer: 'https://embedhd.org/' },
    });
    const maestroText = await maestroResp.text();

    // Method 1: char array join pattern (obfuscated URL)
    const arrays = [...maestroText.matchAll(/\[("(?:[^"]*)"(?:,"(?:[^"]*)")*)\]\.join\(\"\"\)/g)];
    for (const arr of arrays) {
      const chars = [...arr[1].matchAll(/"([^"]*)"/g)].map(m => m[1]);
      const url = chars.join('').replace(/\\\//g, '/');
      if (url.includes('.m3u8') && url.startsWith('http')) {
        return {
          success: true,
          source: 'embedhd',
          matchId,
          directStreamUrl: url,
          fid,
          hdId,
          referer: REFERER,
        };
      }
    }

    // Method 2: direct m3u8 URL
    const direct = maestroText.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
    if (direct) {
      return {
        success: true,
        source: 'embedhd',
        matchId,
        directStreamUrl: direct[1],
        fid,
        hdId,
        referer: REFERER,
      };
    }

    return { success: false, error: 'Could not extract m3u8 from EmbedHD' };

  } catch (err) {
    return { success: false, error: `EmbedHD error: ${err.message}` };
  }
}

// ─── Main Extractor ─────────────────────────────────────────────────────────

async function extractStream(source, matchId, options = {}) {
  switch (source) {
    case 'cinverse':
    case 'cineverse':
      return extractCineverseStream(matchId);

    case 'embedhd':
      return extractEmbedhdStream(matchId, options.streamIndex);

    default:
      return { success: false, error: `Unknown source: ${source}` };
  }
}

// ─── Stream Proxy ───────────────────────────────────────────────────────────

async function proxyStream(req, res, streamUrl) {
  if (!streamUrl) {
    return res.status(400).json({ error: 'No stream URL provided' });
  }

  try {
    const rangeHeader = req.headers['range'];
    const fetchHeaders = {
      ...HEADERS,
      'Referer': 'https://cinverse.com.ng/',
    };
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

    const upstream = await fetch(streamUrl, { headers: fetchHeaders });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({ error: 'Upstream stream error' });
    }

    const ct = upstream.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    res.setHeader('Content-Type', ct);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');
    if (upstream.headers.get('content-length')) {
      res.setHeader('Content-Length', upstream.headers.get('content-length'));
    }
    if (upstream.headers.get('content-range')) {
      res.setHeader('Content-Range', upstream.headers.get('content-range'));
    }

    // If it's an m3u8, rewrite relative URLs to absolute proxy URLs
    if (streamUrl.includes('.m3u8') && !rangeHeader) {
      const text = await upstream.text();
      const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
      const host = `${req.protocol}://${req.get('host')}`;
      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const absUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
        return `${host}/api/sports/stream-proxy?url=${encodeURIComponent(absUrl)}`;
      }).join('\n');
      return res.send(rewritten);
    }

    // Pipe through for non-m3u8
    upstream.body.pipe(res);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  extractStream,
  proxyStream,
  getCineverseSession,
  extractCineverseStream,
  extractEmbedhdStream,
};
