/*
  Zentrix — Live TV (IPTV) Backend Router  v1.0
  ──────────────────────────────────────────────────────────────────
  Integrated from the standalone IPTVHub project. Parses the bundled
  M3U playlists once at boot, serves them from memory, and proxies
  HLS streams (with on-the-fly .m3u8 rewriting) so the browser never
  hits CORS or referer/UA blocks from upstream channel providers.

  Routes:
    GET /api/iptv/health
    GET /api/iptv/categories
    GET /api/iptv/countries
    GET /api/iptv/channels   ?q=&country=&category=&sort=&limit=&offset=
    GET /api/iptv/proxy      ?url=&ua=&ref=

  Note: category `icon` values are stable string IDs (not emoji) —
  the frontend maps them to Lucide icon components, consistent with
  the rest of Zentrix's no-emoji-icons design system. Country `flag`
  is a genuine Unicode flag emoji, which is the correct, universal
  way to represent a country (kept deliberately, same as elsewhere
  in the app).
*/

const express   = require('express');
const fs        = require('fs');
const path      = require('path');
const http      = require('http');
const https     = require('https');
const { URL }   = require('url');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const STREAMS_DIR = path.join(__dirname, '..', 'data', 'streams');

// ─────────────────────────────────────────────────────────────────
//  KEEP-ALIVE AGENTS  (connection pooling for faster pre-connect)
// ─────────────────────────────────────────────────────────────────
const httpAgent  = new http.Agent({  keepAlive: true, maxSockets: 50, maxFreeSockets: 20, timeout: 30000, freeSocketTimeout: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 20, timeout: 30000, freeSocketTimeout: 30000 });

function getAgent(protocol) {
  return protocol === 'https:' ? httpsAgent : httpAgent;
}

// ─────────────────────────────────────────────────────────────────
//  RATE LIMITS  (defined here, not in index.js, so each one only
//  ever applies to the exact route it's attached to below — the
//  HLS proxy needs a MUCH higher ceiling than channel browsing
//  since it's hit every few seconds per active stream)
// ─────────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { error: 'Too many requests — slow down' },
});
const proxyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many stream requests — slow down' },
});

// ─────────────────────────────────────────────────────────────────
//  CATEGORIES  (icon = stable id the frontend maps to a Lucide icon)
// ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'news',          icon: 'news',          label: 'News'          },
  { id: 'sports',        icon: 'sports',        label: 'Sports'        },
  { id: 'movies',        icon: 'movies',        label: 'Movies'        },
  { id: 'kids',          icon: 'kids',          label: 'Kids'          },
  { id: 'music',         icon: 'music',         label: 'Music'         },
  { id: 'documentary',   icon: 'documentary',   label: 'Documentary'   },
  { id: 'entertainment', icon: 'entertainment', label: 'Entertainment' },
  { id: 'lifestyle',     icon: 'lifestyle',     label: 'Lifestyle'     },
  { id: 'religious',     icon: 'religious',     label: 'Religious'     },
  { id: 'general',       icon: 'general',       label: 'General'      },
];

// M3U group-title → category id
const GROUP_MAP = {
  'news':'news','nachrichten':'news','noticias':'news','nouvelles':'news','تلفزيون الأخبار':'news',
  'sport':'sports','sports':'sports','deportes':'sports','sporten':'sports',
  'movies':'movies','movie':'movies','cinema':'movies','films':'movies','filme':'movies','peliculas':'movies','ciné':'movies',
  'kids':'kids','children':'kids','cartoon':'kids','cartoons':'kids','animation':'kids','family':'kids','anime':'kids','junior':'kids',
  'music':'music','musik':'music','musica':'music','música':'music','music tv':'music',
  'documentary':'documentary','documentaries':'documentary','nature':'documentary','science':'documentary','history':'documentary',
  'entertainment':'entertainment','series':'entertainment','drama':'entertainment','comedy':'entertainment','tv shows':'entertainment',
  'lifestyle':'lifestyle','cooking':'lifestyle','travel':'lifestyle','fashion':'lifestyle','food':'lifestyle','health':'lifestyle',
  'religious':'religious','religion':'religious','christian':'religious','faith':'religious','church':'religious','islamic':'religious',
};

