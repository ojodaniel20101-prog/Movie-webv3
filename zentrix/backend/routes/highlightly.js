/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HIGHLIGHTLY PROXY — Match Statistics, Lineups, Events, Standings, Leagues
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Mirrors VioletFlix's /api/highlightly/* API shape.
 * Upstream: football-data.org v4 (requires FOOTBALL_DATA_API_KEY env var).
 *
 * Endpoints:
 *   GET /api/highlightly/match-id?date=YYYY-MM-DD&home=Team&away=Team
 *   GET /api/highlightly/statistics?matchId={fdMatchId}
 *   GET /api/highlightly/lineups?matchId={fdMatchId}
 *   GET /api/highlightly/events?matchId={fdMatchId}
 *   GET /api/highlightly/standings?leagueId={fdCompId}&season={year}
 *   GET /api/highlightly/leagues
 */

const express = require('express');
const router = express.Router();

const FD_API = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';

const HEADERS = {
  'X-Auth-Token': API_KEY,
  'Content-Type': 'application/json',
};

const cache = {};
const CACHE_TTL = 60 * 1000;

async function fdFetch(path) {
  const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
  const url = `${FD_API}${path}`;
  const resp = await fetch(url, { headers: HEADERS, timeout: 15000 });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`FD ${resp.status}: ${text.slice(0,200)}`);
  }
  return resp.json();
}

function getCached(key, factory) {
  const now = Date.now();
  if (cache[key] && now - cache[key].ts < CACHE_TTL) return cache[key].data;
  const data = factory();
  cache[key] = { data, ts: now };
  return data;
}

