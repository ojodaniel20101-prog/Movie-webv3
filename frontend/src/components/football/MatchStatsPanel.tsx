import { motion } from 'framer-motion';
import {
  TrendingUp, Target, Crosshair, Flag, AlertTriangle,
  Square, CircleDot, Activity, ArrowLeftRight, Hand,
  ShieldCheck, Eye
} from 'lucide-react';
import type { MatchStatistics } from '../../services/football';

interface MatchStatsPanelProps {
  stats: MatchStatistics;
  homeTeamName: string;
  awayTeamName: string;
  homeColor?: string;
  awayColor?: string;
}

interface StatRowProps {
  label: string;
  icon: React.ReactNode;
  homeValue: number;
  awayValue: number;
  maxValue?: number;
  showBar?: boolean;
  accentColor?: string;
}

function StatRow({ label, icon, homeValue, awayValue, maxValue, showBar = true, accentColor }: StatRowProps) {
  const total = homeValue + awayValue;
  const homePct = total === 0 ? 50 : (homeValue / total) * 100;
  const awayPct = total === 0 ? 50 : (awayValue / total) * 100;
  const barMax = maxValue || Math.max(homeValue, awayValue, 1);
  const homeBarPct = Math.min(100, (homeValue / barMax) * 100);
  const awayBarPct = Math.min(100, (awayValue / barMax) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-1.5"
    >
      {/* Label row */}
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-bold" style={{ color: '#8899AA' }}>{label}</span>
      </div>

      {/* Values */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-black text-right w-8" style={{ color: '#fff' }}>{homeValue}</span>

        {/* Comparison bar */}
        <div className="flex-1 h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${homePct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-l-full"
            style={{ background: accentColor || '#3b82f6' }}
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${awayPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
            className="h-full rounded-r-full"
            style={{ background: accentColor ? `${accentColor}88` : '#8b5cf6' }}
          />
        </div>

        <span className="text-sm font-black w-8" style={{ color: '#fff' }}>{awayValue}</span>
      </div>

      {/* Individual bars */}
      {showBar && (
        <div className="flex items-center gap-2">
          <div className="w-8" />
          <div className="flex-1 flex items-center gap-1">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${homeBarPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                className="h-full rounded-full"
                style={{ background: accentColor || '#3b82f6', opacity: 0.6 }}
              />
            </div>
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${awayBarPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
                className="h-full rounded-full ml-auto"
                style={{ background: accentColor ? `${accentColor}88` : '#8b5cf6', opacity: 0.6 }}
              />
            </div>
          </div>
          <div className="w-8" />
        </div>
      )}
    </motion.div>
  );
}

interface PercentageStatProps {
  label: string;
  icon: React.ReactNode;
  homePct: number;
  awayPct: number;
  homeColor?: string;
  awayColor?: string;
}

function PercentageStat({ label, icon, homePct, awayPct, homeColor = '#3b82f6', awayColor = '#8b5cf6' }: PercentageStatProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-bold" style={{ color: '#8899AA' }}>{label}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-lg font-black text-right w-10" style={{ color: homeColor }}>{homePct}%</span>

        <div className="flex-1 h-3 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${homePct}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full flex items-center justify-end pr-1"
            style={{ background: `linear-gradient(90deg, ${homeColor}44, ${homeColor})` }}
          >
            {homePct > 15 && <div className="w-1 h-1 rounded-full bg-white/40" />}
          </motion.div>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${awayPct}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
            className="h-full flex items-center pl-1"
            style={{ background: `linear-gradient(90deg, ${awayColor}, ${awayColor}44)` }}
          >
            {awayPct > 15 && <div className="w-1 h-1 rounded-full bg-white/40" />}
          </motion.div>
        </div>

        <span className="text-lg font-black w-10" style={{ color: awayColor }}>{awayPct}%</span>
      </div>
    </motion.div>
  );
}

export default function MatchStatsPanel({
  stats,
  homeTeamName,
  awayTeamName,
  homeColor = '#3b82f6',
  awayColor = '#8b5cf6',
}: MatchStatsPanelProps) {
  const maxShots = Math.max(stats.shots[0], stats.shots[1], 1);

  return (
    <div className="space-y-5">
      {/* Possession */}
      <PercentageStat
        label="Ball Possession"
        icon={<Activity size={11} style={{ color: '#00D4FF' }} />}
        homePct={stats.possession[0]}
        awayPct={stats.possession[1]}
        homeColor={homeColor}
        awayColor={awayColor}
      />

      {/* Divider */}
      <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Shots */}
      <StatRow
        label="Total Shots"
        icon={<Target size={11} style={{ color: '#ef4444' }} />}
        homeValue={stats.shots[0]}
        awayValue={stats.shots[1]}
        maxValue={maxShots}
        accentColor="#ef4444"
      />

      {/* Shots on Target */}
      <StatRow
        label="Shots on Target"
        icon={<Crosshair size={11} style={{ color: '#22c55e' }} />}
        homeValue={stats.shotsOnTarget[0]}
        awayValue={stats.shotsOnTarget[1]}
        accentColor="#22c55e"
      />

      {/* Shots off Target */}
      <StatRow
        label="Shots off Target"
        icon={<Eye size={11} style={{ color: '#f59e0b' }} />}
        homeValue={stats.shotsOffTarget[0]}
        awayValue={stats.shotsOffTarget[1]}
        accentColor="#f59e0b"
        showBar={false}
      />

      {/* Divider */}
      <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Corners */}
      <StatRow
        label="Corner Kicks"
        icon={<Flag size={11} style={{ color: '#8b5cf6' }} />}
        homeValue={stats.corners[0]}
        awayValue={stats.corners[1]}
        accentColor="#8b5cf6"
      />

      {/* Fouls */}
      <StatRow
        label="Fouls Committed"
        icon={<AlertTriangle size={11} style={{ color: '#f97316' }} />}
        homeValue={stats.fouls[0]}
        awayValue={stats.fouls[1]}
        accentColor="#f97316"
      />

      {/* Free Kicks */}
      <StatRow
        label="Free Kicks"
        icon={<Hand size={11} style={{ color: '#06b6d4' }} />}
        homeValue={stats.freeKicks[0]}
        awayValue={stats.freeKicks[1]}
        accentColor="#06b6d4"
        showBar={false}
      />

      {/* Divider */}
      <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Yellow Cards */}
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.12)' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-4 rounded-sm" style={{ background: '#eab308' }} />
            <span className="text-[10px] font-bold" style={{ color: '#eab308' }}>Yellow Cards</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-black" style={{ color: '#fff' }}>{stats.yellowCards[0]}</span>
            <span className="text-[10px]" style={{ color: '#8899AA' }}>-</span>
            <span className="text-lg font-black" style={{ color: '#fff' }}>{stats.yellowCards[1]}</span>
          </div>
        </div>

        {/* Red Cards */}
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-4 rounded-sm" style={{ background: '#ef4444' }} />
            <span className="text-[10px] font-bold" style={{ color: '#ef4444' }}>Red Cards</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-black" style={{ color: '#fff' }}>{stats.redCards[0]}</span>
            <span className="text-[10px]" style={{ color: '#8899AA' }}>-</span>
            <span className="text-lg font-black" style={{ color: '#fff' }}>{stats.redCards[1]}</span>
          </div>
        </div>
      </div>

      {/* Offsides */}
      <StatRow
        label="Offsides"
        icon={<ArrowLeftRight size={11} style={{ color: '#64748b' }} />}
        homeValue={stats.offsides[0]}
        awayValue={stats.offsides[1]}
        accentColor="#64748b"
        showBar={false}
      />

      {/* Divider */}
      <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Passes */}
      <StatRow
        label="Total Passes"
        icon={<TrendingUp size={11} style={{ color: '#00D4FF' }} />}
        homeValue={stats.passes[0]}
        awayValue={stats.passes[1]}
        accentColor="#00D4FF"
      />

      {/* Pass Accuracy */}
      <PercentageStat
        label="Pass Accuracy"
        icon={<ShieldCheck size={11} style={{ color: '#22c55e' }} />}
        homePct={stats.passAccuracy[0]}
        awayPct={stats.passAccuracy[1]}
        homeColor="#22c55e"
        awayColor="#16a34a"
      />

      {/* Goalkeeper Saves */}
      <StatRow
        label="Goalkeeper Saves"
        icon={<ShieldCheck size={11} style={{ color: '#a855f7' }} />}
        homeValue={stats.goalkeeperSaves[0]}
        awayValue={stats.goalkeeperSaves[1]}
        accentColor="#a855f7"
        showBar={false}
      />

      {/* Throw-ins */}
      <StatRow
        label="Throw-ins"
        icon={<ArrowLeftRight size={11} style={{ color: '#6b7280' }} />}
        homeValue={stats.throwIns[0]}
        awayValue={stats.throwIns[1]}
        accentColor="#6b7280"
        showBar={false}
      />
    </div>
  );
}
