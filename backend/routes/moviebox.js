/**
 * MovieBox Streaming Route
 * Provides movie search, details, and streaming URLs via MovieBox API
 * Uses Python scraper for DASH/HLS stream extraction
 *
 * Routes:
 *   GET  /api/moviebox/search?q={query}        - Search movies
 *   GET  /api/moviebox/details?id={movie_id}   - Get movie details
 *   GET  /api/moviebox/streams?id={movie_id}   - Get streaming URLs
 *   GET  /api/moviebox/download?id={movie_id}&quality={quality} - Get download URL
 *   GET  /api/moviebox/health                  - Health check
 */

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');

const SCRAPER_PATH = path.join(__dirname, 'moviebox_scraper.py');
const REQUEST_TIMEOUT = 30000; // 30 seconds

// ─── Helper: spawn Python scraper ────────────────────────────────────
function runScraper(action, args = []) {
  return new Promise((resolve, reject) => {
    const pythonArgs = [SCRAPER_PATH, action, ...args];
    const py = spawn('python3', pythonArgs, {
      timeout: REQUEST_TIMEOUT,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    py.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    py.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[MovieBox] Python scraper exited with code ${code}: ${stderr}`);
        // Try to parse stdout anyway (may have valid JSON before error)
      }
      try {
        // Find JSON in output (scraper may log debug info before/after JSON)
        const jsonMatch = stdout.match(/\{[\s\S]*\}/) || stdout.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          resolve(data);
        } else if (stdout.trim()) {
          // Try parsing the whole stdout
          const data = JSON.parse(stdout);
          resolve(data);
        } else {
          reject(new Error(stderr || 'No output from scraper'));
        }
      } catch (e) {
        reject(new Error(`Failed to parse scraper output: ${e.message}. stderr: ${stderr}`));
      }
    });

    py.on('error', (err) => {
      reject(new Error(`Failed to start Python scraper: ${err.message}`));
    });
  });
}

// ─── GET /api/moviebox/search?q={query} ──────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const { q, page = '1' } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    console.log(`[MovieBox] Searching: "${q}"`);
    const results = await runScraper('search', [
      '--query', q.trim(),
      '--no-fallback',
    ]);

    res.json({
      success: true,
      query: q.trim(),
      count: Array.isArray(results) ? results.length : 0,
      results: Array.isArray(results) ? results : [],
    });
  } catch (err) {
    console.error('[MovieBox] Search error:', err.message);
    // Return demo data on failure
    const demoMovies = getDemoMovies().filter(m =>
      m.title.toLowerCase().includes((req.query.q || '').toLowerCase())
    );
    res.json({
      success: true,
      query: req.query.q,
      count: demoMovies.length,
      results: demoMovies,
      source: 'demo_fallback',
    });
  }
});

// ─── GET /api/moviebox/details?id={movie_id} ─────────────────────────
router.get('/details', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'ID parameter is required' });
    }

    console.log(`[MovieBox] Getting details: ${id}`);
    const details = await runScraper('details', ['--id', String(id)]);

    res.json({
      success: true,
      ...details,
    });
  } catch (err) {
    console.error('[MovieBox] Details error:', err.message);
    const demo = getDemoMovies().find(m => m.id === req.query.id);
    if (demo) {
      res.json({ success: true, ...demo, source: 'demo_fallback' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── GET /api/moviebox/streams?id={movie_id} ─────────────────────────
router.get('/streams', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'ID parameter is required' });
    }

    console.log(`[MovieBox] Getting streams: ${id}`);
    const streams = await runScraper('streams', ['--id', String(id), '--no-fallback']);

    // Extract download URLs from streams for each quality
    const downloadOptions = [];
    if (streams.streams && Array.isArray(streams.streams)) {
      for (const stream of streams.streams) {
        const quality = stream.quality || 'unknown';
        const existing = downloadOptions.find(d => d.quality === quality);
        if (!existing) {
          downloadOptions.push({
            quality,
            url: stream.url,
            type: stream.type || 'dash',
            codec: stream.codec || 'h264',
            bandwidth: stream.bandwidth || 0,
            size: stream.size || 0,
          });
        }
      }
    }

    res.json({
      success: true,
      movie_id: streams.movie_id || id,
      title: streams.title || '',
      streams: streams.streams || [],
      subtitles: streams.subtitles || [],
      download_options: downloadOptions,
      streaming_format: streams.streaming_format || 'dash',
      source: streams.source || 'api',
    });
  } catch (err) {
    console.error('[MovieBox] Streams error:', err.message);
    // Return demo streams
    const demo = getDemoMovies().find(m => m.id === req.query.id);
    if (demo) {
      res.json({
        success: true,
        movie_id: req.query.id,
        title: demo.title,
        streams: demo.streams || [],
        subtitles: demo.subtitles || [],
        download_options: (demo.streams || []).map(s => ({
          quality: s.quality,
          url: s.url,
          type: s.type || 'hls',
          codec: s.codec || 'h264',
          bandwidth: s.bandwidth || 0,
        })),
        streaming_format: 'hls',
        source: 'demo_fallback',
      });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── GET /api/moviebox/download?id={movie_id}&quality={quality} ──────
router.get('/download', async (req, res) => {
  try {
    const { id, quality = '720p' } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'ID parameter is required' });
    }

    console.log(`[MovieBox] Getting download URL: ${id} @ ${quality}`);

    // Reuse the streams endpoint to get download URLs
    const streams = await runScraper('streams', ['--id', String(id), '--no-fallback']);

    if (!streams.streams || !Array.isArray(streams.streams) || streams.streams.length === 0) {
      return res.status(404).json({ error: 'No streams available for this movie' });
    }

    // Find the requested quality, or closest match
    let selectedStream = streams.streams.find(
      s => (s.quality || '').toLowerCase() === (quality || '').toLowerCase()
    );

    // Fallback: pick the highest quality available
    if (!selectedStream) {
      selectedStream = streams.streams.reduce((best, current) => {
        const bestHeight = parseInt(best.height || best.quality?.replace('p', '') || 0);
        const currentHeight = parseInt(current.height || current.quality?.replace('p', '') || 0);
        return currentHeight > bestHeight ? current : best;
      }, streams.streams[0]);
    }

    res.json({
      success: true,
      movie_id: streams.movie_id || id,
      title: streams.title || '',
      quality: selectedStream.quality || quality,
      url: selectedStream.url,
      type: selectedStream.type || 'dash',
      codec: selectedStream.codec || 'h264',
      bandwidth: selectedStream.bandwidth || 0,
      cookie_string: selectedStream.cookie_string || '',
      headers: {
        'Referer': 'https://h5-api.aoneroom.com/',
        'Origin': 'https://h5-api.aoneroom.com',
      },
    });
  } catch (err) {
    console.error('[MovieBox] Download error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/moviebox/health ────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    await runScraper('search', ['--query', 'Avatar']);
    res.json({ status: 'ok', service: 'MovieBox' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// ─── Demo movies for fallback ────────────────────────────────────────
function getDemoMovies() {
  return [
    {
      id: '1008009424004338096',
      title: 'Avatar',
      poster: 'https://image.tmdb.org/t/p/w500/kyeqWdyUXW608qlYkRqosgbbJyK.jpg',
      year: 2009,
      rating: 7.9,
      description: 'In the 22nd century, a paraplegic Marine is dispatched to the moon Pandora on a unique mission, but becomes torn between following orders and protecting the world he feels is his home.',
      genre: ['Action', 'Adventure', 'Fantasy', 'Sci-Fi'],
      duration: '2h 42m',
      streams: [
        { quality: '1080p', url: 'https://demo-stream.moviebox.ph/avatar/master.m3u8', type: 'hls', codec: 'h264', bandwidth: 4500000 },
        { quality: '720p', url: 'https://demo-stream.moviebox.ph/avatar/720p.m3u8', type: 'hls', codec: 'h264', bandwidth: 2500000 },
        { quality: '480p', url: 'https://demo-stream.moviebox.ph/avatar/480p.m3u8', type: 'hls', codec: 'h264', bandwidth: 1000000 },
        { quality: '360p', url: 'https://demo-stream.moviebox.ph/avatar/360p.m3u8', type: 'hls', codec: 'h264', bandwidth: 600000 },
      ],
      subtitles: [{ language: 'en', url: 'https://demo-stream.moviebox.ph/avatar/en.vtt' }],
    },
    {
      id: '1008009424004338098',
      title: 'Inception',
      poster: 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
      year: 2010,
      rating: 8.8,
      description: 'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.',
      genre: ['Action', 'Adventure', 'Sci-Fi', 'Thriller'],
      duration: '2h 28m',
      streams: [
        { quality: '1080p', url: 'https://demo-stream.moviebox.ph/inception/master.m3u8', type: 'hls', codec: 'h264', bandwidth: 4200000 },
        { quality: '720p', url: 'https://demo-stream.moviebox.ph/inception/720p.m3u8', type: 'hls', codec: 'h264', bandwidth: 2200000 },
        { quality: '480p', url: 'https://demo-stream.moviebox.ph/inception/480p.m3u8', type: 'hls', codec: 'h264', bandwidth: 900000 },
      ],
      subtitles: [],
    },
    {
      id: '1008009424004338099',
      title: 'The Matrix',
      poster: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
      year: 1999,
      rating: 8.7,
      description: 'When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth - the life he knows is the elaborate deception of an evil cyber-intelligence.',
      genre: ['Action', 'Sci-Fi'],
      duration: '2h 16m',
      streams: [
        { quality: '1080p', url: 'https://demo-stream.moviebox.ph/matrix/master.m3u8', type: 'hls', codec: 'h264', bandwidth: 4000000 },
        { quality: '720p', url: 'https://demo-stream.moviebox.ph/matrix/720p.m3u8', type: 'hls', codec: 'h264', bandwidth: 2000000 },
      ],
      subtitles: [],
    },
  ];
}

module.exports = router;
