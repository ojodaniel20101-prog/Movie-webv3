/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VIOLETFLIX FALLBACK — Sports Data Source
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fetches match data from VioletFlix (violetflixtv-production.up.railway.app)
 * and normalizes it into the raw aoneroom format so sports-aoneroom.js can
 * consume it transparently.
 *
 * Endpoints traced from the VioletFlix frontend bundle:
 *   GET /api/omegatech/sports          → raw aoneroom match list
 *   GET /api/omegatech/sports?sport=   → filtered by sport type
 *   GET /api/sportsrc/detail?id=&category= → external sportsrc detail
 *
 * Used as a fallback when aoneroom returns empty or errors out.
 */

const VF_BASE = 'https://violetflixtv-production.up.railway.app';
const SPORTSRC_BASE = 'https://api.sportsrc.org';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://violetflixtv-production.up.railway.app/sports',
  'Origin': 'https://violetflixtv-production.up.railway.app',
};

const CACHE = {};
const CACHE_TTL = 30 * 1000; // 30 seconds

async function vfFetch(path, params = {}) {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  const url = new URL(`${VF_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const resp = await fetch(url.toString(), {
    headers: HEADERS,
    timeout: 12000,
  });

  if (!resp.ok) throw new Error(`VF HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data.success && data.statusCode !== 200) {
    throw new Error(data.error || 'VF API error');
  }
  return data;
}

async function sportsrcFetch(category = 'football') {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  try {
    const resp = await fetch(`${SPORTSRC_BASE}/?data=matches&category=${encodeURIComponent(category)}`, {
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        'Accept': 'application/json',
      },
      timeout: 10000,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.data || null;
  } catch {
    return null;
  }
}

async function sportsrcDetail(id, category = 'football') {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  try {
    const resp = await fetch(`${SPORTSRC_BASE}/?data=detail&id=${encodeURIComponent(id)}&category=${encodeURIComponent(category)}`, {
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        'Accept': 'application/json',
      },
      timeout: 10000,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.data || null;
  } catch {
    return null;
  }
}

// ─── Fetch Matches ──────────────────────────────────────────────────────────

async function fetchVioletFlixMatches(leagueId) {
  const cacheKey = `vf:matches:${leagueId || 'all'}`;
  const now = Date.now();
  if (CACHE[cacheKey] && now - CACHE[cacheKey].ts < CACHE_TTL) {
    return CACHE[cacheKey].data;
  }

  try {
    // Try the omegatech sports endpoint first
    const data = await vfFetch('/api/omegatech/sports');
    let matches = data.matches || [];

    // If no matches, try sportsrc as a deeper fallback
    if (!matches.length) {
      const srcMatches = await sportsrcFetch('football');
      if (srcMatches && srcMatches.length) {
        matches = srcMatches.map(m => ({
          id: m.id || String(Math.random()).slice(2),
          team1: { name: m.home || m.team1 || 'Home', score: m.homeScore ?? '', avatar: m.homeLogo || '' },
          team2: { name: m.away || m.team2 || 'Away', score: m.awayScore ?? '', avatar: m.awayLogo || '' },
          status: m.status || 'MatchNotStart',
          playType: m.playType || 'PlayTypeVideo',
          playPath: m.playPath || m.streamUrl || '',
          startTime: m.startTime || m.time || '',
          endTime: m.endTime || '',
          type: m.type || 'football',
          timeDesc: m.timeDesc || '',
          playSource: m.playSource || m.sources || [],
          statusLive: m.statusLive ?? 0,
          league: m.league || m.category || 'Football',
          matchRound: m.matchRound || m.round || '',
          replay: m.replay || [],
          highlights: m.highlights || [],
        }));
      }
    }

    // Cache and return
    CACHE[cacheKey] = { data: matches, ts: now };
    return matches;
  } catch (err) {
    // Last resort: try sportsrc directly
    const srcMatches = await sportsrcFetch('football');
    if (srcMatches && srcMatches.length) {
      const mapped = srcMatches.map(m => ({
        id: m.id || String(Math.random()).slice(2),
        team1: { name: m.home || m.team1 || 'Home', score: m.homeScore ?? '', avatar: m.homeLogo || '' },
        team2: { name: m.away || m.team2 || 'Away', score: m.awayScore ?? '', avatar: m.awayLogo || '' },
        status: m.status || 'MatchNotStart',
        playType: 'PlayTypeVideo',
        playPath: m.streamUrl || '',
        startTime: m.time || '',
        endTime: '',
        type: 'football',
        timeDesc: '',
        playSource: m.sources || [],
        statusLive: 0,
        league: m.category || 'Football',
        matchRound: m.round || '',
        replay: [],
        highlights: [],
      }));
      CACHE[cacheKey] = { data: mapped, ts: now };
      return mapped;
    }
    throw err;
  }
}

// ─── Fetch Match Detail ─────────────────────────────────────────────────────

async function fetchVioletFlixDetail(matchId) {
  const cacheKey = `vf:detail:${matchId}`;
  const now = Date.now();
  if (CACHE[cacheKey] && now - CACHE[cacheKey].ts < CACHE_TTL) {
    return CACHE[cacheKey].data;
  }

  try {
    // Try omegatech detail first (if it exists)
    const data = await vfFetch('/api/omegatech/sports');
    const matches = data.matches || [];
    const match = matches.find(m => String(m.id) === String(matchId));
    if (match) {
      CACHE[cacheKey] = { data: match, ts: now };
      return match;
    }
  } catch {
    // ignore
  }

  // Fallback to sportsrc detail
  try {
    const detail = await sportsrcDetail(matchId, 'football');
    if (detail) {
      const mapped = {
        id: matchId,
        team1: { name: detail.home || detail.team1 || 'Home', score: detail.homeScore ?? '', avatar: detail.homeLogo || '' },
        team2: { name: detail.away || detail.team2 || 'Away', score: detail.awayScore ?? '', avatar: detail.awayLogo || '' },
        status: detail.status || 'MatchNotStart',
        playType: 'PlayTypeVideo',
        playPath: detail.streamUrl || detail.playPath || '',
        startTime: detail.time || detail.startTime || '',
        endTime: detail.endTime || '',
        type: detail.type || 'football',
        timeDesc: detail.timeDesc || '',
        playSource: detail.sources || detail.playSource || [],
        statusLive: detail.statusLive ?? 0,
        league: detail.league || detail.category || 'Football',
        matchRound: detail.round || detail.matchRound || '',
        replay: detail.replay || [],
        highlights: detail.highlights || [],
      };
      CACHE[cacheKey] = { data: mapped, ts: now };
      return mapped;
    }
  } catch {
    // ignore
  }

  return null;
}

module.exports = { fetchVioletFlixMatches, fetchVioletFlixDetail };