// Regex fallback category detection on channel name + tvg-id
const CAT_RULES = [
  { id:'news',          re:/\b(news|cnn|msnbc|euronews|al jazeera|france 24|sky news|bbc news|nbc news|abc news|fox news|press tv|breaking|headline|newsroom|newshour|tonight live|news channel|noticias|nachricht|actualit)\b/i },
  { id:'sports',        re:/\b(sport|sports|espn|football|soccer|basketball|cricket|tennis|golf|f1 |racing|motorsport|rugby|hockey|boxing|mma|ufc|nfl|nba|nhl|mlb|olympic|eurosport|bein|la liga|premier league|serie a|bundesliga|formula|darts|snooker|cycling|athletics)\b/i },
  { id:'movies',        re:/\b(movies?|cinema|films?|hbo|showtime|cinemax|starz|blockbuster|fx movie|thriller channel|horror channel|action channel|western channel|sci-fi channel|max original|cine\b|kino)\b/i },
  { id:'kids',          re:/\b(kids?|junior|jr\.?|children|cartoons?|disney channel|disney xd|disney jr|nick jr|baby|peppa|paw patrol|boomerang|toon|nickelodeon|anime|pokemon|family jr|cartoon network|kiddo|mini tv|tiny|toddler|preschool|kinder|small world)\b/i },
  { id:'music',         re:/\b(music|mtv|vh1|radio|hits|beat|bpm|dance|classical|jazz|country music|rock tv|sounds?|gospel music|hip.hop|rnb|chart|playlist|club tv|indie music)\b/i },
  { id:'documentary',   re:/\b(documentary|documentaries|nat geo|national geographic|discovery|history|animal planet|nature|science|explore|expedition|universe|wild earth|investigate|smithsonian|biography|historical|planet earth)\b/i },
  { id:'entertainment', re:/\b(entertain|comedy|sitcom|drama|tnt|tbs|usa network|syfy|amc|hgtv|bravo|lifetime|hallmark|tlc|e!|reality|paramount network|freeform|series|tv shows?|network\b)\b/i },
  { id:'lifestyle',     re:/\b(food|cooking|recipe|chef|kitchen|culinary|fashion|style|beauty|lifestyle|home\b|diy|garden|travel|health|wellness|yoga|fitness|spa|interior|decor|renovation)\b/i },
  { id:'religious',     re:/\b(religious|religion|christian|church|god|faith|bible|prayer|ministry|gospel|catholic|islamic|hindu|buddhist|spiritual|worship|devotional|evangelical|tbn|daystar|eternal word|praise|blessing)\b/i },
];

function detectCategory(name, tvgId, groupTitle) {
  if (groupTitle) {
    const mapped = GROUP_MAP[groupTitle.toLowerCase().trim()];
    if (mapped) return mapped;
  }
  const text = name + ' ' + tvgId;
  for (const { id, re } of CAT_RULES) {
    if (re.test(text)) return id;
  }
  return 'general';
}

// ─────────────────────────────────────────────────────────────────
//  DATA STORE  (in-memory, parsed once at boot)
// ─────────────────────────────────────────────────────────────────
let allChannels = [];
let countryMap  = {}; // CC  → { code, count, flag }
let catStats    = {}; // id  → count
let logoMap     = {}; // tvgId → logoUrl (from iptv-org API)
let loadError   = null;

