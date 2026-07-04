// ─── Football Stats API Service ─────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Player {
  name: string;
  number: number | null;
  position: string;
  grid: string | null;
  isCaptain: boolean;
  photo: string | null;
}

export interface TeamLineup {
  coach: string;
  formation: string;
  startXI: Player[];
  substitutes: Player[];
}

export interface MatchLineups {
  home: TeamLineup | null;
  away: TeamLineup | null;
}

export interface MatchEvent {
  time: number;
  type: 'goal' | 'yellow_card' | 'red_card' | 'substitution' | 'penalty' | 'var' | 'halftime' | 'fulltime';
  team: 'home' | 'away';
  player?: string;
  playerOut?: string;
  playerIn?: string;
  assist?: string | null;
  card?: string;
}

export interface MatchStatistics {
  possession: [number, number];
  shots: [number, number];
  shotsOnTarget: [number, number];
  shotsOffTarget: [number, number];
  corners: [number, number];
  fouls: [number, number];
  yellowCards: [number, number];
  redCards: [number, number];
  offsides: [number, number];
  passes: [number, number];
  passAccuracy: [number, number];
  freeKicks: [number, number];
  throwIns: [number, number];
  goalkeeperSaves: [number, number];
}

// ─── API Functions ──────────────────────────────────────────────────────────

/**
 * Fetch demo data (lineups, stats, events) for any match ID.
 * This generates realistic demo data when no real API key is available.
 * Passes team names to get real data for known matches.
 */
export async function fetchDemoData(
  matchId: string,
  homeTeam?: string,
  awayTeam?: string,
): Promise<{
  lineups: MatchLineups;
  stats: MatchStatistics;
  events: MatchEvent[];
}> {
  const params = new URLSearchParams();
  if (homeTeam) params.append('homeTeam', homeTeam);
  if (awayTeam) params.append('awayTeam', awayTeam);
  const query = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`${API_BASE}/api/football/demo/${matchId}${query}`);
  if (!res.ok) throw new Error('Failed to fetch demo data');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Unknown error');
  return data;
}

/**
 * Fetch match lineups from football-data.org (if API key configured)
 */
export async function fetchLineups(matchId: string): Promise<MatchLineups | null> {
  try {
    const res = await fetch(`${API_BASE}/api/football/match/${matchId}/lineups`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.lineups;
  } catch {
    return null;
  }
}

/**
 * Fetch match statistics from football-data.org (if API key configured)
 */
export async function fetchStats(matchId: string): Promise<MatchStatistics | null> {
  try {
    const res = await fetch(`${API_BASE}/api/football/match/${matchId}/stats`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.stats;
  } catch {
    return null;
  }
}

/**
 * Fetch match events from football-data.org (if API key configured)
 */
export async function fetchEvents(matchId: string): Promise<MatchEvent[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/football/match/${matchId}/events`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.events;
  } catch {
    return null;
  }
}

/**
 * Fetch all football data (lineups + stats + events) for a match.
 * Uses demo data as fallback when real API is unavailable.
 * Passes team names to get real data for known matches.
 */
export async function fetchFootballData(
  matchId: string,
  homeTeam?: string,
  awayTeam?: string,
): Promise<{
  lineups: MatchLineups;
  stats: MatchStatistics;
  events: MatchEvent[];
  isDemo: boolean;
}> {
  // Try real API first
  const [lineups, stats, events] = await Promise.all([
    fetchLineups(matchId),
    fetchStats(matchId),
    fetchEvents(matchId),
  ]);

  // If real data is available, use it
  if (lineups && stats && events) {
    return {
      lineups,
      stats,
      events,
      isDemo: false,
    };
  }

  // Fallback to demo data (passes team names for real data lookup)
  const demo = await fetchDemoData(matchId, homeTeam, awayTeam);
  return {
    ...demo,
    isDemo: true,
  };
}
