const express = require('express');
const router = express.Router();

// ─── Config ────────────────────────────────────────────────────────────────
const FOOTBALL_DATA_API = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';

// Headers for football-data.org
const getHeaders = () => ({
  'X-Auth-Token': API_KEY,
  'Content-Type': 'application/json',
});

// Alternative: Use public API-Football via RapidAPI (backup source)
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = 'api-football-v1.p.rapidapi.com';

// Cache
const cache = {
  matches: null,
  matchesTime: 0,
  matchDetail: {},
  lineups: {},
  events: {},
  stats: {},
};
const CACHE_TTL = 60 * 1000; // 1 minute
const DETAIL_CACHE_TTL = 30 * 1000; // 30 seconds for live data

// ─── Fetch with fallback ────────────────────────────────────────────────────
async function fetchWithFallback(url, options = {}, fallbackFn) {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  try {
    const resp = await fetch(url, { ...options, timeout: 10000 });
    if (resp.ok) return await resp.json();
    throw new Error(`HTTP ${resp.status}`);
  } catch (err) {
    if (fallbackFn) return await fallbackFn();
    throw err;
  }
}

// ─── Get current date range ─────────────────────────────────────────────────
function getDateRange() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const format = (d) => d.toISOString().split('T')[0];
  return { from: format(yesterday), to: format(tomorrow) };
}

// ─── Transform football-data match ──────────────────────────────────────────
function transformMatch(match) {
  return {
    id: String(match.id),
    homeTeam: match.homeTeam?.shortName || match.homeTeam?.name || 'Home',
    awayTeam: match.awayTeam?.shortName || match.awayTeam?.name || 'Away',
    homeLogo: match.homeTeam?.crest || '',
    awayLogo: match.awayTeam?.crest || '',
    homeScore: match.score?.fullTime?.home !== null ? String(match.score.fullTime.home) : '0',
    awayScore: match.score?.fullTime?.away !== null ? String(match.score.fullTime.away) : '0',
    status: mapStatus(match.status),
    utcDate: match.utcDate,
    minute: match.minute || match.utcDate,
    league: match.competition?.name || '',
    leagueLogo: match.competition?.emblem || '',
    leagueId: match.competition?.id || null,
    venue: match.venue || '',
    matchday: match.matchday || '',
    stage: match.stage || '',
    homeTeamId: match.homeTeam?.id || null,
    awayTeamId: match.awayTeam?.id || null,
  };
}

function mapStatus(status) {
  const map = {
    'SCHEDULED': 'UPCOMING',
    'LIVE': 'LIVE',
    'IN_PLAY': 'LIVE',
    'PAUSED': 'HALF_TIME',
    'FINISHED': 'FINISHED',
    'POSTPONED': 'UPCOMING',
    'SUSPENDED': 'LIVE',
    'CANCELLED': 'FINISHED',
    'TIMED': 'UPCOMING',
  };
  return map[status] || status;
}

// ─── Transform match detail ─────────────────────────────────────────────────
function transformMatchDetail(match) {
  const base = transformMatch(match);

  // Extract goals
  const goals = (match.goals || []).map(g => ({
    time: g.minute || 0,
    type: 'goal',
    team: g.team?.id === match.homeTeam?.id ? 'home' : 'away',
    player: g.scorer?.name || 'Unknown',
    assist: g.assist?.name || null,
    extraTime: g.extraTime || null,
  }));

  // Extract bookings
  const bookings = (match.bookings || []).map(b => ({
    time: b.minute || 0,
    type: b.card === 'RED' ? 'red_card' : 'yellow_card',
    team: b.team?.id === match.homeTeam?.id ? 'home' : 'away',
    player: b.player?.name || 'Unknown',
    card: b.card,
  }));

  // Extract substitutions
  const substitutions = (match.substitutions || []).flatMap(subs =>
    (subs.substitutions || []).map(sub => ({
      time: sub.minute || 0,
      type: 'substitution',
      team: subs.team?.id === match.homeTeam?.id ? 'home' : 'away',
      playerOut: sub.playerOut?.name || 'Unknown',
      playerIn: sub.playerIn?.name || 'Unknown',
    }))
  );

  // Combine and sort events
  const allEvents = [...goals, ...bookings, ...substitutions]
    .sort((a, b) => a.time - b.time);

  return {
    ...base,
    events: allEvents,
    referee: match.referees?.[0]?.name || '',
    attendance: match.attendance || null,
  };
}

