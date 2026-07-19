const express = require('express');
const router = express.Router();

const VPS_PROXY = 'http://13.49.175.49:5001';

async function proxyFetch(url) {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  const res = await fetch(url, { timeout: 30000 });
  return res.json();
}

router.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query required' });
  try {
    const data = await proxyFetch(`${VPS_PROXY}/search?q=${encodeURIComponent(query)}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/episodes', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'ID required' });
  try {
    const data = await proxyFetch(`${VPS_PROXY}/episodes?id=${encodeURIComponent(id)}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/stream', async (req, res) => {
  const { animeId, epNumber, epId } = req.query;
  try {
    const data = await proxyFetch(`${VPS_PROXY}/source?anime_id=${animeId}&episode=${epNumber}&ep_id=${epId}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

// Video proxy to bypass CORS
router.get('/proxy-stream', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://animeheaven.me/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Length', response.headers.get('content-length') || '');
    response.body.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Video proxy to bypass CORS
router.get('/proxy-stream', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://animeheaven.me/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Length', response.headers.get('content-length') || '');
    response.body.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