function normalizeName(n) {
  return String(n || '').toLowerCase().replace(/[^\w\s]/g, '').trim();
}
function nameScore(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const aw = na.split(/\s+/), bw = nb.split(/\s+/);
  const common = aw.filter(w => bw.includes(w));
  return common.length / Math.max(aw.length, bw.length);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/highlightly/match-id ──────────────────────────────────────────
// Resolves team names + date → football-data match ID
router.get('/match-id', async (req, res) => {
  const { date, home, away } = req.query;
  if (!date || !home || !away) {
    return res.status(400).json({ success: false, error: 'date, home, away required' });
  }

  try {
    const data = await fdFetch(`/matches?dateFrom=${date}&dateTo=${date}`);
    const matches = data.matches || [];

    let best = null, bestScore = 0;
    for (const m of matches) {
      const hName = m.homeTeam?.name || '';
      const aName = m.awayTeam?.name || '';
      const score = (nameScore(hName, home) + nameScore(aName, away)) / 2;
      if (score > bestScore) { bestScore = score; best = m; }
    }

    if (!best || bestScore < 0.3) {
      return res.json({ success: false, id: null, score: bestScore });
    }

    res.json({
      success: true,
      id: String(best.id),
      score: bestScore,
      homeTeam: best.homeTeam?.name,
      awayTeam: best.awayTeam?.name,
      competition: best.competition?.name,
      utcDate: best.utcDate,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/highlightly/statistics ────────────────────────────────────────
router.get('/statistics', async (req, res) => {
  const { matchId } = req.query;
  if (!matchId) return res.status(400).json({ success: false, error: 'matchId required' });

  try {
    const data = await fdFetch(`/matches/${matchId}`);
    const stats = data.statistics || [];

    const transformed = stats.map(s => ({
      team: {
        id: s.team?.id,
        name: s.team?.name,
        shortName: s.team?.shortName,
        tla: s.team?.tla,
      },
      statistics: (s.statistics || []).map(st => ({
        type: st.type,
        value: st.value,
      })),
    }));

    res.json({ success: transformed.length > 0, statistics: transformed });
  } catch (err) {
    res.status(500).json({ success: false, statistics: [], error: err.message });
  }
});

// ─── GET /api/highlightly/lineups ───────────────────────────────────────────
router.get('/lineups', async (req, res) => {
  const { matchId } = req.query;
  if (!matchId) return res.status(400).json({ success: false, error: 'matchId required' });

  try {
    const data = await fdFetch(`/matches/${matchId}`);
    const lineups = data.lineups || [];
    const homeId = data.homeTeam?.id;
    const awayId = data.awayTeam?.id;

    const findTeam = (id) => lineups.find(l => l.team?.id === id);

    const fmtPlayer = (p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      shirtNumber: p.shirtNumber,
      grid: p.grid || null,
    });

    const fmtTeam = (lu) => {
      if (!lu) return null;
      return {
        team: {
          id: lu.team?.id,
          name: lu.team?.name,
          shortName: lu.team?.shortName,
          tla: lu.team?.tla,
        },
        formation: lu.formation || '',
        coach: lu.coach?.name || '',
        startXI: (lu.startXI || []).map(x => fmtPlayer(x.player || x)),
        substitutes: (lu.bench || []).map(x => fmtPlayer(x.player || x)),
      };
    };

    res.json({
      success: true,
      homeTeam: fmtTeam(findTeam(homeId)),
      awayTeam: fmtTeam(findTeam(awayId)),
    });
  } catch (err) {
    res.status(500).json({ success: false, homeTeam: null, awayTeam: null, error: err.message });
  }
});

// ─── GET /api/highlightly/events ────────────────────────────────────────────
router.get('/events', async (req, res) => {
  const { matchId } = req.query;
  if (!matchId) return res.status(400).json({ success: false, error: 'matchId required' });

  try {
    const data = await fdFetch(`/matches/${matchId}`);
    const homeId = data.homeTeam?.id;

    const goals = (data.goals || []).map(g => ({
      minute: g.minute || 0,
      type: 'goal',
      team: g.team?.id === homeId ? 'home' : 'away',
      player: g.scorer?.name || 'Unknown',
      assist: g.assist?.name || null,
      extraTime: g.extraTime || null,
    }));

    const bookings = (data.bookings || []).map(b => ({
      minute: b.minute || 0,
      type: b.card === 'RED_CARD' ? 'red_card' : 'yellow_card',
      team: b.team?.id === homeId ? 'home' : 'away',
      player: b.player?.name || 'Unknown',
      card: b.card,
    }));

    const substitutions = (data.substitutions || []).flatMap(subs =>
      (subs.substitutions || []).map(sub => ({
        minute: sub.minute || 0,
        type: 'substitution',
        team: subs.team?.id === homeId ? 'home' : 'away',
        playerOut: sub.playerOut?.name || 'Unknown',
        playerIn: sub.playerIn?.name || 'Unknown',
      }))
    );

    const allEvents = [...goals, ...bookings, ...substitutions]
      .sort((a, b) => a.minute - b.minute);

    res.json({ success: allEvents.length > 0, events: allEvents });
  } catch (err) {
    res.status(500).json({ success: false, events: [], error: err.message });
  }
});

// ─── GET /api/highlightly/standings ─────────────────────────────────────────
router.get('/standings', async (req, res) => {
  const { leagueId, season } = req.query;
  if (!leagueId) return res.status(400).json({ success: false, error: 'leagueId required' });

  try {
    const path = season
      ? `/competitions/${leagueId}/standings?season=${season}`
      : `/competitions/${leagueId}/standings`;
    const data = await fdFetch(path);

    const standings = (data.standings || []).map(s => ({
      stage: s.stage || '',
      type: s.type || '',
      group: s.group || null,
      table: (s.table || []).map(t => ({
        position: t.position,
        team: {
          id: t.team?.id,
          name: t.team?.name,
          shortName: t.team?.shortName,
          tla: t.team?.tla,
          crest: t.team?.crest,
        },
        playedGames: t.playedGames,
        won: t.won,
        draw: t.draw,
        lost: t.lost,
        points: t.points,
        goalsFor: t.goalsFor,
        goalsAgainst: t.goalsAgainst,
        goalDifference: t.goalDifference,
      })),
    }));

    res.json({ success: true, standings });
  } catch (err) {
    res.status(500).json({ success: false, standings: [], error: err.message });
  }
});

// ─── GET /api/highlightly/leagues ───────────────────────────────────────────
router.get('/leagues', async (req, res) => {
  try {
    const data = await fdFetch('/competitions');
    const leagues = (data.competitions || [])
      .filter(c => c.plan === 'TIER_ONE')
      .map(c => ({
        id: String(c.id),
        name: c.name,
        code: c.code,
        type: c.type,
        emblem: c.emblem,
        area: c.area?.name || '',
      }));

    res.json({ success: true, leagues });
  } catch (err) {
    res.status(500).json({ success: false, leagues: [], error: err.message });
  }
});

module.exports = router;
