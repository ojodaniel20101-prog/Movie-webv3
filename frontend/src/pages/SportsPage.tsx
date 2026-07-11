import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Wifi, WifiOff, RefreshCw, Play, Clock,
  CheckCircle2, Loader2,
  TrendingUp, Calendar, Shield, Swords, Target,
  Activity, X, Maximize, Minimize,
  Star, AlertCircle, ChevronDown, BarChart3,
  Users, Timer, Flag, Smartphone, Monitor, AlertTriangle
} from 'lucide-react';
import Hls from 'hls.js';
import MatchStatsOverlay from '../components/football/MatchStatsOverlay';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Stream {
  name: string;
  url: string;
  type: string;
  quality: string;
  ok?: boolean;
  ms?: number;
}

interface EmbedhdStream {
  hd: number;
  link: string;
}

interface PeriodScore {
  name: string;
  home: string | number;
  away: string | number;
}

interface MatchEvent {
  time: string;
  type: 'goal' | 'card' | 'substitution' | 'penalty' | 'var' | 'halftime' | 'fulltime';
  team: 'home' | 'away';
  player?: string;
  detail?: string;
}

interface MatchStats {
  possession?: [number, number];
  shots?: [number, number];
  shotsOnTarget?: [number, number];
  corners?: [number, number];
  fouls?: [number, number];
  yellowCards?: [number, number];
  redCards?: [number, number];
  offsides?: [number, number];
}

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  homeScore: string;
  awayScore: string;
  status: 'LIVE' | 'UPCOMING' | 'FINISHED' | 'HALF_TIME' | string;
  streams: Stream[];
  embedhdStreams?: EmbedhdStream[];
  startTime: number | null;
  league: string | null;
  round?: string;
  periodScores?: PeriodScore[];
  events?: MatchEvent[];
  stats?: MatchStats;
  venue?: string;
  referee?: string;
}

const SPORTS = [
  { key: 'football',   label: 'Football',   icon: '⚽' },
  { key: 'basketball', label: 'Basketball', icon: '🏀' },
  { key: 'tennis',     label: 'Tennis',     icon: '🎾' },
  { key: 'cricket',    label: 'Cricket',    icon: '🏏' },
];

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Utility: Format Match Time ──────────────────────────────────────────────
function formatMatchTime(timestamp: number | null): string {
  if (!timestamp) return 'TBD';

  const now = new Date();
  const date = new Date(timestamp * 1000);

  // Reset hours to compare dates only
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const matchDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffMs = matchDate.getTime() - nowDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  if (diffDays === 0) return `Today ${timeStr}`;
  if (diffDays === 1) return `Tomorrow ${timeStr}`;

  const weekday = date.toLocaleDateString([], { weekday: 'long' });
  return `${weekday} ${timeStr}`;
}

// ─── Utility: Skeleton Shimmer ───────────────────────────────────────────────
function SkeletonShimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-0 skeleton-shimmer" />
    </div>
  );
}

// ─── Component: LivePulseBadge ───────────────────────────────────────────────
function LivePulseBadge({ count }: { count: number }) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.15))',
        border: '1px solid rgba(239,68,68,0.4)',
      }}
    >
      {/* Animated pulse rings */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
      <span className="text-[10px] font-black tracking-wider" style={{ color: '#ff6b6b' }}>
        {count} LIVE
      </span>
    </motion.div>
  );
}

// ─── Component: StatusBadge ──────────────────────────────────────────────────
function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const isLive = status === 'LIVE';
  const isUpcoming = status === 'UPCOMING';
  const isHalfTime = status === 'HALF_TIME';

  const sizeClasses = size === 'md'
    ? 'px-3 py-1 text-xs gap-1.5'
    : 'px-2 py-0.5 text-[10px] gap-1';

  if (isLive) return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-full font-black`}
      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ff6b6b' }}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
      </span>
      LIVE
    </span>
  );

  if (isUpcoming) return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-full font-black`}
      style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', color: '#f0c040' }}>
      <Clock size={size === 'md' ? 12 : 9} /> UPCOMING
    </span>
  );

  if (isHalfTime) return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-full font-black`}
      style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
      <Timer size={size === 'md' ? 12 : 9} /> HT
    </span>
  );

  return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-full font-black`}
      style={{ background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', color: '#94a3b8' }}>
      <CheckCircle2 size={size === 'md' ? 12 : 9} /> FT
    </span>
  );
}

// ─── Component: TeamLogo ─────────────────────────────────────────────────────
function TeamLogo({ src, name, size = 'md' }: { src?: string; name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const [err, setErr] = useState(false);

  const sizeMap = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-lg',
  };

  if (err || !src) return (
    <div className={`${sizeMap[size]} rounded-full flex items-center justify-center font-black`}
      style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))', color: '#8899AA', border: '1px solid rgba(255,255,255,0.06)' }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );

  return (
    <img
      src={src}
      alt={name}
      className={`${sizeMap[size]} object-contain rounded-full`}
      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
      onError={() => setErr(true)}
    />
  );
}

// ─── Component: StatBar ──────────────────────────────────────────────────────
function StatBar({ label, values, colors }: { label: string; values: [number, number]; colors?: [string, string] }) {
  const total = values[0] + values[1];
  const homePct = total === 0 ? 50 : (values[0] / total) * 100;
  const awayPct = total === 0 ? 50 : (values[1] / total) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold" style={{ color: colors?.[0] || '#fff' }}>{values[0]}</span>
        <span style={{ color: '#8899AA' }}>{label}</span>
        <span className="font-bold" style={{ color: colors?.[1] || '#fff' }}>{values[1]}</span>
      </div>
      <div className="flex gap-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${homePct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: colors?.[0] || '#00D4FF' }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${awayPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
          className="h-full rounded-full"
          style={{ background: colors?.[1] || '#8B5CF6' }}
        />
      </div>
    </div>
  );
}

