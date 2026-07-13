/**
 * MovieBox Streaming Route — Pure JavaScript (NO PYTHON)
 * Provides movie search, details, and streaming URLs via MovieBox API
 * All crypto signing, API calls, and MPD parsing done in pure JS.
 *
 * Endpoints:
 *   GET  /api/moviebox/search?q={query}                    - Search movies
 *   GET  /api/moviebox/details?id={movie_id}               - Get movie details
 *   GET  /api/moviebox/streams?id={movie_id}               - Get streaming URLs
 *   GET  /api/moviebox/download?id={movie_id}&quality={q}  - Get download URL
 *   GET  /api/moviebox/health                              - Health check
 */

const express = require('express');
const crypto  = require('crypto');
const { URL, URLSearchParams } = require('url');
const https   = require('https');
const http    = require('http');

const router = express.Router();

// =============================================================================
// CONSTANTS (mirrored from Python scraper)
// =============================================================================

const HOST_POOL = [
  'https://api6.aoneroom.com',
  'https://api5.aoneroom.com',
  'https://api4.aoneroom.com',
  'https://api4sg.aoneroom.com',
  'https://api3.aoneroom.com',
  'https://api6sg.aoneroom.com',
  'https://api.inmoviebox.com',
];

const SECRET_KEY_DEFAULT = '76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O';
const SECRET_KEY_ALT     = 'Xqn2nnO41/L92o1iuXhSLHTbXvY4Z5ZZ62m8mSLA';

