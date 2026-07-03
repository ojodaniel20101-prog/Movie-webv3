import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ChevronDown, ChevronUp, Shield, Crown, ArrowRightLeft } from 'lucide-react';
import FormationDisplay from './FormationDisplay';
import type { MatchLineups as MatchLineupsType } from '../../services/football';

interface MatchLineupsProps {
  lineups: MatchLineupsType;
  homeTeamName: string;
  awayTeamName: string;
  homeColor?: string;
  awayColor?: string;
}

type ViewMode = 'formation' | 'list';

export default function MatchLineups({
  lineups,
  homeTeamName,
  awayTeamName,
  homeColor = '#3b82f6',
  awayColor = '#8b5cf6',
}: MatchLineupsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('formation');
  const [activeTeam, setActiveTeam] = useState<'home' | 'away'>('home');
  const [showSubs, setShowSubs] = useState(true);

  const home = lineups.home;
  const away = lineups.away;

  if (!home && !away) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Users size={32} className="mx-auto mb-3" style={{ color: '#8899AA' }} />
        <p className="text-sm font-bold" style={{ color: '#8899AA' }}>Lineups not available yet</p>
        <p className="text-xs mt-1" style={{ color: '#64748b' }}>Lineups are typically announced 1 hour before kickoff</p>
      </div>
    );
  }

  const currentTeam = activeTeam === 'home' ? home : away;
  const currentTeamName = activeTeam === 'home' ? homeTeamName : awayTeamName;
  const currentColor = activeTeam === 'home' ? homeColor : awayColor;
  const currentStartXI = currentTeam?.startXI || [];
  const currentSubs = currentTeam?.substitutes || [];

  return (
    <div className="space-y-4">
      {/* Header with team toggle */}
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#8899AA' }}>
          <Users size={12} /> Starting XI
        </h4>
        <div className="flex items-center gap-1.5">
          {/* View mode toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setViewMode('formation')}
              className="px-2.5 py-1 text-[10px] font-bold transition-all"
              style={viewMode === 'formation'
                ? { background: 'rgba(255,255,255,0.12)', color: '#fff' }
                : { color: '#8899AA' }}
            >
              Formation
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="px-2.5 py-1 text-[10px] font-bold transition-all"
              style={viewMode === 'list'
                ? { background: 'rgba(255,255,255,0.12)', color: '#fff' }
                : { color: '#8899AA' }}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Team tabs */}
      <div className="flex rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => setActiveTeam('home')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold transition-all"
          style={activeTeam === 'home'
            ? { background: `${homeColor}22`, color: homeColor, borderBottom: `2px solid ${homeColor}` }
            : { color: '#8899AA' }}
        >
          <Shield size={12} style={{ color: activeTeam === 'home' ? homeColor : '#8899AA' }} />
          {homeTeamName}
          {home?.formation && <span className="text-[10px] opacity-60">({home.formation})</span>}
        </button>
        <button
          onClick={() => setActiveTeam('away')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold transition-all"
          style={activeTeam === 'away'
            ? { background: `${awayColor}22`, color: awayColor, borderBottom: `2px solid ${awayColor}` }
            : { color: '#8899AA' }}
        >
          <Shield size={12} style={{ color: activeTeam === 'away' ? awayColor : '#8899AA' }} />
          {awayTeamName}
          {away?.formation && <span className="text-[10px] opacity-60">({away.formation})</span>}
        </button>
      </div>

      {/* Coach info */}
      {currentTeam?.coach && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px]"
          style={{ background: 'rgba(255,255,255,0.03)', color: '#8899AA' }}>
          <span className="font-semibold">Coach:</span>
          <span style={{ color: '#fff' }}>{currentTeam.coach}</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {viewMode === 'formation' ? (
          <motion.div
            key={`formation-${activeTeam}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <FormationDisplay
              players={currentStartXI}
              isHome={activeTeam === 'home'}
              teamColor={currentColor}
            />
          </motion.div>
        ) : (
          <motion.div
            key={`list-${activeTeam}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
          >
            {/* Starting XI - Grouped by position */}
            {['Goalkeeper', 'Defence', 'Defender', 'Midfield', 'Midfielder', 'Offence', 'Forward', 'Attacker'].map(pos => {
              const posPlayers = currentStartXI.filter(p => p.position === pos);
              if (posPlayers.length === 0) return null;
              const posLabel = pos === 'Defence' || pos === 'Defender' ? 'Defenders'
                : pos === 'Midfield' || pos === 'Midfielder' ? 'Midfielders'
                : pos === 'Offence' || pos === 'Forward' || pos === 'Attacker' ? 'Forwards'
                : 'Goalkeeper';
              const posColor = pos === 'Goalkeeper' ? '#f59e0b' : pos.includes('Def') ? '#3b82f6' : pos.includes('Mid') ? '#22c55e' : '#ef4444';

              return (
                <div key={pos}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: posColor }} />
                    <span className="text-[10px] font-bold" style={{ color: '#8899AA' }}>{posLabel}</span>
                  </div>
                  <div className="space-y-1">
                    {posPlayers.map((player, i) => (
                      <motion.div
                        key={`${player.name}-${i}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        {/* Number */}
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                          style={{ background: `${currentColor}33`, border: `1px solid ${currentColor}55`, color: currentColor }}>
                          {player.number ?? '-'}
                        </div>
                        {/* Name */}
                        <span className="text-xs font-bold text-white flex-1 truncate">{player.name}</span>
                        {/* Captain badge */}
                        {player.isCaptain && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)' }}>
                            <Crown size={8} style={{ color: '#fbbf24' }} />
                            <span className="text-[8px] font-bold" style={{ color: '#fbbf24' }}>C</span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Substitutes */}
      {currentSubs.length > 0 && (
        <div>
          <button
            onClick={() => setShowSubs(!showSubs)}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-[10px] font-bold transition-colors"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#8899AA', border: '1px solid rgba(255,255,255,0.04)' }}
          >
            <span className="flex items-center gap-1.5">
              <ArrowRightLeft size={10} />
              Substitutes ({currentSubs.length})
            </span>
            {showSubs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <AnimatePresence>
            {showSubs && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2">
                  {currentSubs.map((player, i) => (
                    <motion.div
                      key={`sub-${player.name}-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                    >
                      <span className="text-[9px] font-bold" style={{ color: currentColor }}>
                        {player.number ?? '-'}
                      </span>
                      <span className="text-[10px] text-white truncate">{player.name}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