// ─── Component: MatchEventTimeline ───────────────────────────────────────────
function MatchEventTimeline({ events }: { events?: MatchEvent[] }) {
  if (!events || events.length === 0) return null;

  const eventIcons: Record<string, string> = {
    goal: '⚽',
    card: '🟨',
    substitution: '🔄',
    penalty: '🎯',
    var: '📺',
    halftime: '⏸️',
    fulltime: '🏁',
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#8899AA' }}>
        <Activity size={12} /> Match Events
      </h4>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
        {events.map((evt, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: evt.team === 'home' ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-2 text-[11px]"
          >
            <span className="font-mono font-bold w-8 text-right" style={{ color: '#00D4FF' }}>{evt.time}'</span>
            <span>{eventIcons[evt.type] || '•'}</span>
            <span className={evt.team === 'home' ? 'text-left flex-1' : 'text-right flex-1'} style={{ color: '#e2e8f0' }}>
              {evt.player}{evt.detail ? ` (${evt.detail})` : ''}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Component: MatchDetailPanel ─────────────────────────────────────────────
function MatchDetailPanel({ match, onClose, onPlay, source }: {
  match: Match;
  onClose: () => void;
  onPlay: (match: Match) => void;
  source: 'local' | 'english';
}) {
  const canPlay = match.status === 'LIVE' && (match.streams.length > 0 || (match.embedhdStreams && match.embedhdStreams.length > 0));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-t-3xl"
        style={{
          background: 'linear-gradient(180deg, #0a0e27 0%, #050816 100%)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4">
          <div className="flex items-center justify-between mb-4">
            <StatusBadge status={match.status} size="md" />
            <button onClick={onClose} className="p-2 rounded-full transition-colors hover:bg-white/10">
              <X size={18} style={{ color: '#8899AA' }} />
            </button>
          </div>

          {/* Teams & Score */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col items-center gap-2 flex-1">
              <TeamLogo src={match.homeLogo} name={match.homeTeam} size="lg" />
              <span className="text-sm font-bold text-center text-white">{match.homeTeam}</span>
            </div>

            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="text-4xl font-black text-white tabular-nums tracking-tight">
                {match.homeScore} <span style={{ color: '#8899AA' }} className="text-2xl">:</span> {match.awayScore}
              </div>
              {match.league && (
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: '#8899AA' }}>
                  {match.league}
                </span>
              )}
            </div>

            <div className="flex flex-col items-center gap-2 flex-1">
              <TeamLogo src={match.awayLogo} name={match.awayTeam} size="lg" />
              <span className="text-sm font-bold text-center text-white">{match.awayTeam}</span>
            </div>
          </div>

          {/* Match Info */}
          <div className="flex items-center justify-center gap-4 mt-4 text-[10px]" style={{ color: '#8899AA' }}>
            {match.venue && <span className="flex items-center gap-1"><Flag size={10} /> {match.venue}</span>}
            {match.referee && <span className="flex items-center gap-1"><Users size={10} /> {match.referee}</span>}
            {match.startTime && (
              <span className="flex items-center gap-1">
                <Calendar size={10} />
                {formatMatchTime(match.startTime)}
              </span>
            )}
          </div>
        </div>

        {/* Watch Button */}
        {canPlay && (
          <div className="px-5 pb-4">
            <motion.button
              onClick={() => onPlay(match)}
              whileTap={{ scale: 0.97 }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold"
              style={{
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: 'white',
                boxShadow: '0 8px 32px rgba(239,68,68,0.35), 0 0 0 1px rgba(239,68,68,0.3)',
              }}
            >
              <Play size={16} className="fill-current" />
              Watch Live Stream
            </motion.button>
          </div>
        )}

        {/* Period Scores */}
        {match.periodScores && match.periodScores.length > 0 && (
          <div className="px-5 pb-4">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h4 className="text-xs font-bold mb-3 flex items-center gap-1.5" style={{ color: '#8899AA' }}>
                <BarChart3 size={12} /> Period Scores
              </h4>
              <div className="grid grid-cols-7 gap-2">
                {match.periodScores.map((ps, i) => (
                  <div key={i} className="text-center">
                    <div className="text-[9px] mb-1" style={{ color: '#8899AA' }}>{ps.name}</div>
                    <div className="text-xs font-bold text-white">{ps.home}-{ps.away}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Statistics */}
        {match.stats && (
          <div className="px-5 pb-4">
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h4 className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#8899AA' }}>
                <TrendingUp size={12} /> Match Statistics
              </h4>
              {match.stats.possession && <StatBar label="Possession %" values={match.stats.possession} colors={['#00D4FF', '#8B5CF6']} />}
              {match.stats.shots && <StatBar label="Shots" values={match.stats.shots} />}
              {match.stats.shotsOnTarget && <StatBar label="Shots on Target" values={match.stats.shotsOnTarget} colors={['#22c55e', '#16a34a']} />}
              {match.stats.corners && <StatBar label="Corners" values={match.stats.corners} colors={['#f59e0b', '#d97706']} />}
              {match.stats.fouls && <StatBar label="Fouls" values={match.stats.fouls} colors={['#ef4444', '#dc2626']} />}
              {match.stats.yellowCards && <StatBar label="Yellow Cards" values={match.stats.yellowCards} colors={['#eab308', '#ca8a04']} />}
              {match.stats.offsides && <StatBar label="Offsides" values={match.stats.offsides} colors={['#6b7280', '#4b5563']} />}
            </div>
          </div>
        )}

        {/* Events */}
        {match.events && match.events.length > 0 && (
          <div className="px-5 pb-6">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <MatchEventTimeline events={match.events} />
            </div>
          </div>
        )}

        {/* Football Stats Overlay */}
        <div className="px-5 pb-6">
          <MatchStatsOverlay
            matchId={match.id}
            homeTeamName={match.homeTeam}
            awayTeamName={match.awayTeam}
            isLive={match.status === 'LIVE'}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Component: HeroMatch ────────────────────────────────────────────────────
function HeroMatch({ match, onPlay, onViewDetails, source }: {
  match: Match;
  onPlay: (match: Match) => void;
  onViewDetails: (match: Match) => void;
  source: 'local' | 'english';
}) {
  const canPlay = match.status === 'LIVE' && (match.streams.length > 0 || (match.embedhdStreams && match.embedhdStreams.length > 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl overflow-hidden mx-4 mb-6"
      style={{
        background: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(10,14,39,0.95) 50%, rgba(139,92,246,0.08) 100%)',
        border: '1px solid rgba(239,68,68,0.2)',
        boxShadow: '0 8px 48px rgba(239,68,68,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* Glow effect */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.5), transparent 70%)' }}
      />

      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={match.status} size="md" />
            {match.league && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: '#8899AA' }}>
                {match.league}
              </span>
            )}
          </div>
          {match.round && <span className="text-[10px]" style={{ color: '#8899AA' }}>{match.round}</span>}
        </div>

        {/* Teams & Score */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex flex-col items-center gap-2 flex-1">
            <TeamLogo src={match.homeLogo} name={match.homeTeam} size="xl" />
            <span className="text-sm font-bold text-center text-white leading-tight">{match.homeTeam}</span>
          </div>

          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="text-5xl font-black text-white tabular-nums tracking-tighter">
              {match.homeScore} <span style={{ color: 'rgba(255,255,255,0.3)' }} className="text-3xl mx-1">:</span> {match.awayScore}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 flex-1">
            <TeamLogo src={match.awayLogo} name={match.awayTeam} size="xl" />
            <span className="text-sm font-bold text-center text-white leading-tight">{match.awayTeam}</span>
          </div>
        </div>

        {/* Quick Stats Preview */}
        {match.stats?.possession && (
          <div className="mb-4 px-2">
            <StatBar label="Possession" values={match.stats.possession} colors={['#00D4FF', '#8B5CF6']} />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {canPlay && (
            <motion.button
              onClick={() => onPlay(match)}
              whileTap={{ scale: 0.97 }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold"
              style={{
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: 'white',
                boxShadow: '0 4px 20px rgba(239,68,68,0.35)',
              }}
            >
              <Play size={16} className="fill-current" />
              Watch Live
            </motion.button>
          )}
          <motion.button
            onClick={() => onViewDetails(match)}
            whileTap={{ scale: 0.97 }}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold"
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <BarChart3 size={16} />
            Details
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Component: MatchCard (Improved) ─────────────────────────────────────────
function MatchCard({ match, onPlay, onViewDetails, source, index }: {
  match: Match;
  onPlay: (match: Match) => void;
  onViewDetails: (match: Match) => void;
  source: 'local' | 'english';
  index: number;
}) {
  const canPlay = match.status === 'LIVE' && (match.streams.length > 0 || (match.embedhdStreams && match.embedhdStreams.length > 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onViewDetails(match)}
      className="relative rounded-2xl overflow-hidden p-4 cursor-pointer group"
      style={{
        background: match.status === 'LIVE'
          ? 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(10,14,39,0.9))'
          : 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
        border: match.status === 'LIVE'
          ? '1px solid rgba(239,68,68,0.2)'
          : '1px solid rgba(255,255,255,0.06)',
        boxShadow: match.status === 'LIVE'
          ? '0 4px 24px rgba(239,68,68,0.1)'
          : '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      {/* Hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.03), transparent 60%)' }}
      />

      {/* League */}
      {match.league && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] truncate font-semibold" style={{ color: '#8899AA' }}>{match.league}</p>
          <StatusBadge status={match.status} />
        </div>
      )}

      {/* Teams & Score */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <TeamLogo src={match.homeLogo} name={match.homeTeam} />
          <p className="text-xs font-bold text-center text-white truncate w-full px-1">{match.homeTeam}</p>
        </div>

        <div className="flex flex-col items-center gap-1 flex-shrink-0 px-2">
          {!match.league && <StatusBadge status={match.status} />}
          {match.status !== 'UPCOMING' ? (
            <p className="text-2xl font-black text-white tabular-nums">
              {match.homeScore} <span style={{ color: 'rgba(255,255,255,0.25)' }} className="text-lg">:</span> {match.awayScore}
            </p>
          ) : (
            <p className="text-sm font-bold" style={{ color: '#f0c040' }}>
              {formatMatchTime(match.startTime)}
            </p>
          )}
          {match.round && <p className="text-[9px]" style={{ color: '#8899AA' }}>{match.round}</p>}
        </div>

        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <TeamLogo src={match.awayLogo} name={match.awayTeam} />
          <p className="text-xs font-bold text-center text-white truncate w-full px-1">{match.awayTeam}</p>
        </div>
      </div>

      {/* Quick Stats Row */}
      {match.stats && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center justify-center gap-4 text-[10px]" style={{ color: '#8899AA' }}>
            {match.stats.possession && (
              <span className="flex items-center gap-1">
                <Target size={9} /> {match.stats.possession[0]}%-{match.stats.possession[1]}%
              </span>
            )}
            {match.stats.shots && (
              <span className="flex items-center gap-1">
                <Swords size={9} /> {match.stats.shots[0]}-{match.stats.shots[1]}
              </span>
            )}
            {match.stats.corners && (
              <span className="flex items-center gap-1">
                <Flag size={9} /> {match.stats.corners[0]}-{match.stats.corners[1]}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Watch Button */}
      {canPlay && (
        <motion.button
          onClick={(e) => { e.stopPropagation(); onPlay(match); }}
          whileTap={{ scale: 0.95 }}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold"
          style={{
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: 'white',
            boxShadow: '0 4px 16px rgba(239,68,68,0.25)',
          }}
        >
          <Play size={12} className="fill-current" />
          Watch Live
        </motion.button>
      )}
      {!canPlay && match.status === 'LIVE' && (
        <div className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(255,255,255,0.03)', color: '#8899AA' }}>
          <WifiOff size={12} /> No stream available
        </div>
      )}
    </motion.div>
  );
}

// ─── Component: LeagueFilter ─────────────────────────────────────────────────
function LeagueFilter({ leagues, active, onChange }: {
  leagues: string[];
  active: string | null;
  onChange: (league: string | null) => void;
}) {
  return (
    <div className="flex gap-2 px-4 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onChange(null)}
        className="flex-shrink-0 px-4 py-1.5 rounded-xl text-[11px] font-bold transition-all"
        style={active === null ? {
          background: 'linear-gradient(135deg, #00D4FF22, #8B5CF622)',
          border: '1px solid rgba(0,212,255,0.4)', color: '#00D4FF',
        } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899AA' }}
      >
        All Leagues
      </motion.button>
      {leagues.map(league => (
        <motion.button
          key={league}
          whileTap={{ scale: 0.95 }}
          onClick={() => onChange(active === league ? null : league)}
          className="flex-shrink-0 px-4 py-1.5 rounded-xl text-[11px] font-bold transition-all"
          style={active === league ? {
            background: 'linear-gradient(135deg, #00D4FF22, #8B5CF622)',
            border: '1px solid rgba(0,212,255,0.4)', color: '#00D4FF',
          } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899AA' }}
        >
          {league}
        </motion.button>
      ))}
    </div>
  );
}

// ─── Component: SkeletonCard ─────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <SkeletonShimmer className="h-3 w-24 rounded mb-3" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col items-center gap-1.5 flex-1">
          <SkeletonShimmer className="w-10 h-10 rounded-full" />
          <SkeletonShimmer className="h-3 w-16 rounded" />
        </div>
        <SkeletonShimmer className="h-6 w-16 rounded" />
        <div className="flex flex-col items-center gap-1.5 flex-1">
          <SkeletonShimmer className="w-10 h-10 rounded-full" />
          <SkeletonShimmer className="h-3 w-16 rounded" />
        </div>
      </div>
      <SkeletonShimmer className="h-8 w-full rounded-xl mt-3" />
    </div>
  );
}

// ─── Component: SkeletonHero ─────────────────────────────────────────────────
function SkeletonHero() {
  return (
    <div className="rounded-3xl overflow-hidden mx-4 mb-6 p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <SkeletonShimmer className="h-5 w-20 rounded-full mb-4" />
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex flex-col items-center gap-2 flex-1">
          <SkeletonShimmer className="w-20 h-20 rounded-full" />
          <SkeletonShimmer className="h-3 w-20 rounded" />
        </div>
        <SkeletonShimmer className="h-12 w-24 rounded" />
        <div className="flex flex-col items-center gap-2 flex-1">
          <SkeletonShimmer className="w-20 h-20 rounded-full" />
          <SkeletonShimmer className="h-3 w-20 rounded" />
        </div>
      </div>
      <SkeletonShimmer className="h-10 w-full rounded-2xl" />
    </div>
  );
}

// ─── Shared: StreamSelector ──────────────────────────────────────────────────
function StreamSelector({
  streams,
  activeIndex,
  onSelect,
}: {
  streams: { label: string; hd?: number }[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Activity size={12} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--text-secondary)' }}>STREAM</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {streams.map((s, i) => {
            const isActive = i === activeIndex;
            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.9 }}
                onClick={() => onSelect(i)}
                className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-all"
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,212,255,0.15))',
                  border: '1.5px solid rgba(0,212,255,0.6)',
                  color: '#22D3EE',
                  boxShadow: '0 0 12px rgba(0,212,255,0.2)',
                } : {
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--text-secondary)',
                }}
              >
                {i + 1}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Shared: SourceSelector ──────────────────────────────────────────────────
function SourceSelector({
  sources,
  activeSource,
  onSelect,
}: {
  sources: string[];
  activeSource: string;
  onSelect: (source: string) => void;
}) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Monitor size={12} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--text-secondary)' }}>SOURCE</span>
        </div>
        <div className="flex gap-2">
          {sources.map((src) => {
            const isActive = src === activeSource;
            return (
              <motion.button
                key={src}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelect(src)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,212,255,0.15))',
                  border: '1.5px solid rgba(0,212,255,0.6)',
                  color: '#22D3EE',
                  boxShadow: '0 0 12px rgba(0,212,255,0.2)',
                } : {
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--text-secondary)',
                }}
              >
                {src}
                {isActive && <CheckCircle2 size={12} />}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Shared: MatchInfoBar ────────────────────────────────────────────────────
function MatchInfoBar({ match }: { match: Match }) {
  const statusDisplay = match.status === 'HALF_TIME' ? 'HT'
    : match.status === 'LIVE' ? 'LIVE'
    : match.status === 'UPCOMING' ? 'UPCOMING'
    : 'FT';

  const statusColor = match.status === 'LIVE' ? '#ef4444'
    : match.status === 'HALF_TIME' ? '#3b82f6'
    : match.status === 'UPCOMING' ? '#f0c040'
    : '#94a3b8';

  return (
    <div className="px-4 py-4">
      {/* Sport & Status */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-[10px] font-bold tracking-widest" style={{ color: 'var(--text-secondary)' }}>
          {match.league?.toUpperCase() || 'FOOTBALL'}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: statusColor }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{ background: statusColor }} />
          </span>
          <span className="text-[10px] font-black tracking-wider" style={{ color: statusColor }}>
            {statusDisplay}
          </span>
        </div>
      </div>

      {/* Home Team */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <TeamLogo src={match.homeLogo} name={match.homeTeam} size="md" />
          <span className="text-sm font-bold text-white">{match.homeTeam}</span>
        </div>
        <span className="text-3xl font-black text-white tabular-nums">{match.homeScore}</span>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 my-2">
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.08))' }} />
        <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>VS</span>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.08))' }} />
      </div>

      {/* Away Team */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <TeamLogo src={match.awayLogo} name={match.awayTeam} size="md" />
          <span className="text-sm font-bold text-white">{match.awayTeam}</span>
        </div>
        <span className="text-3xl font-black text-white tabular-nums">{match.awayScore}</span>
      </div>
    </div>
  );
}

// ─── Shared: VideoPlayerCore ─────────────────────────────────────────────────
function VideoPlayerCore({
  videoRef,
  loading,
  error,
  rankedStreams,
  onRetry,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  loading: boolean;
  error: string | null;
  rankedStreams: { url?: string }[];
  onRetry: () => void;
}) {
  return (
    <div className="relative w-full" style={{ aspectRatio: '16/9', background: '#000' }}>
      {/* Loading State */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
          <div className="relative">
            <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#22D3EE' }} />
            <div className="absolute inset-0 blur-lg opacity-50">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#22D3EE' }} />
            </div>
          </div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Loading stream...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-4">
          <WifiOff className="w-12 h-12 mb-3" style={{ color: '#ef4444' }} />
          <p className="text-white font-bold text-base text-center">{error}</p>
          {rankedStreams.length > 1 && (
            <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-secondary)' }}>
              Try a different stream below
            </p>
          )}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold"
            style={{
              background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,212,255,0.1))',
              border: '1px solid rgba(0,212,255,0.4)',
              color: '#22D3EE',
            }}
          >
            <RefreshCw size={12} /> Retry
          </motion.button>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          playsInline
          style={{ opacity: loading ? 0 : 1, objectFit: 'contain' }}
        />
      )}

      {/* LIVE Badge */}
      <div className="absolute top-3 left-3 z-20">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(239,68,68,0.9)', backdropFilter: 'blur(8px)' }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
          </span>
          <span className="text-[10px] font-black tracking-wider text-white">LIVE</span>
        </div>
      </div>

      {/* HD Badge */}
      <div className="absolute top-3 right-3 z-20">
        <div className="px-2 py-0.5 rounded-md"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <span className="text-[10px] font-black tracking-wider text-white">HD</span>
        </div>
      </div>
    </div>
  );
}

// ─── Shared: PlayerHeader ────────────────────────────────────────────────────
function PlayerHeader({
  match,
  onClose,
  onRefresh,
  isFullscreen,
  onToggleFullscreen,
}: {
  match: Match;
  onClose: () => void;
  onRefresh?: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
      style={{ background: 'var(--bg)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="p-2 rounded-xl transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ChevronDown size={18} style={{ color: '#fff' }} />
        </motion.button>
        <div>
          <p className="text-sm font-bold text-white">{match.homeTeam} <span style={{ color: 'var(--text-muted)' }}>vs</span> {match.awayTeam}</p>
          {match.league && <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{match.league}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)' }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
          <span className="text-[10px] font-black tracking-wider" style={{ color: '#ff6b6b' }}>LIVE</span>
        </div>
        {onRefresh && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onRefresh}
            className="p-2 rounded-xl transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RefreshCw size={14} style={{ color: 'var(--text-secondary)' }} />
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleFullscreen}
          className="p-2 rounded-xl transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {isFullscreen ? <Minimize size={14} style={{ color: '#fff' }} /> : <Maximize size={14} style={{ color: '#fff' }} />}
        </motion.button>
      </div>
    </div>
  );
}

// ─── Shared: LandscapeHint ───────────────────────────────────────────────────
function LandscapeHint() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mx-4 mt-3 mb-1"
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
        style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.12)' }}>
        <Smartphone size={14} className="flex-shrink-0" style={{ color: '#22D3EE' }} />
        <span className="text-xs flex-1" style={{ color: '#22D3EE' }}>
          Rotate to landscape for the best experience
        </span>
        <button onClick={() => setDismissed(true)} className="p-1 rounded-lg hover:bg-white/5">
          <X size={12} style={{ color: '#22D3EE' }} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Local Sports Player ─────────────────────────────────────────────────────
function LocalSportsPlayer({ match, onClose }: { match: Match; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [rankedStreams, setRankedStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [testing, setTesting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSource, setActiveSource] = useState('Admin');

  const sourceOptions = ['Channel 1', 'Channel 2', 'Channel 3', 'Channel 4'];

  // Test streams and rank them
  useEffect(() => {
    if (!match.streams.length) {
      setTesting(false);
      setError('No streams available');
      return;
    }
    setTesting(true);
    fetch(`${API_BASE}/api/sports/test-streams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streams: match.streams }),
    })
      .then(r => r.json())
      .then(data => {
        const sorted: Stream[] = data.streams || match.streams;
        setRankedStreams(sorted);
        const best = sorted.find((s: Stream) => s.ok !== false) || sorted[0];
        setActiveStream(best);
      })
      .catch(() => {
        setRankedStreams(match.streams);
        setActiveStream(match.streams[0]);
      })
      .finally(() => setTesting(false));
  }, [match.id]);

  // Load active stream into HLS
  useEffect(() => {
    if (!activeStream || !videoRef.current) return;
    setLoading(true);
    setError(null);
    const proxyUrl = `${API_BASE}/api/sports/stream-proxy?url=${encodeURIComponent(activeStream.url)}`;
    const video = videoRef.current;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(proxyUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setLoading(false); video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError('Stream unavailable \u2014 try another'); });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxyUrl;
      video.addEventListener('loadedmetadata', () => { setLoading(false); video.play().catch(() => {}); });
      video.addEventListener('error', () => setError('Stream unavailable'));
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [activeStream?.url]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const activeStreamIndex = rankedStreams.findIndex(s => s.url === activeStream?.url);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <PlayerHeader
        match={match}
        onClose={onClose}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {/* Landscape Hint */}
        <LandscapeHint />

        {/* Video Player Container */}
        <div className="px-4 mt-3">
          <div className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            {/* Video - 16:9 centered */}
            <VideoPlayerCore
              videoRef={videoRef}
              loading={testing || loading}
              error={error}
              rankedStreams={rankedStreams}
              onRetry={() => {
                setError(null);
                setLoading(true);
                if (activeStream) {
                  const url = activeStream.url;
                  setActiveStream(null);
                  setTimeout(() => setActiveStream(rankedStreams.find(s => s.url === url) || rankedStreams[0]), 50);
                }
              }}
            />

            {/* Stream Selector */}
            {rankedStreams.length > 0 && (
              <StreamSelector
                streams={rankedStreams.map((s, i) => ({ label: i === 0 ? s.name : `Ch ${i + 1}` }))}
                activeIndex={activeStreamIndex >= 0 ? activeStreamIndex : 0}
                onSelect={(idx) => setActiveStream(rankedStreams[idx])}
              />
            )}

            {/* Source Selector */}
            <SourceSelector
              sources={sourceOptions}
              activeSource={activeSource}
              onSelect={setActiveSource}
            />

            {/* Report Issue */}
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <AlertTriangle size={12} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Report stream issue
              </span>
            </div>

            {/* Match Info */}
            <MatchInfoBar match={match} />

            {/* Football Stats Overlay */}
            {match.status === 'LIVE' || match.status === 'HALF_TIME' || match.status === 'FINISHED' ? (
              <div className="px-4 pb-4 pt-2">
                <MatchStatsOverlay
                  matchId={match.id}
                  homeTeamName={match.homeTeam}
                  awayTeamName={match.awayTeam}
                  isLive={match.status === 'LIVE'}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Extra bottom padding */}
        <div className="h-6" />
      </div>
    </motion.div>
  );
}

// ─── Embedhd Player ──────────────────────────────────────────────────────────
function EmbedhdPlayer({ match, onClose }: { match: Match; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [channels, setChannels] = useState<{ hd: number; label: string }[]>([]);
  const [activeChannel, setActiveChannel] = useState(0);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSource, setActiveSource] = useState('Admin');

  const sourceOptions = ['Channel 1', 'Channel 2', 'Channel 3', 'Channel 4'];

  useEffect(() => {
    if (match.embedhdStreams && match.embedhdStreams.length > 0) {
      const chs = match.embedhdStreams.map((s, i) => ({ hd: s.hd, label: i === 0 ? 'Primary' : `Ch ${i + 1}` }));
      setChannels(chs);
    }
  }, [match.embedhdStreams]);

  useEffect(() => {
    if (!match.embedhdStreams || match.embedhdStreams.length === 0 || !match.embedhdStreams[activeChannel]) {
      setResolving(false);
      return;
    }
    setResolving(true);
    fetch(`${API_BASE}/api/embedhd/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hd: match.embedhdStreams[activeChannel].hd }),
    })
      .then(r => r.json())
      .then(data => { if (data.success && data.streamUrl) setProxyUrl(data.streamUrl); else setError(data.error || 'Could not resolve stream'); })
      .catch(() => setError('Failed to resolve stream'))
      .finally(() => setResolving(false));
  }, [match.id, activeChannel]);

  useEffect(() => {
    if (!proxyUrl || !videoRef.current) return;
    setLoading(true);
    setError(null);
    const video = videoRef.current;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(proxyUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setLoading(false); video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError('Stream unavailable'); });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxyUrl;
      video.addEventListener('loadedmetadata', () => { setLoading(false); video.play().catch(() => {}); });
      video.addEventListener('error', () => setError('Stream unavailable'));
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [proxyUrl]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) { containerRef.current.requestFullscreen().catch(() => {}); setIsFullscreen(true); }
    else { document.exitFullscreen().catch(() => {}); setIsFullscreen(false); }
  };

  const refreshStream = useCallback(() => {
    setError(null);
    setResolving(true);
    setProxyUrl(null);
    fetch(`${API_BASE}/api/embedhd/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hd: match.embedhdStreams?.[activeChannel]?.hd }),
    })
      .then(r => r.json())
      .then(data => { if (data.success && data.streamUrl) setProxyUrl(data.streamUrl); else setError(data.error || 'Could not resolve stream'); })
      .catch(() => setError('Failed to resolve stream'))
      .finally(() => setResolving(false));
  }, [match.embedhdStreams, activeChannel]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <PlayerHeader
        match={match}
        onClose={onClose}
        onRefresh={refreshStream}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {/* Landscape Hint */}
        <LandscapeHint />

        {/* Video Player Container */}
        <div className="px-4 mt-3">
          <div className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            {/* Video - 16:9 centered */}
            <VideoPlayerCore
              videoRef={videoRef}
              loading={resolving || loading}
              error={error}
              rankedStreams={channels}
              onRetry={refreshStream}
            />

            {/* Stream Selector */}
            {channels.length > 0 && (
              <StreamSelector
                streams={channels.map((ch) => ({ label: ch.label, hd: ch.hd }))}
                activeIndex={activeChannel}
                onSelect={setActiveChannel}
              />
            )}

            {/* Source Selector */}
            <SourceSelector
              sources={sourceOptions}
              activeSource={activeSource}
              onSelect={setActiveSource}
            />

            {/* Report Issue */}
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <AlertTriangle size={12} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Report stream issue
              </span>
            </div>

            {/* Match Info */}
            <MatchInfoBar match={match} />

            {/* Football Stats Overlay */}
            {match.status === 'LIVE' || match.status === 'HALF_TIME' || match.status === 'FINISHED' ? (
              <div className="px-4 pb-4 pt-2">
                <MatchStatsOverlay
                  matchId={match.id}
                  homeTeamName={match.homeTeam}
                  awayTeamName={match.awayTeam}
                  isLive={match.status === 'LIVE'}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Extra bottom padding */}
        <div className="h-6" />
      </div>
    </motion.div>
  );
}

// ─── Main SportsPage ─────────────────────────────────────────────────────────
export default function SportsPage() {
  const [sport, setSport] = useState('football');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [playerSource, setPlayerSource] = useState<'local' | 'english'>('local');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [source, setSource] = useState<'local' | 'english'>('local');
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [detailMatch, setDetailMatch] = useState<Match | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (source === 'english') {
        const res = await fetch(`${API_BASE}/api/embedhd/matches`);
        if (!res.ok) throw new Error('Failed to fetch matches');
        const data = await res.json();
        const raw = data.matches || [];
        const normalized: Match[] = raw
          .filter((m: any) => m.category === 'football' || m.category === 'soccer')
          .map((m: any) => ({
            id: String(m.id),
            homeTeam: m.home || m.homeTeam || 'Home',
            awayTeam: m.away || m.awayTeam || 'Away',
            homeLogo: m.homeLogo || '',
            awayLogo: m.awayLogo || '',
            homeScore: m.homeScore || '-',
            awayScore: m.awayScore || '-',
            status: m.status || 'UNKNOWN',
            streams: [],
            embedhdStreams: m.streams || [],
            startTime: m.time ? new Date(m.time).getTime() / 1000 : null,
            league: m.league || null,
            venue: m.venue || undefined,
            stats: m.stats || undefined,
          }));
        setMatches(normalized);
      } else {
        const res = await fetch(`${API_BASE}/api/sports/matches?sport=${sport}`);
        if (!res.ok) throw new Error('Failed to fetch matches');
        const data = await res.json();
        const raw = data.matches || [];
        const normalized: Match[] = raw.map((m: any) => ({
          id: String(m.id),
          homeTeam: m.homeTeam || 'Home',
          awayTeam: m.awayTeam || 'Away',
          homeLogo: m.homeTeamLogo || m.homeLogo || '',
          awayLogo: m.awayTeamLogo || m.awayLogo || '',
          homeScore: String(m.homeScore ?? '-'),
          awayScore: String(m.awayScore ?? '-'),
          status: m.status || 'UNKNOWN',
          streams: m.streams || [],
          startTime: m.startTime ? new Date(m.startTime).getTime() / 1000 : null,
          league: m.league || null,
          round: m.round || m.matchRound || undefined,
          venue: m.venue || undefined,
          referee: m.referee || undefined,
          stats: m.stats || undefined,
          events: m.events || undefined,
        }));
        setMatches(normalized);
      }
      setLastUpdated(new Date());
      setRetryCount(0);
    } catch (e: any) {
      setError(e.message);
      setRetryCount(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  }, [sport, source]);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);
  useEffect(() => {
    const t = setInterval(fetchMatches, 60000);
    return () => clearInterval(t);
  }, [fetchMatches]);

  const handlePlay = useCallback((match: Match) => {
    setActiveMatch(match);
    setPlayerSource(source);
  }, [source]);

  const handleViewDetails = useCallback((match: Match) => {
    setDetailMatch(match);
  }, []);

  // Filter matches by selected league
  const filteredMatches = useMemo(() => {
    if (!selectedLeague) return matches;
    return matches.filter(m => m.league === selectedLeague);
  }, [matches, selectedLeague]);

  // Get unique leagues
  const leagues = useMemo(() => {
    const leagueSet = new Set<string>();
    matches.forEach(m => { if (m.league) leagueSet.add(m.league); });
    return Array.from(leagueSet).sort();
  }, [matches]);

  const live = filteredMatches.filter(m => m.status === 'LIVE');
  const upcoming = filteredMatches.filter(m => m.status === 'UPCOMING');
  const finished = filteredMatches.filter(m => !['LIVE', 'UPCOMING'].includes(m.status));
  const hasLive = live.length > 0;

  return (
    <div className="min-h-screen pb-24 max-w-2xl mx-auto relative" style={{ background: 'var(--bg, #050816)' }}>
      <AnimatePresence>
        {activeMatch && playerSource === 'local' && (
          <LocalSportsPlayer match={activeMatch} onClose={() => setActiveMatch(null)} />
        )}
        {activeMatch && playerSource === 'english' && (
          <EmbedhdPlayer match={activeMatch} onClose={() => setActiveMatch(null)} />
        )}
        {detailMatch && (
          <MatchDetailPanel
            match={detailMatch}
            onClose={() => setDetailMatch(null)}
            onPlay={handlePlay}
            source={source}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Trophy className="w-6 h-6" style={{ color: '#00D4FF' }} />
              <div className="absolute inset-0 blur-lg opacity-30">
                <Trophy className="w-6 h-6" style={{ color: '#00D4FF' }} />
              </div>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Sports</h1>
            {hasLive && <LivePulseBadge count={live.length} />}
          </div>
          <motion.button
            onClick={fetchMatches}
            disabled={loading}
            whileTap={{ scale: 0.9 }}
            className="p-2.5 rounded-xl transition-colors hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#8899AA' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </motion.button>
        </div>
        {lastUpdated && (
          <p className="text-[10px] flex items-center gap-1" style={{ color: '#8899AA' }}>
            <Activity size={9} />
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        )}
      </div>

      {/* Source Toggle */}
      <div className="flex gap-2 px-4 mb-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { setSource('local'); setSelectedLeague(null); }}
          className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          style={source === 'local' ? {
            background: 'linear-gradient(135deg, #00D4FF22, #8B5CF622)',
            border: '1px solid rgba(0,212,255,0.4)', color: '#00D4FF',
            boxShadow: '0 0 16px rgba(0,212,255,0.1)',
          } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899AA' }}
        >
          <Shield size={12} /> All Sports
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { setSource('english'); setSelectedLeague(null); }}
          className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          style={source === 'english' ? {
            background: 'linear-gradient(135deg, #00D4FF22, #8B5CF622)',
            border: '1px solid rgba(0,212,255,0.4)', color: '#00D4FF',
            boxShadow: '0 0 16px rgba(0,212,255,0.1)',
          } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899AA' }}
        >
          <Star size={12} /> English Streams
        </motion.button>
      </div>

      {/* Sport Tabs */}
      {source === 'local' && (
        <div className="flex gap-2 px-4 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {SPORTS.map(s => (
            <motion.button
              key={s.key}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSport(s.key)}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={sport === s.key ? {
                background: 'linear-gradient(135deg, #00D4FF22, #8B5CF622)',
                border: '1px solid rgba(0,212,255,0.4)', color: '#00D4FF',
                boxShadow: '0 0 16px rgba(0,212,255,0.1)',
              } : {
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#8899AA',
              }}
            >
              <span>{s.icon}</span> {s.label}
            </motion.button>
          ))}
        </div>
      )}

      {/* English Info Bar */}
      {source === 'english' && (
        <div className="px-4 mb-4">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}>
            <AlertCircle size={14} style={{ color: '#00D4FF' }} />
            <span className="text-xs" style={{ color: '#00D4FF' }}>
              Showing football matches only — powered by embedhd.org
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="px-4 space-y-6">
          <SkeletonHero />
          <div className="space-y-3">
            <SkeletonShimmer className="h-4 w-24 rounded" />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      ) : error ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center py-20 px-4"
        >
          <div className="text-center">
            <div className="relative inline-block mb-4">
              <WifiOff className="w-14 h-14 text-red-500" />
              <div className="absolute inset-0 blur-xl opacity-30">
                <WifiOff className="w-14 h-14 text-red-500" />
              </div>
            </div>
            <p className="text-white font-bold text-lg mb-1">Couldn't load matches</p>
            <p className="text-sm mb-5" style={{ color: '#8899AA' }}>{error}</p>
            <div className="flex gap-3 justify-center">
              <motion.button
                onClick={fetchMatches}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-2.5 rounded-2xl text-sm font-bold text-white flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #00D4FF, #8B5CF6)', boxShadow: '0 4px 20px rgba(0,212,255,0.3)' }}
              >
                <RefreshCw size={14} /> Try Again
              </motion.button>
            </div>
            {retryCount > 1 && (
              <p className="text-[10px] mt-3" style={{ color: '#8899AA' }}>
                Retrying automatically in 10 seconds...
              </p>
            )}
          </div>
        </motion.div>
      ) : filteredMatches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center py-20 px-4"
        >
          <div className="text-center">
            <div className="relative inline-block mb-4">
              <Trophy className="w-14 h-14" style={{ color: '#8899AA' }} />
            </div>
            <p className="text-white font-bold text-lg mb-1">No matches found</p>
            <p className="text-sm" style={{ color: '#8899AA' }}>
              {selectedLeague ? `No matches in ${selectedLeague}` : source === 'english' ? 'No football matches available right now' : 'Check back when games are scheduled'}
            </p>
            {selectedLeague && (
              <motion.button
                onClick={() => setSelectedLeague(null)}
                whileTap={{ scale: 0.95 }}
                className="mt-4 px-5 py-2 rounded-xl text-xs font-bold"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.3)' }}
              >
                Clear Filter
              </motion.button>
            )}
          </div>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {/* League Filter */}
          {leagues.length > 1 && (
            <LeagueFilter leagues={leagues} active={selectedLeague} onChange={setSelectedLeague} />
          )}

          {/* Featured Live Match */}
          {hasLive && !selectedLeague && (
            <HeroMatch
              match={live[0]}
              onPlay={handlePlay}
              onViewDetails={handleViewDetails}
              source={source}
            />
          )}

          <div className="px-4 space-y-6">
            {/* Live Matches */}
            {live.length > (selectedLeague ? 0 : 1) && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </div>
                  <h2 className="text-sm font-black text-white flex items-center gap-2">
                    Live Now
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#ff6b6b' }}>
                      {live.length}
                    </span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {live.slice(selectedLeague ? 0 : 1).map((m, i) => (
                    <MatchCard key={m.id} match={m} onPlay={handlePlay} onViewDetails={handleViewDetails} source={source} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={14} style={{ color: '#f0c040' }} />
                  <h2 className="text-sm font-black text-white flex items-center gap-2">
                    Upcoming
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(234,179,8,0.1)', color: '#f0c040' }}>
                      {upcoming.length}
                    </span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {upcoming.map((m, i) => (
                    <MatchCard key={m.id} match={m} onPlay={handlePlay} onViewDetails={handleViewDetails} source={source} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Finished */}
            {finished.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={14} style={{ color: '#8899AA' }} />
                  <h2 className="text-sm font-black text-white flex items-center gap-2">
                    Finished
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(100,116,139,0.1)', color: '#8899AA' }}>
                      {finished.length}
                    </span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {finished.map((m, i) => (
                    <MatchCard key={m.id} match={m} onPlay={handlePlay} onViewDetails={handleViewDetails} source={source} index={i} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {/* CSS for shimmer effect */}
      <style>{`
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0) 0%,
            rgba(255,255,255,0.06) 50%,
            rgba(255,255,255,0) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: inherit;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
}