// ─────────────────────────────────────────────────────────────────
//  M3U PARSER
// ─────────────────────────────────────────────────────────────────
function parseM3U(content, filename) {
  const lines    = content.replace(/\r\n/g, '\n').split('\n');
  const fileBase = path.basename(filename, '.m3u');
  const parts    = fileBase.split('_');
  const cc       = parts[0].toUpperCase();
  const platform = parts.length > 1
    ? parts.slice(1).join(' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;

  const streams = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF:')) continue;

    const tvgIdM      = line.match(/tvg-id="([^"]*)"/);
    const tvgLogoM    = line.match(/tvg-logo="([^"]*)"/);
    const groupTitleM = line.match(/group-title="([^"]*)"/);
    const tvgId      = tvgIdM      ? tvgIdM[1]      : '';
    const tvgLogo    = tvgLogoM    ? tvgLogoM[1]    : '';
    const groupTitle = groupTitleM ? groupTitleM[1] : '';

    const nameM    = line.match(/,(.+)$/);
    const fullName = nameM ? nameM[1].trim() : 'Unknown';

    const qualM   = fullName.match(/\((\d+[pi])\)/);
    const quality = qualM ? qualM[1] : '';
    const lblM    = fullName.match(/\[([^\]]+)\]/);
    const label   = lblM ? lblM[1] : '';
    const name    = fullName
      .replace(/\s*\(\d+[pi]\)\s*/g, '')
      .replace(/\s*\[[^\]]+\]\s*/g, '')
      .trim() || 'Unknown Channel';

    let streamUrl = '', referer = '', userAgent = '', skip = 0;

    for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
      const l = lines[j].trim();
      if      (l.startsWith('#EXTVLCOPT:http-referrer='))   { referer   = l.replace('#EXTVLCOPT:http-referrer=', '');   skip = j - i; }
      else if (l.startsWith('#EXTVLCOPT:http-user-agent=')) { userAgent = l.replace('#EXTVLCOPT:http-user-agent=', ''); skip = j - i; }
      else if (l && !l.startsWith('#')) { streamUrl = l; skip = j - i; break; }
    }

    if (!streamUrl || !streamUrl.startsWith('http')) continue;
    i += skip;

    const category = detectCategory(name, tvgId, groupTitle);

    streams.push({
      id: `${fileBase}_${streams.length}`,
      tvgId, name, fullName, quality,
      resNum:      quality ? parseInt(quality) : 0,
      label,
      url:         streamUrl,
      logo:        tvgLogo,
      groupTitle,
      category,
      referer,
      userAgent,
      country:     cc,
      countryCode: cc.toLowerCase(),
      platform,
    });
  }
  return streams;
}

// ─────────────────────────────────────────────────────────────────
//  LOAD STREAMS  (runs once, synchronously, at module load)
// ─────────────────────────────────────────────────────────────────
function loadStreams() {
  if (!fs.existsSync(STREAMS_DIR)) {
    loadError = `No streams directory found at ${STREAMS_DIR}`;
    console.warn(`[LiveTV] ⚠ ${loadError}`);
    return;
  }

  const files = fs.readdirSync(STREAMS_DIR).filter(f => f.toLowerCase().endsWith('.m3u')).sort();

  for (const file of files) {
    try {
      const streams = parseM3U(fs.readFileSync(path.join(STREAMS_DIR, file), 'utf-8'), file);
      allChannels.push(...streams);

      const cc = file.split('_')[0].toUpperCase().replace(/\.M3U$/i, '');
      if (!countryMap[cc]) countryMap[cc] = { code: cc, count: 0, flag: flagEmoji(cc) };
      countryMap[cc].count += streams.length;

      for (const s of streams) catStats[s.category] = (catStats[s.category] || 0) + 1;
    } catch (e) {
      console.error(`[LiveTV] ✗ ${file}: ${e.message}`);
    }
  }
  console.log(`[LiveTV] ✅ ${allChannels.length.toLocaleString()} channels · ${Object.keys(countryMap).length} countries · ${files.length} files`);
}

// ─────────────────────────────────────────────────────────────────
//  OPTIONAL LOGO FETCH  (async, non-blocking, best-effort)
// ─────────────────────────────────────────────────────────────────
function fetchLogoMap() {
  fetch('https://iptv-org.github.io/api/channels.json', { signal: AbortSignal.timeout(20000) })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(arr => {
      let n = 0;
      for (const ch of arr) if (ch.id && ch.logo) { logoMap[ch.id] = ch.logo; n++; }
      console.log(`[LiveTV] 📸 ${n.toLocaleString()} logos cached from iptv-org API`);
    })
    .catch(() => console.log('[LiveTV] 📸 Logo API unavailable (offline) — using fallback URLs'));
}

// ─────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────
// Genuine ISO country-flag emoji — the correct, universal way to
// represent a country in UI (not a "structural icon" substitution).
function flagEmoji(code) {
  if (!code || code.length < 2) return '🌐';
  try {
    return [...code.toUpperCase().slice(0, 2)]
      .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
      .join('');
  } catch {
    return '🌐';
  }
}

