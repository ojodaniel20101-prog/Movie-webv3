/**
 * Septorch Movies Route
 * Integrates with GZMovieBox API (gzmovieboxapi.septorch.tech)
 * Provides: movie search, streaming URLs, and download links
 *
 * Endpoints:
 *   GET /api/septorch/search?q={query}              - Search movies
 *   GET /api/septorch/streams?id={movie_id}&detailPath={path}  - Get stream URLs
 *   GET /api/septorch/download?id={movie_id}&detailPath={path}&quality={q} - Get download URL
 *   GET /api/septorch/details?id={movie_id}         - Get movie details
 */

const express = require('express');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const router = express.Router();

// =============================================================================
// CONFIGURATION
// =============================================================================

const SEPTORCH_BASE = 'https://gzmovieboxapi.septorch.tech';
const REQUEST_TIMEOUT = 25000; // ms

// =============================================================================
// HTTP REQUEST HELPER (native, no external deps)
// =============================================================================

function requestJson(method, path, queryParams = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SEPTORCH_BASE);
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const client = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Zentrix-Backend/1.0',
      },
      timeout: REQUEST_TIMEOUT,
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: json });
        } catch {
          resolve({ statusCode: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

// =============================================================================
// RESPONSE FORMATTERS
// =============================================================================

function formatSearchItem(item) {
  if (!item) return null;

  const cover = item.cover || {};
  const poster = typeof cover === 'object' ? (cover.url || '') : '';

  let year = null;
  const releaseDate = item.releaseDate || '';
  if (releaseDate) {
    try { year = parseInt(String(releaseDate).slice(0, 4), 10); } catch { /* ignore */ }
  }

  let genre = item.genre || [];
  if (typeof genre === 'string') {
    genre = genre.split(',').map(g => g.trim()).filter(Boolean);
  }

  return {
    id: item.subjectId || '',
    title: item.title || '',
    poster,
    year,
    rating: parseFloat(item.imdbRatingValue || 0) || 0,
    description: item.description || '',
    genre,
    duration: item.duration || 0,
    duration_formatted: item.duration ? `${Math.floor(item.duration / 3600)}h ${Math.floor((item.duration % 3600) / 60)}m` : '',
    country: item.countryName || '',
    imdb_rating: parseFloat(item.imdbRatingValue || 0) || 0,
    imdb_votes: item.imdbRatingCount || 0,
    subject_type: item.subjectType || 1, // 1 = movie, 2 = tv
    has_resource: item.hasResource || false,
    detail_path: item.detailPath || '',
    release_date: item.releaseDate || '',
  };
}

function formatMovieDetails(data) {
  const subject = data?.subject || data;
  if (!subject) return null;

  const cover = subject.cover || {};
  const poster = typeof cover === 'object' ? (cover.url || '') : '';

  let year = null;
  const releaseDate = subject.releaseDate || '';
  if (releaseDate) {
    try { year = parseInt(String(releaseDate).slice(0, 4), 10); } catch { /* ignore */ }
  }

  let genre = subject.genre || [];
  if (typeof genre === 'string') {
    genre = genre.split(',').map(g => g.trim()).filter(Boolean);
  }

  // Parse stars/cast
  const cast = [];
  const stars = subject.stars || [];
  for (const star of stars) {
    cast.push({
      name: star.name || '',
      character: star.character || '',
      avatar: star.avatarUrl || '',
    });
  }

  return {
    id: subject.subjectId || '',
    title: subject.title || '',
    poster,
    year,
    rating: parseFloat(subject.imdbRatingValue || 0) || 0,
    description: subject.description || '',
    genre,
    duration: subject.duration || 0,
    duration_formatted: subject.duration ? `${Math.floor(subject.duration / 3600)}h ${Math.floor((subject.duration % 3600) / 60)}m` : '',
    country: subject.countryName || '',
    imdb_rating: parseFloat(subject.imdbRatingValue || 0) || 0,
    imdb_votes: subject.imdbRatingCount || 0,
    subject_type: subject.subjectType || 1,
    has_resource: subject.hasResource || false,
    detail_path: subject.detailPath || '',
    release_date: subject.releaseDate || '',
    cast,
  };
}

function formatStreams(mediaData) {
  const downloads = mediaData?.data?.downloads?.data?.downloads || [];
  const captions = mediaData?.data?.downloads?.data?.captions || [];

  const streams = [];
  for (const dl of downloads) {
    const resolution = dl.resolution || 0;
    const quality = resolution ? `${resolution}p` : 'unknown';
    const sizeBytes = parseInt(dl.size || '0', 10);
    const sizeMb = sizeBytes > 0 ? (sizeBytes / (1024 * 1024)).toFixed(1) : '0';

    streams.push({
      quality,
      resolution,
      stream_url: dl.streamUrl || '',
      download_url: dl.downloadUrl || '',
      source_url: dl.sourceUrl || dl.url || '',
      size_mb: sizeMb,
      size_bytes: sizeBytes,
      id: dl.id || '',
    });
  }

  // Sort by resolution descending
  streams.sort((a, b) => (b.resolution || 0) - (a.resolution || 0));

  const subtitles = captions.map(cap => ({
    language: cap.lan || '',
    language_name: cap.lanName || '',
    url: cap.url || '',
  }));

  return { streams, subtitles };
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/septorch/search?q={query}
 * Search for movies and TV shows
 */
router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, perPage = 24, subjectType = 'ALL' } = req.query;

    if (!q || !String(q).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required',
      });
    }

    const response = await requestJson('GET', '/api/search', {
      query: String(q).trim(),
      subjectType: String(subjectType),
      page: String(page),
      perPage: String(perPage),
    });

    const items = response.data?.data?.items || [];
    const pager = response.data?.data?.pager || {};

    const results = items.map(formatSearchItem).filter(Boolean);

    return res.json({
      success: true,
      query: String(q).trim(),
      results,
      pagination: {
        page: parseInt(pager.page || '1', 10),
        per_page: parseInt(pager.perPage || '24', 10),
        total: parseInt(pager.totalCount || '0', 10),
        has_more: pager.hasMore || false,
        next_page: pager.nextPage || null,
      },
      source: 'septorch',
    });
  } catch (err) {
    console.error('[Septorch] Search error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Search failed: ' + (err.message || 'Unknown error'),
    });
  }
});