// ─── Transform statistics ───────────────────────────────────────────────────
function transformStats(stats, homeTeamId, awayTeamId) {
  if (!stats || !Array.isArray(stats)) return null;

  const homeStats = stats.find(s => s.team?.id === homeTeamId)?.statistics || [];
  const awayStats = stats.find(s => s.team?.id === awayTeamId)?.statistics || [];

  const findStat = (arr, type) => {
    const s = arr.find(x => x.type === type);
    return s ? s.value : 0;
  };

  const parseNumber = (val) => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      if (val.includes('%')) return parseInt(val.replace('%', '').trim()) || 0;
      return parseInt(val) || 0;
    }
    return 0;
  };

  return {
    possession: [parseNumber(findStat(homeStats, 'Ball Possession')), parseNumber(findStat(awayStats, 'Ball Possession'))],
    shots: [parseNumber(findStat(homeStats, 'Total Shots')), parseNumber(findStat(awayStats, 'Total Shots'))],
    shotsOnTarget: [parseNumber(findStat(homeStats, 'Shots on Goal')), parseNumber(findStat(awayStats, 'Shots on Goal'))],
    shotsOffTarget: [parseNumber(findStat(homeStats, 'Shots off Goal')), parseNumber(findStat(awayStats, 'Shots off Goal'))],
    corners: [parseNumber(findStat(homeStats, 'Corner Kicks')), parseNumber(findStat(awayStats, 'Corner Kicks'))],
    fouls: [parseNumber(findStat(homeStats, 'Fouls')), parseNumber(findStat(awayStats, 'Fouls'))],
    yellowCards: [parseNumber(findStat(homeStats, 'Yellow Cards')), parseNumber(findStat(awayStats, 'Yellow Cards'))],
    redCards: [parseNumber(findStat(homeStats, 'Red Cards')), parseNumber(findStat(awayStats, 'Red Cards'))],
    offsides: [parseNumber(findStat(homeStats, 'Offsides')), parseNumber(findStat(awayStats, 'Offsides'))],
    passes: [parseNumber(findStat(homeStats, 'Total passes')), parseNumber(findStat(awayStats, 'Total passes'))],
    passAccuracy: [parseNumber(findStat(homeStats, 'Passes accurate')), parseNumber(findStat(awayStats, 'Passes accurate'))],
    freeKicks: [parseNumber(findStat(homeStats, 'Free Kicks')), parseNumber(findStat(awayStats, 'Free Kicks'))],
    throwIns: [parseNumber(findStat(homeStats, 'Throw-in')), parseNumber(findStat(awayStats, 'Throw-in'))],
    goalkeeperSaves: [parseNumber(findStat(homeStats, 'Goalkeeper Saves')), parseNumber(findStat(awayStats, 'Goalkeeper Saves'))],
  };
}

// ─── Transform lineup ───────────────────────────────────────────────────────
function transformLineup(lineups, homeTeamId, awayTeamId) {
  if (!lineups || !Array.isArray(lineups)) return null;

  const transformTeamLineup = (lu) => {
    if (!lu) return null;
    const coach = lu.coach?.name || '';
    const formation = lu.formation || '';
    const startXI = (lu.startXI || []).map(p => ({
      name: p.player?.name || '',
      number: p.player?.shirtNumber || null,
      position: p.player?.position || '',
      grid: p.player?.grid || null,
      isCaptain: p.player?.captain || false,
      photo: null, // football-data doesn't provide photos
    }));
    const substitutes = (lu.bench || []).map(p => ({
      name: p.player?.name || '',
      number: p.player?.shirtNumber || null,
      position: p.player?.position || '',
      isCaptain: p.player?.captain || false,
      photo: null,
    }));

    return { coach, formation, startXI, substitutes };
  };

  const homeLineup = lineups.find(l => l.team?.id === homeTeamId);
  const awayLineup = lineups.find(l => l.team?.id === awayTeamId);

  return {
    home: transformTeamLineup(homeLineup),
    away: transformTeamLineup(awayLineup),
  };
}

// ─── Generate demo data for matches not found in API ────────────────────────
function generateDemoLineup(teamName, isHome) {
  const formations = ['4-3-3', '4-2-3-1', '3-5-2', '4-4-2', '3-4-3'];
  const formation = formations[Math.floor(Math.random() * formations.length)];

  const positions = isHome ? [
    { p: 'GK', g: '1:1' }, { p: 'DEF', g: '2:4' }, { p: 'DEF', g: '2:3' },
    { p: 'DEF', g: '2:2' }, { p: 'DEF', g: '2:1' }, { p: 'MID', g: '3:3' },
    { p: 'MID', g: '3:2' }, { p: 'MID', g: '3:1' }, { p: 'FWD', g: '4:3' },
    { p: 'FWD', g: '4:2' }, { p: 'FWD', g: '4:1' },
  ] : [
    { p: 'GK', g: '1:1' }, { p: 'DEF', g: '2:1' }, { p: 'DEF', g: '2:2' },
    { p: 'DEF', g: '2:3' }, { p: 'DEF', g: '2:4' }, { p: 'MID', g: '3:1' },
    { p: 'MID', g: '3:2' }, { p: 'MID', g: '3:3' }, { p: 'FWD', g: '4:1' },
    { p: 'FWD', g: '4:2' }, { p: 'FWD', g: '4:3' },
  ];

  const playerNames = [
    'Martinez', 'Johnson', 'Williams', 'Brown', 'Davis', 'Miller',
    'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas',
  ];

  const startXI = positions.map((pos, i) => ({
    name: playerNames[i] || `Player ${i + 1}`,
    number: i + 1,
    position: pos.p,
    grid: pos.g,
    isCaptain: i === 0,
    photo: null,
  }));

  const subNames = ['Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia', 'Robinson', 'Clark'];
  const substitutes = subNames.map((name, i) => ({
    name,
    number: 12 + i,
    position: i < 2 ? 'GK' : i < 5 ? 'DEF' : i < 7 ? 'MID' : 'FWD',
    isCaptain: false,
    photo: null,
  }));

  return { coach: 'Coach Smith', formation, startXI, substitutes };
}