function proxyReq(targetUrl, extraHeaders = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(targetUrl); } catch (e) { return reject(e); }
    const mod  = parsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers:  { 'User-Agent': 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36', 'Accept': '*/*', ...extraHeaders },
      timeout:  15000,
      agent:    getAgent(parsed.protocol),
    };
    const req = mod.request(opts, (res) => resolve(res));
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Upstream timeout')); });
    req.end();
  });
}

/** Follow redirects, consuming/discarding intermediate response bodies.
 *  Returns the final response object + the final URL after all redirects. */
async function fetchWithRedirects(initialUrl, extraHeaders = {}, maxRedirects = 5, method = 'GET') {
  let url = initialUrl;
  for (let i = 0; i < maxRedirects; i++) {
    const res = await proxyReq(url, extraHeaders, method);
    if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
      const loc = res.headers['location'];
      res.resume(); // consume/discard body so connection can be reused
      if (!loc) throw new Error(`Redirect ${res.statusCode} without Location header`);
      url = new URL(loc, url).toString();
      continue;
    }
    return { res, finalUrl: url };
  }
  throw new Error(`Too many redirects (> ${maxRedirects})`);
}

// ─────────────────────────────────────────────────────────────────
//  INITIALIZE  (parse on module load, like the megaplay route's
//  module-level constants — runs once when the server boots)
// ─────────────────────────────────────────────────────────────────
loadStreams();
fetchLogoMap();

// ══ GET /api/iptv/health ═══════════════════════════════════════════
router.get('/health', apiLimiter, (_req, res) => {
  res.json({
    status:    loadError ? 'degraded' : 'ok',
    channels:  allChannels.length,
    countries: Object.keys(countryMap).length,
    logos:     Object.keys(logoMap).length,
    error:     loadError || undefined,
  });
});

// ══ GET /api/iptv/categories ════════════════════════════════════════
router.get('/categories', apiLimiter, (_req, res) => {
  const list = [
    { id: 'all', icon: 'all', label: 'All Channels', count: allChannels.length },
    ...CATEGORIES.map(c => ({ ...c, count: catStats[c.id] || 0 })).filter(c => c.count > 0),
  ];
  res.json(list);
});

// ══ GET /api/iptv/countries ═════════════════════════════════════════
router.get('/countries', apiLimiter, (_req, res) => {
  res.json(Object.values(countryMap).sort((a, b) => b.count - a.count));
});

// ══ GET /api/iptv/channels ══════════════════════════════════════════
router.get('/channels', apiLimiter, (req, res) => {
  const q        = String(req.query.q || '').trim().toLowerCase();
  const country  = String(req.query.country || '').toLowerCase();
  const category = String(req.query.category || '').toLowerCase();
  const sortBy   = req.query.sort || 'name';
  const limit    = Math.min(parseInt(req.query.limit, 10)  || 60, 200);
  const offset   = Math.max(parseInt(req.query.offset, 10) || 0,  0);

  let results = allChannels;
  if (country  && country  !== 'all') results = results.filter(c => c.countryCode === country);
  if (category && category !== 'all') results = results.filter(c => c.category    === category);
  if (q) results = results.filter(c => c.name.toLowerCase().includes(q) || c.tvgId.toLowerCase().includes(q));
  if (sortBy === 'quality') results = [...results].sort((a, b) => b.resNum - a.resNum);
  else                      results = [...results].sort((a, b) => a.name.localeCompare(b.name));

  const total = results.length;
  const items = results.slice(offset, offset + limit).map(ch => ({
    ...ch,
    logo: ch.logo || logoMap[ch.tvgId] || logoMap[ch.tvgId.split('@')[0]] || '',
  }));
  res.json({ total, offset, limit, items });
});