/**
 * GET /api/septorch/details?id={movie_id}
 * Get detailed movie/TV show information
 */
router.get('/details', async (req, res) => {
  try {
    const { id } = req.query;

    if (!id || !String(id).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "id" (subjectId) is required',
      });
    }

    const response = await requestJson('GET', '/api/item-details', {
      subjectId: String(id),
    });

    const details = formatMovieDetails(response.data?.data);

    if (!details) {
      return res.status(404).json({
        success: false,
        error: 'Movie/TV show not found',
      });
    }

    return res.json({
      success: true,
      data: details,
      source: 'septorch',
    });
  } catch (err) {
    console.error('[Septorch] Details error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get details: ' + (err.message || 'Unknown error'),
    });
  }
});

/**
 * GET /api/septorch/streams?id={movie_id}&detailPath={path}
 * Get streaming URLs for a movie (proxied through septorch)
 */
router.get('/streams', async (req, res) => {
  try {
    const { id, detailPath, season = 0, episode = 0 } = req.query;

    if (!id || !String(id).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "id" (subjectId) is required',
      });
    }

    // If detailPath not provided, fetch item details first
    let dp = detailPath;
    if (!dp) {
      try {
        const detailsRes = await requestJson('GET', '/api/item-details', {
          subjectId: String(id),
        });
        dp = detailsRes.data?.data?.subject?.detailPath || '';
      } catch (e) {
        console.log('[Septorch] Could not fetch detailPath:', e.message);
      }
    }

    if (!dp) {
      return res.status(400).json({
        success: false,
        error: 'detailPath is required and could not be resolved automatically',
      });
    }

    const response = await requestJson('GET', '/api/media', {
      subjectId: String(id),
      detailPath: String(dp),
      season: String(season),
      episode: String(episode),
    });

    const { streams, subtitles } = formatStreams(response.data);

    if (!streams.length) {
      return res.status(404).json({
        success: false,
        error: 'No streams found for this movie',
      });
    }

    return res.json({
      success: true,
      movie_id: String(id),
      detail_path: String(dp),
      streams,
      subtitles,
      source: 'septorch',
    });
  } catch (err) {
    console.error('[Septorch] Streams error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get streams: ' + (err.message || 'Unknown error'),
    });
  }
});

