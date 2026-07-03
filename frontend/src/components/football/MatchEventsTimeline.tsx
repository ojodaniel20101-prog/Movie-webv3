import { motion } from 'framer-motion';
import {
  Goal, Square, Redo2, ArrowRightLeft, Timer,
  Flag, CircleDot, AlertTriangle, Play, CirclePause
} from 'lucide-react';
import type { MatchEvent } from '../../services/football';

interface MatchEventsTimelineProps {
  events: MatchEvent[];
  homeTeamName: string;
  awayTeamName: string;
}

function getEventIcon(type: MatchEvent['type']) {
  switch (type) {
    case 'goal':
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)' }}>
          <Goal size={14} style={{ color: '#22c55e' }} />
        </div>
      );
    case 'yellow_card':
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.2)', border: '1px solid rgba(234,179,8,0.4)' }}>
          <Square size={12} style={{ color: '#eab308', fill: '#eab308' }} />
        </div>
      );
    case 'red_card':
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)' }}>
          <Square size={12} style={{ color: '#ef4444', fill: '#ef4444' }} />
        </div>
      );
    case 'substitution':
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)' }}>
          <ArrowRightLeft size={12} style={{ color: '#00D4FF' }} />
        </div>
      );
    case 'penalty':
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)' }}>
          <CircleDot size={14} style={{ color: '#a855f7' }} />
        </div>
      );
    case 'var':
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.4)' }}>
          <AlertTriangle size={12} style={{ color: '#f97316' }} />
        </div>
      );
    case 'halftime':
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)' }}>
          <CirclePause size={14} style={{ color: '#3b82f6' }} />
        </div>
      );
    case 'fulltime':
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(100,116,139,0.2)', border: '1px solid rgba(100,116,139,0.4)' }}>
          <Flag size={12} style={{ color: '#94a3b8' }} />
        </div>
      );
    default:
      return (
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <Play size={10} style={{ color: '#8899AA' }} />
        </div>
      );
  }
}

function getEventTitle(event: MatchEvent): string {
  switch (event.type) {
    case 'goal':
      return `Goal! ${event.player}`;
    case 'yellow_card':
      return `Yellow Card — ${event.player}`;
    case 'red_card':
      return `Red Card — ${event.player}`;
    case 'substitution':
      return 'Substitution';
    case 'penalty':
      return `Penalty — ${event.player}`;
    case 'var':
      return `VAR Review — ${event.player || ''}`;
    case 'halftime':
      return 'Half Time';
    case 'fulltime':
      return 'Full Time';
    default:
      return event.player || 'Event';
  }
}

function getEventSubtitle(event: MatchEvent): string | null {
  switch (event.type) {
    case 'goal':
      return event.assist ? `Assist: ${event.assist}` : null;
    case 'substitution':
      return `${event.playerOut} \u2192 ${event.playerIn}`;
    case 'penalty':
      return event.assist || null;
    default:
      return null;
  }
}

function getTeamLabel(team: 'home' | 'away', homeName: string, awayName: string): string {
  return team === 'home' ? homeName : awayName;
}

function getTeamColor(team: 'home' | 'away', isHomeColor: string = '#3b82f6', isAwayColor: string = '#8b5cf6'): string {
  return team === 'home' ? isHomeColor : isAwayColor;
}

export default function MatchEventsTimeline({ events, homeTeamName, awayTeamName }: MatchEventsTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Timer size={28} className="mx-auto mb-2" style={{ color: '#8899AA' }} />
        <p className="text-xs font-bold" style={{ color: '#8899AA' }}>No match events yet</p>
        <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>Events will appear here as they happen</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-6 top-0 bottom-0 w-px" style={{ background: 'rgba(255,255,255,0.08)' }} />

      <div className="space-y-2">
        {events.map((event, i) => {
          const title = getEventTitle(event);
          const subtitle = getEventSubtitle(event);
          const teamLabel = getTeamLabel(event.team, homeTeamName, awayTeamName);
          const teamColor = getTeamColor(event.team);

          return (
            <motion.div
              key={`${event.type}-${event.time}-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="relative flex items-start gap-3 pl-1"
            >
              {/* Time badge */}
              <div className="flex-shrink-0 w-8 h-7 rounded-md flex items-center justify-center z-10"
                style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)' }}>
                <span className="text-[10px] font-black" style={{ color: '#00D4FF' }}>{event.time}'</span>
              </div>

              {/* Icon */}
              <div className="flex-shrink-0 z-10 -ml-0.5">
                {getEventIcon(event.type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-bold text-white truncate">{title}</span>
                </div>
                {subtitle && (
                  <p className="text-[10px] mb-0.5" style={{ color: '#8899AA' }}>{subtitle}</p>
                )}
                <div className="flex items-center gap-1">
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: `${teamColor}22`, color: teamColor, border: `1px solid ${teamColor}33` }}
                  >
                    {teamLabel}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
