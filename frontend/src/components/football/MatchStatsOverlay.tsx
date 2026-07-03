import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Users, Activity, Radio, WifiOff,
  RefreshCw, Loader2
} from 'lucide-react';
import MatchLineups from './MatchLineups';
import MatchStatsPanel from './MatchStatsPanel';
import MatchEventsTimeline from './MatchEventsTimeline';
import { fetchFootballData, fetchDemoData } from '../../services/football';
import type {
  MatchLineups as MatchLineupsType,
  MatchStatistics,
  MatchEvent,
} from '../../services/football';

interface MatchStatsOverlayProps {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  isLive: boolean;
}

type TabId = 'stats' | 'lineups' | 'events';

const TABS: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
  { id: 'stats', label: 'Statistics', icon: BarChart3 },
  { id: 'lineups', label: 'Lineups', icon: Users },
  { id: 'events', label: 'Events', icon: Activity },
];

const REFRESH_INTERVAL = 30000; // 30 seconds for live matches

export default function MatchStatsOverlay({
  matchId,
  homeTeamName,
  awayTeamName,
  isLive,
}: MatchStatsOverlayProps) {
  const [activeTab, setActiveTab] = useState<TabId>('stats');
  const [lineups, setLineups] = useState<MatchLineupsType | null>(null);
  const [stats, setStats] = useState<MatchStatistics | null>(null);
  const [events, setEvents] = useState<MatchEvent[] | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFootballData(matchId);
      setLineups(data.lineups);
      setStats(data.stats);
      setEvents(data.events);
      setIsDemo(data.isDemo);
      setLastUpdated(new Date());
    } catch (err: any) {
      // Try demo data as ultimate fallback
      try {
        const demo = await fetchDemoData(matchId);
        setLineups(demo.lineups);
        setStats(demo.stats);
        setEvents(demo.events);
        setIsDemo(true);
        setLastUpdated(new Date());
      } catch {
        setError(err?.message || 'Failed to load match data');
      }
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh for live matches
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [isLive, loadData]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <Radio size={14} style={{ color: '#22c55e' }} />
          <span className="text-xs font-bold text-white">Match Center</span>
          {isDemo && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(234,179,8,0.12)', color: '#eab308', border: '1px solid rgba(234,179,8,0.2)' }}>
              DEMO
            </span>
          )}
          {isLive && (
            <span className="flex items-center gap-1 text-[9px] font-black tracking-wider"
              style={{ color: '#ef4444' }}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[9px]" style={{ color: '#64748b' }}>
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={loadData}
            disabled={loading}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" style={{ color: '#22c55e' }} />
            ) : (
              <RefreshCw size={12} style={{ color: '#8899AA' }} />
            )}
          </motion.button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const hasContent =
            tab.id === 'stats' ? !!stats :
            tab.id === 'lineups' ? !!(lineups?.home || lineups?.away) :
            tab.id === 'events' ? !!(events && events.length > 0) : false;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold transition-all relative"
              style={isActive ? { color: '#00D4FF' } : { color: '#8899AA' }}
            >
              <Icon size={13} />
              {tab.label}
              {hasContent && (
                <span className="w-1.5 h-1.5 rounded-full"
                  style={{ background: isActive ? '#00D4FF' : '#22c55e' }} />
              )}
              {isActive && (
                <motion.div
                  layoutId="stats-active-tab"
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                  style={{ background: '#00D4FF' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="p-4">
        {loading && !lineups && !stats && !events ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 size={24} className="animate-spin" style={{ color: '#22c55e' }} />
            <p className="text-xs font-medium" style={{ color: '#8899AA' }}>Loading match data...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <WifiOff size={24} style={{ color: '#ef4444' }} />
            <p className="text-xs font-medium" style={{ color: '#8899AA' }}>{error}</p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={loadData}
              className="px-4 py-2 rounded-xl text-[11px] font-bold"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.3)' }}
            >
              Retry
            </motion.button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'stats' && stats && (
              <motion.div
                key="stats"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <MatchStatsPanel
                  stats={stats}
                  homeTeamName={homeTeamName}
                  awayTeamName={awayTeamName}
                />
              </motion.div>
            )}

            {activeTab === 'lineups' && lineups && (
              <motion.div
                key="lineups"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <MatchLineups
                  lineups={lineups}
                  homeTeamName={homeTeamName}
                  awayTeamName={awayTeamName}
                />
              </motion.div>
            )}

            {activeTab === 'events' && events && (
              <motion.div
                key="events"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <MatchEventsTimeline
                  events={events}
                  homeTeamName={homeTeamName}
                  awayTeamName={awayTeamName}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