function generateDemoStats() {
  const homePossession = 40 + Math.floor(Math.random() * 21);
  return {
    possession: [homePossession, 100 - homePossession],
    shots: [5 + Math.floor(Math.random() * 10), 5 + Math.floor(Math.random() * 10)],
    shotsOnTarget: [2 + Math.floor(Math.random() * 5), 2 + Math.floor(Math.random() * 5)],
    shotsOffTarget: [2 + Math.floor(Math.random() * 4), 2 + Math.floor(Math.random() * 4)],
    corners: [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)],
    fouls: [3 + Math.floor(Math.random() * 8), 3 + Math.floor(Math.random() * 8)],
    yellowCards: [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)],
    redCards: [0, 0],
    offsides: [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)],
    passes: [200 + Math.floor(Math.random() * 300), 200 + Math.floor(Math.random() * 300)],
    passAccuracy: [75 + Math.floor(Math.random() * 15), 75 + Math.floor(Math.random() * 15)],
    freeKicks: [5 + Math.floor(Math.random() * 8), 5 + Math.floor(Math.random() * 8)],
    throwIns: [8 + Math.floor(Math.random() * 10), 8 + Math.floor(Math.random() * 10)],
    goalkeeperSaves: [2 + Math.floor(Math.random() * 4), 2 + Math.floor(Math.random() * 4)],
  };
}