const SIGNATURE_BODY_MAX_BYTES = 102_400;
const RETRY_STATUS_CODES = new Set([403, 407, 429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT    = 25_000; // ms
const SEARCH_PER_PAGE_LIMIT = 20;

// =============================================================================
// CRYPTO / SIGNING (exact port from Python)
// =============================================================================

function md5Hex(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

function b64Decode(value) {
  const padding = (4 - (value.length % 4)) % 4;
  return Buffer.from(value + '='.repeat(padding), 'base64');
}

function b64Encode(data) {
  return Buffer.from(data).toString('base64');
}

function generateXClientToken(timestampMs) {
  const ts = String(timestampMs ?? Date.now());
  const reversedTs = ts.split('').reverse().join('');
  const hashVal = md5Hex(Buffer.from(reversedTs));
  return `${ts},${hashVal}`;
}

function sortedQueryString(urlStr) {
  const parsed = new URL(urlStr);
  const keys = [...parsed.searchParams.keys()].sort();
  if (!keys.length) return '';
  const parts = [];
  for (const key of keys) {
    const values = parsed.searchParams.getAll(key);
    for (const value of values) {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.join('&');
}

function buildCanonicalString(method, accept, contentType, urlStr, body, timestampMs) {
  const parsed = new URL(urlStr);
  const path = parsed.pathname || '';
  const query = sortedQueryString(urlStr);
  const canonicalUrl = query ? `${path}?${query}` : path;

  let bodyHash = '';
  let bodyLength = '';
  if (body != null) {
    const bodyBytes = Buffer.from(body, 'utf-8');
    const truncated = bodyBytes.slice(0, SIGNATURE_BODY_MAX_BYTES);
    bodyHash = md5Hex(truncated);
    bodyLength = String(bodyBytes.length);
  }

  return (
    `${method.toUpperCase()}\n` +
    `${accept || ''}\n` +
    `${contentType || ''}\n` +
    `${bodyLength}\n` +
    `${timestampMs}\n` +
    `${bodyHash}\n` +
    `${canonicalUrl}`
  );
}

function generateXTrSignature(method, accept, contentType, urlStr, body, useAltKey = false, timestampMs) {
  const ts = timestampMs ?? Date.now();
  const canonical = buildCanonicalString(method, accept, contentType, urlStr, body, ts);
  const secretB64 = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
  const secretBytes = b64Decode(secretB64);
  const mac = crypto.createHmac('md5', secretBytes).update(canonical, 'utf-8').digest();
  const sigB64 = b64Encode(mac);
  return `${ts}|2|${sigB64}`;
}

function randomHex(length) {
  return Array.from({ length }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

function generateClientInfo() {
  const androidVersions = [
    { version: '13', build: 'TQ2A.230405.003' },
    { version: '12', build: 'S1B.220414.015' },
    { version: '11', build: 'RP1A.200720.011' },
  ];
  const redmiDevices = [
    { model: '23078RKD5C', brand: 'Redmi' },
    { model: '2201117TY', brand: 'Redmi' },
    { model: '22101316G', brand: 'Redmi' },
  ];
  const versionCodes = [50020042, 50020043, 50020044, 50020045, 50020046];
  const networkTypes = ['NETWORK_WIFI', 'NETWORK_MOBILE'];
  const timezones = ['Asia/Kolkata', 'Asia/Shanghai', 'America/New_York', 'Europe/London'];

  const android = androidVersions[Math.floor(Math.random() * androidVersions.length)];
  const device  = redmiDevices[Math.floor(Math.random() * redmiDevices.length)];
  const versionCode = versionCodes[Math.floor(Math.random() * versionCodes.length)];
  const network = networkTypes[Math.floor(Math.random() * networkTypes.length)];
  const timezone = timezones[Math.floor(Math.random() * timezones.length)];
  const gaid = crypto.randomUUID();
  const deviceId = randomHex(32);

  const userAgent = (
    `com.community.oneroom/${versionCode} ` +
    `(Linux; U; Android ${android.version}; en_US; ` +
    `${device.model}; Build/${android.build}; Cronet/135.0.7012.3)`
  );

  const clientInfoObj = {
    package_name: 'com.community.oneroom',
    version_name: '3.0.03.0529.03',
    version_code: versionCode,
    os: 'android',
    os_version: android.version,
    install_ch: 'ps',
    device_id: deviceId,
    install_store: 'ps',
    gaid,
    brand: device.brand,
    model: device.model,
    system_language: 'en',
    net: network,
    region: 'US',
    timezone,
    sp_code: '40401',
    'X-Play-Mode': '2',
  };

  return { userAgent, clientInfo: JSON.stringify(clientInfoObj) };
}

function buildSignedHeaders(method, urlStr, opts = {}) {
  const {
    authToken = null,
    accept = 'application/json',
    contentType = 'application/json',
    body = null,
    includePlayMode = false,
    userAgent = '',
    clientInfo = '',
  } = opts;

  const ts = Date.now();
  const headers = {
    'User-Agent': userAgent,
    'Accept': accept,
    'Content-Type': contentType,
    'Connection': 'keep-alive',
    'X-Client-Token': generateXClientToken(ts),
    'x-tr-signature': generateXTrSignature(method, accept, contentType, urlStr, body, false, ts),
    'X-Client-Info': clientInfo,
    'X-Client-Status': '0',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (includePlayMode) {
    headers['X-Play-Mode'] = '2';
  }

  return headers;
}

// =============================================================================
// HTTP REQUEST HELPER (using native https module, no external deps)
// =============================================================================

function request(method, urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const { headers = {}, body = null, timeout = REQUEST_TIMEOUT } = opts;
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers,
      timeout,
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf-8'));
    }
    req.end();
  });
}

// =============================================================================
// MPD MANIFEST PARSER (pure JS, no Python xml.etree needed)
// =============================================================================

function parseMpdManifest(mpdXml) {
  const streams = [];
  try {
    // Extract all AdaptationSet elements with contentType="video"
    const adaptSets = mpdXml.match(/<AdaptationSet[^>]*contentType=["']video["'][^>]*>[\s\S]*?<\/AdaptationSet>/gi) || [];
    for (const adaptSet of adaptSets) {
      const reps = adaptSet.match(/<Representation[^>]*\/>|<Representation[\s\S]*?<\/Representation>/gi) || [];
      for (const rep of reps) {
        const bandwidth = parseInt((rep.match(/bandwidth=["'](\d+)["']/i) || [])[1] || '0', 10);
        const width     = parseInt((rep.match(/width=["'](\d+)["']/i) || [])[1] || '0', 10);
        const height    = parseInt((rep.match(/height=["'](\d+)["']/i) || [])[1] || '0', 10);
        const codecs    = (rep.match(/codecs=["']([^"']+)["']/i) || [])[1] || '';
        const mimeType  = (rep.match(/mimeType=["']([^"']+)["']/i) || [])[1] || '';

        const quality = height ? `${height}p` : 'unknown';

        streams.push({
          quality,
          bandwidth,
          width,
          height,
          codec: codecs,
          mime_type: mimeType,
        });
      }
    }
  } catch (e) {
    // ignore parse errors
  }
  return streams;
}

function parseMpdForStreams(mpdXml, dashUrl) {
  const streams = [];
  try {
    const repList = parseMpdManifest(mpdXml);
    for (const rep of repList) {
      const quality = rep.quality;
      const height  = rep.height;
      const bandwidth = rep.bandwidth;
      const codecs  = rep.codec;

      let codecName = 'h264';
      if (/hev|hvc|265/.test(codecs.toLowerCase())) codecName = 'hevc';
      else if (/av1/.test(codecs.toLowerCase())) codecName = 'av1';

      streams.push({
        quality,
        resolution: `${rep.width}x${height}`,
        bandwidth,
        codec: codecName,
        type: 'dash',
        format: 'mpd',
        url: dashUrl,
        manifest_url: dashUrl,
        height,
        width: rep.width,
      });
    }
    streams.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
  } catch (e) {
    // ignore
  }
  return streams;
}

// =============================================================================
// MOVIE BOX SCRAPER CLASS — Pure JavaScript
// =============================================================================

const API_PATHS = {
  mainPage:   '/wefeed-mobile-bff/tab-operating',
  search:     '/wefeed-mobile-bff/subject-api/search',
  searchV2:   '/wefeed-mobile-bff/subject-api/search/v2',
  subjectGet: '/wefeed-mobile-bff/subject-api/get',
  seasonInfo: '/wefeed-mobile-bff/subject-api/season-info',
  playInfo:   '/wefeed-mobile-bff/subject-api/play-info',
  resource:   '/wefeed-mobile-bff/subject-api/resource',
};

class MovieBoxScraper {
  constructor(opts = {}) {
    this.timeout = opts.timeout || REQUEST_TIMEOUT;
    this.maxRetries = opts.maxRetries || 3;
    this.useDemoFallback = opts.useDemoFallback !== false;
    this.parseMpd = opts.parseMpd !== false;
    this._hostPool = [...HOST_POOL];
    this._activeBase = this._hostPool[0];
    this._runtimeToken = null;
    this._initialized = false;
    const { userAgent, clientInfo } = generateClientInfo();
    this._userAgent = userAgent;
    this._clientInfo = clientInfo;
  }

  _signedHeaders(method, url, body = null, includePlayMode = false) {
    return buildSignedHeaders(method, url, {
      authToken: this._runtimeToken,
      body,
      includePlayMode,
      userAgent: this._userAgent,
      clientInfo: this._clientInfo,
    });
  }

  _absorbXUser(responseHeaders) {
    const xUser = responseHeaders['x-user'] || '';
    if (!xUser) return;
    try {
      const payload = JSON.parse(xUser);
      const token = payload.token || '';
      if (token) this._runtimeToken = token;
    } catch {
      // ignore
    }
  }

  async _initAuth() {
    if (this._initialized && this._runtimeToken) return;

    for (const base of this._hostPool) {
      const url = `${base}${API_PATHS.mainPage}?page=1&tabId=0&version=`;
      const headers = this._signedHeaders('GET', url);
      try {
        const res = await request('GET', url, { headers, timeout: this.timeout });
        this._absorbXUser(res.headers);
        if (this._runtimeToken) {
          this._initialized = true;
          this._activeBase = base;
          return;
        }
      } catch {
        // try next host
      }
    }

    if (!this.useDemoFallback) {
      throw new Error('Unable to authenticate with any host');
    }
  }

  async _requestWithFallback(method, path, opts = {}) {
    const { params = null, jsonBody = null, includePlayMode = false } = opts;
    let fullPath = path;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      fullPath = `${path}?${qs}`;
    }

    const bodyStr = jsonBody ? JSON.stringify(jsonBody) : null;
    let lastError = null;

    for (const base of this._hostPool) {
      const url = `${base}${fullPath}`;
      const headers = this._signedHeaders(method, url, bodyStr, includePlayMode);

      try {
        const res = await request(method, url, {
          headers,
          body: bodyStr ? Buffer.from(bodyStr, 'utf-8') : null,
          timeout: this.timeout,
        });

        this._absorbXUser(res.headers);

        if (!RETRY_STATUS_CODES.has(res.statusCode)) {
          this._activeBase = base;
          const data = JSON.parse(res.body);
          const code = data.code ?? -1;
          if (code !== 0) {
            throw new Error(`API error: ${data.message || code}`);
          }
          return data.data ?? {};
        }

        lastError = new Error(`Host ${base} returned ${res.statusCode}`);
      } catch (err) {
        if (err.message && err.message.startsWith('API error:')) throw err;
        lastError = err;
        continue;
      }
    }

    throw new Error(`All hosts exhausted for ${path}. Last error: ${lastError?.message}`);
  }

  async _fetchMpd(url, cookies) {
    try {
      const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await request('GET', url, {
        headers: { 'Cookie': cookieStr },
        timeout: 30000,
      });
      if (res.statusCode === 200) return res.body;
    } catch {
      // ignore
    }
    return null;
  }

  // ── Parsers ────────────────────────────────────────────

  _parseSubject(subject) {
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

    return {
      id: subject.subjectId || '',
      title: subject.title || '',
      poster,
      year,
      rating: parseFloat(subject.imdbRatingValue || 0) || 0,
      description: subject.description || '',
      genre,
      duration: subject.duration || '',
      duration_seconds: subject.durationSeconds || 0,
      language: subject.language || [],
      country: subject.countryName || '',
      content_rating: subject.contentRating || '',
      subject_type: subject.subjectType || 1,
      has_resource: subject.hasResource || false,
      imdb_id: subject.opt || '',
    };
  }

  _parseDetail(data) {
    const cover = data.cover || {};
    const poster = typeof cover === 'object' ? (cover.url || '') : '';

    let year = null;
    const releaseDate = data.releaseDate || '';
    if (releaseDate) {
      try { year = parseInt(String(releaseDate).slice(0, 4), 10); } catch { /* ignore */ }
    }

    let genre = data.genre || [];
    if (typeof genre === 'string') {
      genre = genre.split(',').map(g => g.trim()).filter(Boolean);
    }

    const qualities = [];
    const detectors = data.resourceDetectors || [];
    for (const detector of detectors) {
      if (typeof detector !== 'object') continue;
      const resList = detector.resolutionList || [];
      for (const res of resList) {
        if (typeof res !== 'object') continue;
        qualities.push({
          quality: `${res.resolution || 0}p`,
          resolution: res.resolution || 0,
          codec: res.codecName || '',
          episodes: res.epNum || 0,
        });
      }
    }

    return {
      id: data.subjectId || '',
      title: data.title || '',
      poster,
      year,
      rating: parseFloat(data.imdbRatingValue || 0) || 0,
      description: data.description || '',
      genre,
      duration: data.duration || '',
      duration_seconds: data.durationSeconds || 0,
      language: data.language || [],
      country: data.countryName || '',
      content_rating: data.contentRating || '',
      subject_type: data.subjectType || 1,
      seasons: data.seNum || 0,
      viewers: data.viewers || 0,
      available_qualities: qualities,
      aka: data.aka || '',
      subtitles: data.subtitles || [],
      dubs: data.dubs || [],
    };
  }

  async _parsePlayStreams(playData) {
    const streams = [];
    const meta = {
      title: playData.title || '',
      subject_type: 1,
      total_episodes: 0,
    };

    const streamList = playData.streams || [];
    if (!Array.isArray(streamList)) return [streams, meta];

    for (const stream of streamList) {
      if (typeof stream !== 'object') continue;

      const streamFormat = (stream.format || '').toUpperCase();
      const streamUrl    = String(stream.url || '');
      const resolutions  = stream.resolutions || '';
      const codecName    = stream.codecName || '';
      const duration     = stream.duration || 0;
      const size         = stream.size || 0;
      const streamId     = stream.id || '';
      const signCookie   = stream.signCookie || '';

      if (!streamUrl) continue;

      // Parse cookies
      const cookies = {};
      for (const part of signCookie.split(';')) {
        const trimmed = part.trim();
        if (trimmed.includes('=')) {
          const [k, ...v] = trimmed.split('=');
          cookies[k.trim()] = v.join('=').trim();
        }
      }

      if (streamFormat === 'DASH' || streamUrl.endsWith('.mpd')) {
        if (this.parseMpd) {
          const mpdXml = await this._fetchMpd(streamUrl, cookies);
          if (mpdXml) {
            const mpdStreams = parseMpdForStreams(mpdXml, streamUrl);
            for (const ms of mpdStreams) {
              ms.cookies = cookies;
              ms.cookie_string = signCookie;
              ms.duration = duration;
              ms.size = size;
              ms.stream_id = streamId;
              ms.format = 'DASH';
              ms.manifest_type = 'mpd';
            }
            streams.push(...mpdStreams);
          } else {
            streams.push(...this._streamsFromResolutions(
              resolutions, streamUrl, codecName, duration, size, streamId, cookies, signCookie
            ));
          }
        } else {
          streams.push(...this._streamsFromResolutions(
            resolutions, streamUrl, codecName, duration, size, streamId, cookies, signCookie
          ));
        }
      } else if (streamFormat === 'HLS' || streamUrl.includes('.m3u8')) {
        const quality = extractQualityFromUrl(streamUrl) || 'auto';
        streams.push({
          quality,
          url: streamUrl,
          type: 'hls',
          format: 'm3u8',
          codec: codecName || 'h264',
          duration,
          size,
          stream_id: streamId,
          cookies,
          cookie_string: signCookie,
        });
      } else if (streamUrl.endsWith('.mp4')) {
        const quality = extractQualityFromUrl(streamUrl) || 'unknown';
        streams.push({
          quality,
          url: streamUrl,
          type: 'mp4',
          format: 'mp4',
          codec: codecName || 'h264',
          duration,
          size,
          stream_id: streamId,
          cookies,
          cookie_string: signCookie,
        });
      }
    }

    streams.sort((a, b) => {
      const ah = a.height || parseInt((a.quality || '0').replace('p', ''), 10) || 0;
      const bh = b.height || parseInt((b.quality || '0').replace('p', ''), 10) || 0;
      return bh - ah;
    });

    return [streams, meta];
  }

  _streamsFromResolutions(resolutions, manifestUrl, codecName, duration, size, streamId, cookies, cookieString) {
    const result = [];
    if (!resolutions) return result;

    const codec = codecName || 'hevc';
    for (const res of resolutions.split(',')) {
      const r = res.trim();
      if (!r || !/^\d+$/.test(r)) continue;
      const height = parseInt(r, 10);
      const quality = `${height}p`;

      result.push({
        quality,
        resolution: `?x${height}`,
        url: manifestUrl,
        type: 'dash',
        format: 'mpd',
        codec,
        height,
        bandwidth: 0,
        duration,
        size,
        stream_id: streamId,
        cookies,
        cookie_string: cookieString,
      });
    }

    return result;
  }

  _parseSubtitles(resourceData) {
    const subtitles = [];
    const extCaptions = resourceData.extCaptions || [];
    if (Array.isArray(extCaptions)) {
      for (const cap of extCaptions) {
        if (typeof cap !== 'object') continue;
        subtitles.push({
          language: cap.lan || '',
          language_name: cap.lanName || '',
          url: String(cap.url || ''),
          size: cap.size || 0,
        });
      }
    }
    return subtitles;
  }

  // ── Demo / Fallback Data ───────────────────────────────

  _demoSearch(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const movie of DEMO_MOVIES) {
      if (
        movie.title.toLowerCase().includes(q) ||
        (movie.genre || []).some(g => g.toLowerCase().includes(q))
      ) {
        results.push({
          id: movie.id,
          title: movie.title,
          poster: movie.poster,
          year: movie.year,
          rating: movie.rating,
          description: movie.description,
          genre: movie.genre,
          duration: movie.duration,
          duration_seconds: 0,
          language: movie.language,
          country: movie.country,
          content_rating: movie.content_rating,
          subject_type: 1,
          has_resource: true,
          imdb_id: '',
          source: 'demo_fallback',
        });
      }
    }
    return results;
  }

  _demoGetById(movieId) {
    for (const movie of DEMO_MOVIES) {
      if (movie.id === movieId) {
        return {
          id: movie.id,
          title: movie.title,
          poster: movie.poster,
          year: movie.year,
          rating: movie.rating,
          description: movie.description,
          genre: movie.genre,
          duration: movie.duration,
          duration_seconds: 0,
          language: movie.language,
          country: movie.country,
          content_rating: movie.content_rating,
          subject_type: 1,
          seasons: 0,
          viewers: 0,
          available_qualities: (movie.streams || []).map(s => ({
            quality: s.quality,
            resolution: parseInt(s.quality.replace('p', ''), 10),
            codec: s.codec,
            episodes: 1,
          })),
          aka: '',
          subtitles: movie.subtitles || [],
          dubs: [],
          streams: movie.streams || [],
          source: 'demo_fallback',
        };
      }
    }
    return null;
  }

  // ── Public API ─────────────────────────────────────────

  async searchMovies(query, page = 1, perPage = SEARCH_PER_PAGE_LIMIT) {
    if (!query || !query.trim()) return [];
    const q = query.trim();

    try {
      await this._initAuth();

      const data = await this._requestWithFallback('POST', API_PATHS.searchV2, {
        jsonBody: {
          keyword: q,
          page,
          perPage,
          tabId: 'All',
        },
      });

      const items = [];
      const results = data.results || [];
      for (const group of results) {
        for (const subject of (group.subjects || [])) {
          const item = this._parseSubject(subject);
          if (item) items.push(item);
        }
      }

      return items;
    } catch (e) {
      if (this.useDemoFallback) return this._demoSearch(q);
      throw e;
    }
  }

  async getMovieDetails(movieId) {
    if (!movieId || !/^\d{17,21}$/.test(movieId)) {
      throw new Error(`Invalid movie_id: ${movieId}`);
    }

    try {
      await this._initAuth();
      const data = await this._requestWithFallback('GET', API_PATHS.subjectGet, {
        params: { subjectId: movieId },
      });
      return this._parseDetail(data);
    } catch (e) {
      if (this.useDemoFallback) {
        const demo = this._demoGetById(movieId);
        if (demo) return demo;
      }
      throw e;
    }
  }

  async getStreams(movieId, season = 0, episode = 0) {
    if (!movieId || !/^\d{17,21}$/.test(movieId)) {
      throw new Error(`Invalid movie_id: ${movieId}`);
    }

    try {
      await this._initAuth();

      const playData = await this._requestWithFallback('GET', API_PATHS.playInfo, {
        params: { subjectId: movieId, se: season, ep: episode },
      });

      const [streams, streamMeta] = await this._parsePlayStreams(playData);

      let subtitles = [];
      try {
        const resourceData = await this._requestWithFallback('GET', API_PATHS.resource, {
          params: { subjectId: movieId, se: season, ep: episode },
        });
        subtitles = this._parseSubtitles(resourceData);
      } catch {
        // ignore subtitle errors
      }

      let title = streamMeta.title || '';
      if (!title) {
        try {
          const details = await this.getMovieDetails(movieId);
          title = details.title || '';
        } catch {
          // ignore
        }
      }

      if (!streams.length && this.useDemoFallback) {
        const demo = this._demoGetById(movieId);
        if (demo) {
          return {
            movie_id: movieId,
            title: demo.title || title,
            subject_type: 1,
            streams: demo.streams || [],
            subtitles: demo.subtitles || [],
            streaming_format: 'hls',
            total_episodes: 0,
            source: 'demo_fallback',
          };
        }
      }

      return {
        movie_id: movieId,
        title,
        subject_type: streamMeta.subject_type || 1,
        streams,
        subtitles,
        streaming_format: 'dash',
        total_episodes: streamMeta.total_episodes || 0,
        source: 'api',
      };
    } catch (e) {
      if (this.useDemoFallback) {
        const demo = this._demoGetById(movieId);
        if (demo) {
          return {
            movie_id: movieId,
            title: demo.title || '',
            subject_type: 1,
            streams: demo.streams || [],
            subtitles: demo.subtitles || [],
            streaming_format: 'hls',
            total_episodes: 0,
            source: 'demo_fallback',
          };
        }
      }
      throw e;
    }
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function extractQualityFromUrl(url) {
  const patterns = [
    /[_-](\d{3,4})p[_-]?/i,
    /\/(\d{3,4})p\//i,
    /[_-](\d{3,4})[_-]/i,
  ];
  for (const pat of patterns) {
    const m = url.match(pat);
    if (m) return `${m[1]}p`;
  }
  return '';
}

// =============================================================================
// DEMO MOVIES (exact mirror of Python scraper)
// =============================================================================

const DEMO_MOVIES = [
  {
    id: '1008009424004338096',
    title: 'Avatar',
    poster: 'https://image.tmdb.org/t/p/w500/kyeqWdyUXW608qlYkRqosgbbJyK.jpg',
    year: 2009,
    rating: 7.9,
    description: 'In the 22nd century, a paraplegic Marine is dispatched to the moon Pandora on a unique mission, but becomes torn between following orders and protecting the world he feels is his home.',
    genre: ['Action', 'Adventure', 'Fantasy', 'Sci-Fi'],
    duration: '2h 42m',
    language: ['English', 'Spanish'],
    country: 'United States',
    content_rating: 'PG-13',
    streams: [
      { quality: '1080p', url: 'https://demo-stream.moviebox.ph/avatar/master.m3u8', type: 'hls', codec: 'h264', bandwidth: 4500000 },
      { quality: '720p',  url: 'https://demo-stream.moviebox.ph/avatar/720p.m3u8',  type: 'hls', codec: 'h264', bandwidth: 2500000 },
      { quality: '480p',  url: 'https://demo-stream.moviebox.ph/avatar/480p.m3u8',  type: 'hls', codec: 'h264', bandwidth: 1000000 },
      { quality: '360p',  url: 'https://demo-stream.moviebox.ph/avatar/360p.m3u8',  type: 'hls', codec: 'h264', bandwidth: 600000 },
    ],
    subtitles: [{ language: 'en', url: 'https://demo-stream.moviebox.ph/avatar/en.vtt' }],
  },
  {
    id: '1008009424004338097',
    title: 'Avatar: The Way of Water',
    poster: 'https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
    year: 2022,
    rating: 7.6,
    description: "Jake Sully lives with his newfound family formed on the extrasolar moon Pandora. Once a familiar threat returns to finish what was previously started, Jake must work with Neytiri and the army of the Na'vi race to protect their home.",
    genre: ['Action', 'Adventure', 'Fantasy', 'Sci-Fi'],
    duration: '3h 12m',
    language: ['English'],
    country: 'United States',
    content_rating: 'PG-13',
    streams: [
      { quality: '1080p', url: 'https://demo-stream.moviebox.ph/avatar2/master.m3u8', type: 'hls', codec: 'h264', bandwidth: 5000000 },
      { quality: '720p',  url: 'https://demo-stream.moviebox.ph/avatar2/720p.m3u8',  type: 'hls', codec: 'h264', bandwidth: 2800000 },
      { quality: '480p',  url: 'https://demo-stream.moviebox.ph/avatar2/480p.m3u8',  type: 'hls', codec: 'h264', bandwidth: 1200000 },
    ],
    subtitles: [],
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
    language: ['English', 'Japanese', 'French'],
    country: 'United States',
    content_rating: 'PG-13',
    streams: [
      { quality: '1080p', url: 'https://demo-stream.moviebox.ph/inception/master.m3u8', type: 'hls', codec: 'h264', bandwidth: 4200000 },
      { quality: '720p',  url: 'https://demo-stream.moviebox.ph/inception/720p.m3u8',  type: 'hls', codec: 'h264', bandwidth: 2200000 },
      { quality: '480p',  url: 'https://demo-stream.moviebox.ph/inception/480p.m3u8',  type: 'hls', codec: 'h264', bandwidth: 900000 },
      { quality: '360p',  url: 'https://demo-stream.moviebox.ph/inception/360p.m3u8',  type: 'hls', codec: 'h264', bandwidth: 500000 },
    ],
    subtitles: [
      { language: 'en', url: 'https://demo-stream.moviebox.ph/inception/en.vtt' },
      { language: 'es', url: 'https://demo-stream.moviebox.ph/inception/es.vtt' },
    ],
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
    language: ['English'],
    country: 'United States',
    content_rating: 'R',
    streams: [
      { quality: '1080p', url: 'https://demo-stream.moviebox.ph/matrix/master.m3u8', type: 'hls', codec: 'h264', bandwidth: 4000000 },
      { quality: '720p',  url: 'https://demo-stream.moviebox.ph/matrix/720p.m3u8',  type: 'hls', codec: 'h264', bandwidth: 2000000 },
    ],
    subtitles: [],
  },
  {
    id: '1008009424004338100',
    title: 'The Dark Knight',
    poster: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    year: 2008,
    rating: 9.0,
    description: 'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.',
    genre: ['Action', 'Crime', 'Drama', 'Thriller'],
    duration: '2h 32m',
    language: ['English', 'Mandarin'],
    country: 'United States',
    content_rating: 'PG-13',
    streams: [
      { quality: '1080p', url: 'https://demo-stream.moviebox.ph/tdk/master.m3u8', type: 'hls', codec: 'h264', bandwidth: 4500000 },
      { quality: '720p',  url: 'https://demo-stream.moviebox.ph/tdk/720p.m3u8',  type: 'hls', codec: 'h264', bandwidth: 2200000 },
    ],
    subtitles: [],
  },
];

// =============================================================================
// EXPRESS ROUTES
// =============================================================================

const scraper = new MovieBoxScraper({
  useDemoFallback: true,
  parseMpd: true,
  timeout: REQUEST_TIMEOUT,
  maxRetries: 3,
});

// ─── GET /api/moviebox/search?q={query} ──────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const { q, page = '1' } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    console.log(`[MovieBox] Searching: "${q}"`);
    const results = await scraper.searchMovies(q.trim(), parseInt(page, 10));

    res.json({
      success: true,
      query: q.trim(),
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('[MovieBox] Search error:', err.message);
    const demoMovies = DEMO_MOVIES.filter(m =>
      m.title.toLowerCase().includes((req.query.q || '').toLowerCase())
    ).map(m => ({
      id: m.id,
      title: m.title,
      poster: m.poster,
      year: m.year,
      rating: m.rating,
      description: m.description,
      genre: m.genre,
      duration: m.duration,
      duration_seconds: 0,
      language: m.language,
      country: m.country,
      content_rating: m.content_rating,
      subject_type: 1,
      has_resource: true,
      imdb_id: '',
      source: 'demo_fallback',
    }));

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
    const details = await scraper.getMovieDetails(String(id));

    res.json({ success: true, ...details });
  } catch (err) {
    console.error('[MovieBox] Details error:', err.message);
    const demo = DEMO_MOVIES.find(m => m.id === req.query.id);
    if (demo) {
      res.json({
        success: true,
        id: demo.id,
        title: demo.title,
        poster: demo.poster,
        year: demo.year,
        rating: demo.rating,
        description: demo.description,
        genre: demo.genre,
        duration: demo.duration,
        duration_seconds: 0,
        language: demo.language,
        country: demo.country,
        content_rating: demo.content_rating,
        subject_type: 1,
        seasons: 0,
        viewers: 0,
        available_qualities: (demo.streams || []).map(s => ({
          quality: s.quality,
          resolution: parseInt(s.quality.replace('p', ''), 10),
          codec: s.codec,
          episodes: 1,
        })),
        aka: '',
        subtitles: demo.subtitles || [],
        dubs: [],
        streams: demo.streams || [],
        source: 'demo_fallback',
      });
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
    const data = await scraper.getStreams(String(id));

    // Build download options from streams
    const downloadOptions = [];
    const seen = new Set();
    for (const s of (data.streams || [])) {
      const quality = s.quality || 'unknown';
      if (!seen.has(quality)) {
        seen.add(quality);
        downloadOptions.push({
          quality,
          url: s.url,
          type: s.type || 'dash',
          codec: s.codec || 'h264',
          bandwidth: s.bandwidth || 0,
          size: s.size || 0,
        });
      }
    }

    res.json({
      success: true,
      movie_id: data.movie_id || id,
      title: data.title || '',
      streams: data.streams || [],
      subtitles: data.subtitles || [],
      download_options: downloadOptions,
      streaming_format: data.streaming_format || 'dash',
      source: data.source || 'api',
    });
  } catch (err) {
    console.error('[MovieBox] Streams error:', err.message);
    const demo = DEMO_MOVIES.find(m => m.id === req.query.id);
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

    const data = await scraper.getStreams(String(id));

    if (!data.streams || !data.streams.length) {
      return res.status(404).json({ error: 'No streams available for this movie' });
    }

    // Find requested quality, or closest match
    let selected = data.streams.find(
      s => (s.quality || '').toLowerCase() === (quality || '').toLowerCase()
    );

    // Fallback: pick highest quality available
    if (!selected) {
      selected = data.streams.reduce((best, cur) => {
        const bh = parseInt(best.height || best.quality?.replace('p', '') || '0', 10);
        const ch = parseInt(cur.height || cur.quality?.replace('p', '') || '0', 10);
        return ch > bh ? cur : best;
      }, data.streams[0]);
    }

    res.json({
      success: true,
      movie_id: data.movie_id || id,
      title: data.title || '',
      quality: selected.quality || quality,
      url: selected.url,
      type: selected.type || 'dash',
      codec: selected.codec || 'h264',
      bandwidth: selected.bandwidth || 0,
      cookie_string: selected.cookie_string || '',
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
router.get('/health', async (_req, res) => {
  try {
    await scraper.searchMovies('Avatar');
    res.json({ status: 'ok', service: 'MovieBox' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// ─── GET /api/moviebox/proxy-download?url={url}&filename={name} ──────
router.get('/proxy-download', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const decodedUrl = decodeURIComponent(String(url));
    const safeFilename = filename
      ? decodeURIComponent(String(filename)).replace(/[^a-zA-Z0-9._-]/g, '_')
      : 'download.mp4';

    console.log(`[MovieBox] Proxy download: ${decodedUrl.substring(0, 80)}... as ${safeFilename}`);

    const fetchRes = await request('GET', decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://h5-api.aoneroom.com/',
      },
      timeout: 60000,
    });

    if (fetchRes.statusCode < 200 || fetchRes.statusCode >= 300) {
      return res.status(fetchRes.statusCode).json({
        error: `Source returned HTTP ${fetchRes.statusCode}`,
        url: decodedUrl,
      });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(fetchRes.body);
  } catch (err) {
    console.error('[MovieBox] Proxy download error:', err.message);
    res.status(500).json({ error: 'Download failed', details: err.message });
  }
});

// =============================================================================
// DASH PROXY — Backend proxies MPD manifests and segments to bypass CORS
// and inject required authentication cookies.
// =============================================================================

/**
 * Fetch binary data (for DASH video segments which are not UTF-8 text).
 */
function requestBinary(method, urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const { headers = {}, timeout = REQUEST_TIMEOUT } = opts;
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers,
      timeout,
    };

    const req = client.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
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

/**
 * Resolve a potentially-relative URL against a base URL.
 */
function resolveUrl(url, base) {
  if (!url) return base;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) {
    const baseProto = base.startsWith('https') ? 'https:' : 'http:';
    return baseProto + url;
  }
  if (url.startsWith('/')) {
    const baseUrl = new URL(base);
    return `${baseUrl.protocol}//${baseUrl.host}${url}`;
  }
  // Relative path — resolve against base directory
  const baseDir = base.endsWith('/') ? base : base.substring(0, base.lastIndexOf('/') + 1);
  return baseDir + url;
}

/**
 * Rewrite every URL inside an MPD manifest so that *all* subsequent requests
 * (BaseURL, SegmentTemplate media/initialization, etc.) are routed through
 * our `/api/moviebox/dash-segment` proxy with auth cookies attached.
 *
 * IMPORTANT: We must NOT rewrite XML namespace URIs (xmlns, xsi:schemaLocation)
 * because those are identifiers, not retrievable resources.
 */
function rewriteMpdUrls(mpdXml, originalMpdUrl, cookies) {
  const encodedCookies = encodeURIComponent(cookies || '');
  const proxyBase = `/api/moviebox/dash-segment`;

  // Base directory of the manifest (used to resolve relative URLs)
  const lastSlashIdx = originalMpdUrl.lastIndexOf('/');
  const manifestBase = lastSlashIdx >= 0
    ? originalMpdUrl.substring(0, lastSlashIdx + 1)
    : originalMpdUrl;

  let rewritten = mpdXml;

  // ---- Helper: is this a URL that should NOT be rewritten? ----
  function shouldSkipUrl(url) {
    // Skip W3C / ISO namespace URIs — these are identifiers, not resources
    const namespaceHosts = [
      'www.w3.org',
      'standards.iso.org',
      'mpeg.chiariglione.org',
      'www.mpeg.org',
    ];
    try {
      const parsed = new URL(url);
      if (namespaceHosts.includes(parsed.hostname)) return true;
    } catch { /* ignore */ }
    return false;
  }

  // ---- 1) Rewrite absolute http(s) in element CONTENT (text between tags) ----
  //    e.g. <BaseURL>https://cdn.com/path/</BaseURL>
  rewritten = rewritten.replace(
    />(https?:\/\/[^<]+)</g,
    (match, url) => {
      if (shouldSkipUrl(url)) return match;
      if (url.includes('/api/moviebox/dash-segment')) return match;
      return `>${proxyBase}?cookies=${encodedCookies}&url=${encodeURIComponent(url)}<`;
    }
  );

  // ---- 2) Rewrite absolute http(s) in specific ATTRIBUTE values ----
  //    Only rewrite attributes that are known to contain resource URLs:
  //    media=, initialization=, sourceURL=, href= (in mpd BaseURL)
  rewritten = rewritten.replace(
    /(media|initialization|sourceURL|href)=["'](https?:\/\/[^"']+)["']/g,
    (match, attr, url) => {
      if (shouldSkipUrl(url)) return match;
      if (url.includes('/api/moviebox/dash-segment')) return match;
      return `${attr}="${proxyBase}?cookies=${encodedCookies}&url=${encodeURIComponent(url)}"`;
    }
  );

  // ---- 3) Rewrite relative URLs in media="…" and initialization="…" ----
  rewritten = rewritten.replace(
    /(media|initialization)=["']((?!https?:\/\/)[^"']+)["']/g,
    (match, attr, relUrl) => {
      const absoluteUrl = resolveUrl(relUrl, manifestBase);
      return `${attr}="${proxyBase}?cookies=${encodedCookies}&url=${encodeURIComponent(absoluteUrl)}"`;
    }
  );

  // ---- 4) Rewrite relative URLs inside <BaseURL>…</BaseURL> ----
  rewritten = rewritten.replace(
    /<BaseURL>((?!https?:\/\/)[^<]+)<\/BaseURL>/g,
    (match, relUrl) => {
      const trimmed = relUrl.trim();
      if (!trimmed) return match;
      const absoluteUrl = resolveUrl(trimmed, manifestBase);
      return `<BaseURL>${proxyBase}?cookies=${encodedCookies}&url=${encodeURIComponent(absoluteUrl)}</BaseURL>`;
    }
  );

  return rewritten;
}

// ─── GET /api/moviebox/dash-manifest?url={mpdUrl}&cookies={cookieString} ──
router.get('/dash-manifest', async (req, res) => {
  try {
    const { url, cookies } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const decodedUrl = decodeURIComponent(String(url));
    const cookieStr = cookies ? decodeURIComponent(String(cookies)) : '';

    console.log(`[MovieBox] DASH manifest proxy: ${decodedUrl.substring(0, 100)}...`);

    // Fetch MPD with auth cookies
    const fetchRes = await request('GET', decodedUrl, {
      headers: {
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://h5-api.aoneroom.com/',
      },
      timeout: 30000,
    });

    if (fetchRes.statusCode < 200 || fetchRes.statusCode >= 300) {
      return res.status(fetchRes.statusCode).json({
        error: `Source returned HTTP ${fetchRes.statusCode}`,
      });
    }

    // Rewrite every URL in the MPD to route through our segment proxy
    const rewrittenMpd = rewriteMpdUrls(fetchRes.body, decodedUrl, cookieStr);

    res.setHeader('Content-Type', 'application/dash+xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(rewrittenMpd);
  } catch (err) {
    console.error('[MovieBox] DASH manifest proxy error:', err.message);
    res.status(500).json({ error: 'Failed to proxy DASH manifest', details: err.message });
  }
});

// ─── GET /api/moviebox/dash-segment?url={segmentUrl}&cookies={cookieString} ──
router.get('/dash-segment', async (req, res) => {
  try {
    const { url, cookies } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const decodedUrl = decodeURIComponent(String(url));
    const cookieStr = cookies ? decodeURIComponent(String(cookies)) : '';

    // Fetch segment with auth cookies (binary — use requestBinary, not request())
    const fetchRes = await requestBinary('GET', decodedUrl, {
      headers: {
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://h5-api.aoneroom.com/',
      },
      timeout: 30000,
    });

    if (fetchRes.statusCode < 200 || fetchRes.statusCode >= 300) {
      return res.status(fetchRes.statusCode).json({
        error: `Source returned HTTP ${fetchRes.statusCode}`,
      });
    }

    // Determine content-type from file extension or source header
    const ext = decodedUrl.split('.').pop()?.toLowerCase().split('?')[0];
    const contentTypeMap = {
      'mpd': 'application/dash+xml',
      'm4s': 'video/iso.segment',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'init': 'video/mp4',
      'avc': 'video/mp4',
      'hevc': 'video/mp4',
    };
    const contentType = fetchRes.headers['content-type']
      || contentTypeMap[ext]
      || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(fetchRes.body);
  } catch (err) {
    console.error('[MovieBox] DASH segment proxy error:', err.message);
    res.status(500).json({ error: 'Failed to proxy segment', details: err.message });
  }
});

module.exports = router;