// ══ GET /api/iptv/proxy ═════════════════════════════════════════════
// HLS proxy: forwards playlists/segments, rewriting .m3u8 manifests so
// every sub-request also flows back through this proxy (keeps Referer/
// UA spoofing consistent and avoids CORS entirely).
async function handleProxy(req, res, method = 'GET') {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'url required' });

  const ua  = req.query.ua;
  const ref = req.query.ref;
  const hdrs = {};
  if (ua)  hdrs['User-Agent'] = ua;
  if (ref) hdrs['Referer']    = ref;

  try {
    const { res: up, finalUrl } = await fetchWithRedirects(targetUrl, hdrs, 5, method);

    if (up.statusCode >= 400) {
      up.resume();
      return res.status(up.statusCode).json({ error: `Upstream ${up.statusCode}` });
    }

    const ct     = (up.headers['content-type'] || '').toLowerCase();
    const isM3U8 = ct.includes('mpegurl') || /\.m3u8?(\?|$)/i.test(targetUrl);

    res.setHeader('Access-Control-Allow-Origin', '*');

    if (isM3U8) {
      let data = '';
      up.setEncoding('utf-8');
      up.on('data', chunk => { data += chunk; });
      up.on('end', () => {
        const rewritten = data.split('\n').map(line => {
          const t = line.trim();
          if (!t || t.startsWith('#')) return line;
          let abs;
          try { abs = new URL(t, finalUrl).toString(); } catch { abs = t; }
          const sp = new URLSearchParams({ url: abs });
          if (ua)  sp.set('ua', ua);
          if (ref) sp.set('ref', ref);
          return `/api/iptv/proxy?${sp}`;
        }).join('\n');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(rewritten);
      });
      up.on('error', e => { if (!res.headersSent) res.status(500).json({ error: e.message }); });
    } else {
      const fwd = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      fwd.forEach(h => { if (up.headers[h]) res.setHeader(h, up.headers[h]); });
      res.writeHead(up.statusCode);
      if (method === 'HEAD') {
        // For HEAD, don't pipe body — just end the response
        up.resume();
        res.end();
      } else {
        up.pipe(res);
      }
      // Clean up if client disconnects mid-stream
      res.on('close', () => { if (!up.destroyed) up.destroy(); });
      up.on('error', e => {
        console.error('[LiveTV proxy] stream error:', e.message.slice(0, 80));
        if (!res.headersSent) res.status(500).end();
        else if (!res.writableEnded) res.end();
      });
    }
  } catch (e) {
    console.error('[LiveTV proxy]', e.message.slice(0, 80), '→', String(targetUrl).slice(0, 70));
    if (!res.headersSent) res.status(502).json({ error: e.message });
  }
}

router.get('/proxy', proxyLimiter, (req, res) => handleProxy(req, res, 'GET'));
router.head('/proxy', proxyLimiter, (req, res) => handleProxy(req, res, 'HEAD'));

// ══ GET /api/iptv/ping ══════════════════════════════════════════════
// Lightweight stream health-check. Sends a HEAD request upstream and
// returns JSON { ok: true/false, status, contentType, ms } so the
// frontend can pre-warm connections without downloading bodies.
router.get('/ping', proxyLimiter, async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ ok: false, error: 'url required' });

  const ua  = req.query.ua;
  const ref = req.query.ref;
  const hdrs = {};
  if (ua)  hdrs['User-Agent'] = ua;
  if (ref) hdrs['Referer']    = ref;

  const t0 = Date.now();
  try {
    const { res: up } = await fetchWithRedirects(targetUrl, hdrs, 5, 'HEAD');
    const ms = Date.now() - t0;
    const ok = up.statusCode < 400;
    // consume any stray body
    up.resume();
    res.json({
      ok,
      status:     up.statusCode,
      contentType: up.headers['content-type'] || '',
      ms,
    });
  } catch (e) {
    res.json({ ok: false, status: 0, contentType: '', ms: Date.now() - t0, error: e.message });
  }
});

// ══ GET /api/iptv/channels-batch-ping ═══════════════════════════════
// Ping multiple channels at once (used for background pre-connect).
// Accepts a JSON array of { url, ua?, ref? } via query string.
router.get('/channels-batch-ping', proxyLimiter, async (req, res) => {
  const raw = req.query.channels;
  if (!raw) return res.status(400).json({ error: 'channels query param required' });

  let channels;
  try {
    channels = JSON.parse(raw);
    if (!Array.isArray(channels)) throw new Error('not an array');
  } catch {
    return res.status(400).json({ error: 'channels must be a JSON array' });
  }

  // Limit to 50 at a time to prevent abuse
  const toPing = channels.slice(0, 50);

  const results = await Promise.allSettled(
    toPing.map(async ({ url, ua, ref }) => {
      const hdrs = {};
      if (ua)  hdrs['User-Agent'] = ua;
      if (ref) hdrs['Referer']    = ref;
      try {
        const { res: up } = await fetchWithRedirects(url, hdrs, 3, 'HEAD');
        up.resume();
        return { url, ok: up.statusCode < 400, status: up.statusCode };
      } catch (e) {
        return { url, ok: false, status: 0, error: e.message };
      }
    })
  );

  res.json({
    results: results.map(r => (r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message })),
  });
});

module.exports = router;