/**
 * GET /api/septorch/download?id={movie_id}&detailPath={path}&quality={quality}
 * Get download URL for a specific quality
 */
router.get('/download', async (req, res) => {
  try {
    const { id, detailPath, quality = '720p', season = 0, episode = 0 } = req.query;

    if (!id || !String(id).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Parameter "id" (subjectId) is required',
      });
    }

    // If detailPath not provided, fetch item details first
    let dp = detailPath;
    if (!dp) {
      try {
        const detailsRes = await requestJson('GET', '/api/item-details', {
          subjectId: String(id),
        });
        dp = detailsRes.data?.data?.subject?.detailPath || '';
      } catch (e) {
        console.log('[Septorch] Could not fetch detailPath:', e.message);
      }
    }

    if (!dp) {
      return res.status(400).json({
        success: false,
        error: 'detailPath is required and could not be resolved automatically',
      });
    }

    // Get media data to find the download URL for the requested quality
    const response = await requestJson('GET', '/api/media', {
      subjectId: String(id),
      detailPath: String(dp),
      season: String(season),
      episode: String(episode),
    });

    const { streams } = formatStreams(response.data);

    if (!streams.length) {
      return res.status(404).json({
        success: false,
        error: 'No download links found',
      });
    }

    // Find the requested quality, or default to best available
    const requestedQuality = String(quality);
    let selected = streams.find(s => s.quality === requestedQuality);
    if (!selected) {
      // Try to find closest quality
      const targetRes = parseInt(requestedQuality.replace('p', ''), 10) || 720;
      selected = streams.reduce((closest, current) => {
        const currentDiff = Math.abs((current.resolution || 0) - targetRes);
        const closestDiff = Math.abs((closest.resolution || 0) - targetRes);
        return currentDiff < closestDiff ? current : closest;
      }, streams[0]);
    }

    return res.json({
      success: true,
      movie_id: String(id),
      detail_path: String(dp),
      quality: selected.quality,
      download_url: selected.download_url,
      stream_url: selected.stream_url,
      source_url: selected.source_url,
      size_mb: selected.size_mb,
      source: 'septorch',
    });
  } catch (err) {
    console.error('[Septorch] Download error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get download URL: ' + (err.message || 'Unknown error'),
    });
  }
});

/**
 * GET /api/septorch/trending
 * Get trending movies and TV shows
 */
router.get('/trending', async (req, res) => {
  try {
    const { page = 1 } = req.query;

    const response = await requestJson('GET', '/api/trending', {
      page: String(page),
    });

    const items = response.data?.data?.items || response.data?.data || [];
    const results = Array.isArray(items) ? items.map(formatSearchItem).filter(Boolean) : [];

    return res.json({
      success: true,
      results,
      source: 'septorch',
    });
  } catch (err) {
    console.error('[Septorch] Trending error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get trending: ' + (err.message || 'Unknown error'),
    });
  }
});

/**
 * GET /api/septorch/health
 * Health check
 */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'septorch-movies',
    base_url: SEPTORCH_BASE,
  });
});

module.exports = router;
