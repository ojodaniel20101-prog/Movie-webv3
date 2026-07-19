const express = require('express');
const router  = express.Router();

const ANIME_SERVICE = process.env.ANIME_SERVICE_URL || 'https://anime-service-production.up.railway.app';

const AH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://animeheaven.me/',
};

async function getFetch() {
  return (await import('node-fetch')).default;
}

// ─── Search ───────────────────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const fetch = await getFetch();
    const resp = await fetch(`${ANIME_SERVICE}/search?q=${encodeURIComponent(q)}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Episodes ─────────────────────────────────────────────────────────────────
router.get('/episodes', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const fetch = await getFetch();
    const resp = await fetch(`${ANIME_SERVICE}/episodes?id=${encodeURIComponent(id)}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Source — search + get episodes + get video URL in one call ───────────────
router.get('/source', async (req, res) => {
  const { anime_id, episode, ep_id, title } = req.query;
  if (!episode) return res.status(400).json({ error: 'episode required' });

  try {
    const fetch = await getFetch();
    const host  = `${req.protocol}://${req.get('host')}`;
    let finalAnimeId = anime_id;
    let finalEpId    = ep_id;

    // If no anime_id, search by title
    if (!finalAnimeId && title) {
      const searchResp = await fetch(`${ANIME_SERVICE}/search?q=${encodeURIComponent(title)}`);
      const searchData = await searchResp.json();
      if (!searchData.results?.length) {
        return res.json({ success: false, error: 'Anime not found on AnimeHeaven' });
      }
      finalAnimeId = searchData.results[0].id;
    }

    if (!finalAnimeId) return res.status(400).json({ error: 'anime_id or title required' });

    // If no ep_id, get it from episodes list
    if (!finalEpId) {
      const epResp = await fetch(`${ANIME_SERVICE}/episodes?id=${encodeURIComponent(finalAnimeId)}`);
      const epData = await epResp.json();
      const epNum  = String(episode).padStart(2, '0');
      const ep     = epData.episodes?.find(e => e.number === epNum || e.number === String(episode))
                  || epData.episodes?.[parseInt(episode) - 1];
      finalEpId = ep?.ep_id || '';
    }

    // Get video URL from Python service
    const videoResp = await fetch(
      `${ANIME_SERVICE}/source?anime_id=${encodeURIComponent(finalAnimeId)}&episode=${episode}&ep_id=${encodeURIComponent(finalEpId)}`
    );
    const videoData = await videoResp.json();

    const rawStream = videoData.stream_url || videoData.video_url || videoData.streamUrl || null;

    if (!rawStream) {
      return res.json({ success: false, error: 'No video source found' });
    }

    const rawDownload = videoData.download_url || videoData.downloadUrl || rawStream;

    res.json({
      success:     true,
      streamUrl:   `${host}/api/anime/stream?url=${encodeURIComponent(rawStream)}`,
      downloadUrl: `${host}/api/anime/download?url=${encodeURIComponent(rawDownload)}`,
      rawStream,
      animeId:     finalAnimeId,
      epId:        finalEpId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stream proxy ─────────────────────────────────────────────────────────────
router.get('/stream', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const fetch = await getFetch();
    const rangeHeader = req.headers['range'];
    const fetchHeaders = { ...AH_HEADERS };
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

    const upstream = await fetch(url, { headers: fetchHeaders });

    res.status(rangeHeader ? 206 : upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    if (upstream.headers.get('content-length')) res.setHeader('Content-Length', upstream.headers.get('content-length'));
    if (upstream.headers.get('content-range'))  res.setHeader('Content-Range',  upstream.headers.get('content-range'));

    upstream.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Download proxy ───────────────────────────────────────────────────────────
router.get('/download', async (req, res) => {
  const { url, title = 'anime', episode = '1' } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const fetch    = await getFetch();
    const upstream = await fetch(url, { headers: AH_HEADERS });
    const ct       = upstream.headers.get('content-type') || 'video/mp4';
    const ext      = ct.includes('mp4') ? 'mp4' : 'mkv';
    const safe     = title.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_');
    const filename = `${safe}_EP${String(episode).padStart(2, '0')}.${ext}`;

    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (upstream.headers.get('content-length')) res.setHeader('Content-Length', upstream.headers.get('content-length'));

    upstream.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