function generateDemoEvents() {
  const events = [];
  const numGoals = Math.floor(Math.random() * 4);
  const numCards = Math.floor(Math.random() * 4);
  const numSubs = Math.floor(Math.random() * 5);

  for (let i = 0; i < numGoals; i++) {
    events.push({
      time: 10 + Math.floor(Math.random() * 80),
      type: 'goal',
      team: Math.random() > 0.5 ? 'home' : 'away',
      player: ['Martinez', 'Johnson', 'Wilson', 'Taylor'][Math.floor(Math.random() * 4)],
      assist: Math.random() > 0.5 ? ['Brown', 'Davis', 'Miller'][Math.floor(Math.random() * 3)] : null,
    });
  }

  for (let i = 0; i < numCards; i++) {
    events.push({
      time: 15 + Math.floor(Math.random() * 75),
      type: Math.random() > 0.8 ? 'red_card' : 'yellow_card',
      team: Math.random() > 0.5 ? 'home' : 'away',
      player: ['Williams', 'Anderson', 'Thomas', 'Moore'][Math.floor(Math.random() * 4)],
      card: 'card',
    });
  }

  for (let i = 0; i < numSubs; i++) {
    events.push({
      time: 45 + Math.floor(Math.random() * 45),
      type: 'substitution',
      team: Math.random() > 0.5 ? 'home' : 'away',
      playerOut: ['White', 'Harris', 'Martin'][Math.floor(Math.random() * 3)],
      playerIn: ['Jackson', 'Thompson', 'Garcia'][Math.floor(Math.random() * 3)],
    });
  }

  return events.sort((a, b) => a.time - b.time);
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/football/matches - Get matches from major competitions
router.get('/matches', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.matches && now - cache.matchesTime < CACHE_TTL) {
      return res.json({ success: true, matches: cache.matches, cached: true });
    }

    let matches = [];

    // Try football-data.org if API key is available
    if (API_KEY) {
      try {
        const { from, to } = getDateRange();
        const url = `${FOOTBALL_DATA_API}/matches?dateFrom=${from}&dateTo=${to}&competitions=PL,CL,PD,SA,BL1,FL1,DED,PPL,EC,CLI`;
        const data = await fetchWithFallback(url, { headers: getHeaders() });
        matches = (data.matches || []).map(transformMatch);
      } catch (err) {
        console.log('football-data.org failed, using fallback:', err.message);
      }
    }

    // Cache the result
    cache.matches = matches;
    cache.matchesTime = now;

    res.json({ success: true, matches, count: matches.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/football/match/:id - Get match details
router.get('/match/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const now = Date.now();

    if (cache.matchDetail[id] && now - cache.matchDetail[id].time < DETAIL_CACHE_TTL) {
      return res.json({ success: true, match: cache.matchDetail[id].data, cached: true });
    }

    let matchDetail = null;

    if (API_KEY) {
      try {
        const url = `${FOOTBALL_DATA_API}/matches/${id}`;
        const data = await fetchWithFallback(url, { headers: getHeaders() });
        matchDetail = transformMatchDetail(data);
      } catch (err) {
        console.log('Match detail fetch failed:', err.message);
      }
    }

    if (matchDetail) {
      cache.matchDetail[id] = { data: matchDetail, time: now };
    }

    res.json({ success: true, match: matchDetail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/football/match/:id/stats - Get match statistics
router.get('/match/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const now = Date.now();

    if (cache.stats[id] && now - cache.stats[id].time < DETAIL_CACHE_TTL) {
      return res.json({ success: true, stats: cache.stats[id].data, cached: true });
    }

    let stats = null;

    if (API_KEY) {
      try {
        const url = `${FOOTBALL_DATA_API}/matches/${id}`;
        const data = await fetchWithFallback(url, { headers: getHeaders() });
        stats = transformStats(
          data.statistics,
          data.homeTeam?.id,
          data.awayTeam?.id
        );
      } catch (err) {
        console.log('Stats fetch failed:', err.message);
      }
    }

    if (stats) {
      cache.stats[id] = { data: stats, time: now };
    }

    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/football/match/:id/lineups - Get match lineups
router.get('/match/:id/lineups', async (req, res) => {
  try {
    const { id } = req.params;
    const now = Date.now();

    if (cache.lineups[id] && now - cache.lineups[id].time < DETAIL_CACHE_TTL) {
      return res.json({ success: true, lineups: cache.lineups[id].data, cached: true });
    }

    let lineups = null;

    if (API_KEY) {
      try {
        const url = `${FOOTBALL_DATA_API}/matches/${id}`;
        const data = await fetchWithFallback(url, { headers: getHeaders() });
        lineups = transformLineup(
          data.lineups,
          data.homeTeam?.id,
          data.awayTeam?.id
        );
      } catch (err) {
        console.log('Lineups fetch failed:', err.message);
      }
    }

    if (lineups) {
      cache.lineups[id] = { data: lineups, time: now };
    }

    res.json({ success: true, lineups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/football/match/:id/events - Get match events
router.get('/match/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const now = Date.now();

    if (cache.events[id] && now - cache.events[id].time < DETAIL_CACHE_TTL) {
      return res.json({ success: true, events: cache.events[id].data, cached: true });
    }

    let events = null;

    if (API_KEY) {
      try {
        const url = `${FOOTBALL_DATA_API}/matches/${id}`;
        const data = await fetchWithFallback(url, { headers: getHeaders() });
        const detail = transformMatchDetail(data);
        events = detail.events || [];
      } catch (err) {
        console.log('Events fetch failed:', err.message);
      }
    }

    if (events) {
      cache.events[id] = { data: events, time: now };
    }

    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/football/competitions - Get available competitions
router.get('/competitions', async (req, res) => {
  try {
    const competitions = [
      { id: 'PL', name: 'Premier League', country: 'England', emblem: '' },
      { id: 'CL', name: 'Champions League', country: 'Europe', emblem: '' },
      { id: 'PD', name: 'La Liga', country: 'Spain', emblem: '' },
      { id: 'SA', name: 'Serie A', country: 'Italy', emblem: '' },
      { id: 'BL1', name: 'Bundesliga', country: 'Germany', emblem: '' },
      { id: 'FL1', name: 'Ligue 1', country: 'France', emblem: '' },
      { id: 'DED', name: 'Eredivisie', country: 'Netherlands', emblem: '' },
      { id: 'PPL', name: 'Primeira Liga', country: 'Portugal', emblem: '' },
      { id: 'EC', name: 'European Championship', country: 'Europe', emblem: '' },
      { id: 'CLI', name: 'Copa Libertadores', country: 'South America', emblem: '' },
    ];

    res.json({ success: true, competitions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/football/demo/:matchId - Generate realistic demo data for any match
router.get('/demo/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;

    // Generate deterministic demo data based on matchId
    const seed = matchId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const rng = () => {
      const x = Math.sin(seed + demoCalls++) * 10000;
      return x - Math.floor(x);
    };
    let demoCalls = 0;

    const lineups = {
      home: generateDemoLineup('Home', true),
      away: generateDemoLineup('Away', false),
    };

    const stats = generateDemoStats();
    const events = generateDemoEvents();

    res.json({
      success: true,
      demo: true,
      lineups,
      stats,
      events,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
