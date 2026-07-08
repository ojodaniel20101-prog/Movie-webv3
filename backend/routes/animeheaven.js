const express = require('express');
const router = express.Router();
const { JSDOM } = require('jsdom');

const BASE_URL = 'https://animeheaven.me';
const SEARCH_URL = `${BASE_URL}/search.php`;
const GATE_URL = `${BASE_URL}/gate.php`;
const REQUEST_TIMEOUT = 20000;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

const VIDEO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
  'Referer': 'https://animeheaven.me/',
  'Range': 'bytes=0-1',
};

// Cache
const cache = {};
const CACHE_TTL = 60 * 60 * 1000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function extractUrlsFromGateHtml(html) {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  let streamUrl = null;
  let downloadUrl = null;

  const sourceTag = document.querySelector('video source');
  if (sourceTag) {
    const src = sourceTag.getAttribute('src');
    if (src && src.includes('.mp4')) {
      streamUrl = src.startsWith('http') ? src : `${BASE_URL}/${src}`;
    }
  }

  const downloadLink = document.querySelector('a[href*="video.mp4"]');
  if (downloadLink) {
    const href = downloadLink.getAttribute('href');
    if (href) {
      downloadUrl = href.startsWith('http') ? href : `${BASE_URL}/${href}`;
      if (!downloadUrl.includes('&d') && streamUrl) {
        downloadUrl = streamUrl.includes('&d') ? streamUrl : `${streamUrl}&d`;
      }
    }
  }

  if (!streamUrl) {
    const scriptTags = document.querySelectorAll('script');
    for (const script of scriptTags) {
      const content = script.textContent || '';
      const match = content.match(/(https?:\/\/[^\s"']+\.mp4[^\s"']*)/);
      if (match) {
        streamUrl = match[1];
        break;
      }
    }
  }

  return { streamUrl, downloadUrl };
}

// ─── Route: Search anime by title ───────────────────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q?.trim();
    if (!query) return res.status(400).json({ error: 'Query required' });

    const response = await fetchWithTimeout(SEARCH_URL, {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `searchquery=${encodeURIComponent(query)}`,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const results = [];
    const rows = document.querySelectorAll('table tbody tr');

    for (const row of rows) {
      const titleLink = row.querySelector('td:nth-child(1) a');
      if (!titleLink) continue;

      const title = titleLink.textContent?.trim() || '';
      const href = titleLink.getAttribute('href') || '';
      const match = href.match(/id=([a-zA-Z0-9_-]+)/);
      const id = match?.[1] || '';

      if (id && title) {
        results.push({
          id,
          title,
          url: `${BASE_URL}/anime.php?id=${id}`,
        });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error('[AnimeHeaven Search]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Route: Get episodes for anime ──────────────────────────────────────────
router.get('/episodes', async (req, res) => {
  try {
    const id = req.query.id?.trim();
    if (!id) return res.status(400).json({ error: 'ID required' });

    const cacheKey = `episodes_${id}`;
    if (cache[cacheKey] && Date.now() - cache[cacheKey].time < CACHE_TTL) {
      return res.json({ episodes: cache[cacheKey].data });
    }

    const animeUrl = `${BASE_URL}/anime.php?id=${encodeURIComponent(id)}`;
    const response = await fetchWithTimeout(animeUrl);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const episodes = [];
    const episodeLinks = document.querySelectorAll('a[href*="watch.php?"]');

    for (const link of episodeLinks) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent?.trim() || '';
      const epMatch = text.match(/(?:Ep|Episode)[.\\s]*(\\d+)/i);
      const number = epMatch?.[1] || text;

      if (href) {
        episodes.push({
          number,
          title: text,
          url: `${BASE_URL}/${href}`,
          ep_id: href,
        });
      }
    }

    cache[cacheKey] = { data: episodes, time: Date.now() };
    res.json({ episodes });
  } catch (err) {
    console.error('[AnimeHeaven Episodes]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Route: Get video source (stream or download) ────────────────────────────
router.get('/source', async (req, res) => {
  try {
    const url = req.query.url?.trim();
    const mode = req.query.mode || 'stream';

    if (!url) return res.status(400).json({ error: 'URL required' });

    const episodeUrl = url.startsWith('http') ? url : `${BASE_URL}/${url}`;
    const hashMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
    const episodeHash = hashMatch?.[1];

    let gateHtml = null;

    if (episodeHash) {
      try {
        const gateResponse = await fetchWithTimeout(`${GATE_URL}?id=${encodeURIComponent(episodeHash)}`, {
          headers: { ...BROWSER_HEADERS, 'Cookie': `key=${episodeHash}` },
        });
        if (gateResponse.ok) {
          gateHtml = await gateResponse.text();
        }
      } catch (err) {
        console.warn('[Gate Navigation] Failed');
      }
    }

    if (!gateHtml) {
      try {
        const episodeResponse = await fetchWithTimeout(episodeUrl);
        if (episodeResponse.ok) {
          gateHtml = await episodeResponse.text();
        }
      } catch (err) {
        throw new Error('Failed to fetch episode');
      }
    }

    if (!gateHtml) throw new Error('Could not fetch episode content');

    const { streamUrl, downloadUrl } = extractUrlsFromGateHtml(gateHtml);

    if (!streamUrl && !downloadUrl) {
      return res.status(404).json({
        success: false,
        error: 'No video URL found',
      });
    }

    const selectedUrl = mode === 'download' ? (downloadUrl || streamUrl) : (streamUrl || downloadUrl);

    res.json({
      success: true,
      url: selectedUrl,
      streamUrl,
      downloadUrl,
      mode,
      type: 'mp4',
    });
  } catch (err) {
    console.error('[AnimeHeaven Source]', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ─── Route: Stream proxy ────────────────────────────────────────────────────
router.get('/stream-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });

    const videoResponse = await fetchWithTimeout(url, { headers: VIDEO_HEADERS });

    if (!videoResponse.ok) {
      return res.status(videoResponse.status).json({ error: 'Stream unavailable' });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (videoResponse.headers.get('content-length')) {
      res.setHeader('Content-Length', videoResponse.headers.get('content-length'));
    }

    videoResponse.body.pipe(res);
  } catch (err) {
    console.error('[Stream Proxy]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Route: Download proxy ─────────────────────────────────────────────────
router.get('/download-proxy', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });

    const videoResponse = await fetchWithTimeout(url, { headers: VIDEO_HEADERS });

    if (!videoResponse.ok) {
      return res.status(videoResponse.status).json({ error: 'Download failed' });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'anime.mp4'}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (videoResponse.headers.get('content-length')) {
      res.setHeader('Content-Length', videoResponse.headers.get('content-length'));
    }

    videoResponse.body.pipe(res);
  } catch (err) {
    console.error('[Download Proxy]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
