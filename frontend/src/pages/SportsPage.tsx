import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Wifi, WifiOff, RefreshCw, Play, Clock,
  CheckCircle2, Loader2, Radio, ChevronRight, Zap
} from 'lucide-react';
import Hls from 'hls.js';

const SPORTS = [
  { key: 'football',   label: 'Football',   icon: '⚽' },
  { key: 'basketball', label: 'Basketball', icon: '🏀' },
  { key: 'tennis',     label: 'Tennis',     icon: '🎾' },
  { key: 'cricket',    label: 'Cricket',    icon: '🏏' },
];

const API_BASE = import.meta.env.VITE_API_URL || '';

interface Stream {
  name: string;
  url: string;
  type: string;
  quality: string;
  ok?: boolean;
  ms?: number;
}

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  homeScore: string;
  awayScore: string;
  status: 'LIVE' | 'UPCOMING' | 'FINISHED' | string;
  streams: Stream[];
  startTime: number | null;
  league: string | null;
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === 'LIVE') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black"
      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      LIVE
    </span>
  );
  if (status === 'UPCOMING') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black"
      style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308' }}>
      <Clock size={9} /> UPCOMING
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black"
      style={{ background: 'rgba(156,163,175,0.1)', border: '1px solid rgba(156,163,175,0.2)', color: '#9ca3af' }}>
      <CheckCircle2 size={9} /> FT
    </span>
  );
}

// ─── Team Logo ───────────────────────────────────────────────────────────────
function TeamLogo({ src, name }: { src?: string; name: string }) {
  const [err, setErr] = useState(false);
  if (err || !src) return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black"
      style={{ background: 'rgba(255,255,255,0.08)', color: '#8899AA' }}>
      {name[0]}
    </div>
  );
  return <img src={src} alt={name} className="w-10 h-10 object-contain rounded-full" onError={() => setErr(true)} />;
}

// ─── Match Card ──────────────────────────────────────────────────────────────
function MatchCard({ match, onPlay, source }: { match: Match; onPlay: (match: Match) => void; source: 'local' | 'english' }) {
  const canPlay = match.status === 'LIVE' && match.streams.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="relative rounded-2xl overflow-hidden p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
        border: match.status === 'LIVE'
          ? '1px solid rgba(239,68,68,0.25)'
          : '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {match.league && (
        <p className="text-[10px] text-center mb-3 truncate" style={{ color: '#8899AA' }}>{match.league}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <TeamLogo src={match.homeLogo} name={match.homeTeam} />
          <p className="text-xs font-bold text-center text-white truncate w-full px-1">{match.homeTeam}</p>
        </div>

        <div className="flex flex-col items-center gap-1 flex-shrink-0 px-2">
          <StatusBadge status={match.status} />
          {match.status !== 'UPCOMING' ? (
            <p className="text-xl font-black text-white tabular-nums">
              {match.homeScore} <span style={{ color: '#8899AA' }}>-</span> {match.awayScore}
            </p>
          ) : (
            <p className="text-xs font-semibold" style={{ color: '#8899AA' }}>
              {match.startTime
                ? new Date(match.startTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'TBD'}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <TeamLogo src={match.awayLogo} name={match.awayTeam} />
          <p className="text-xs font-bold text-center text-white truncate w-full px-1">{match.awayTeam}</p>
        </div>
      </div>

      {canPlay && (
        <motion.button
          onClick={() => onPlay(match)}
          whileTap={{ scale: 0.95 }}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold"
          style={{
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: 'white',
            boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
          }}
        >
          <Play size={12} className="fill-current" />
          Watch Live
        </motion.button>
      )}
      {!canPlay && match.status === 'LIVE' && (
        <div className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#8899AA' }}>
          <WifiOff size={12} /> No stream available
        </div>
      )}
    </motion.div>
  );
}

// ─── Sports Player ────────────────────────────────────────────────────────────
function SportsPlayer({ match, onClose }: { match: Match; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [rankedStreams, setRankedStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState<Stream | null>(null);
  const [testing, setTesting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Step 1: ping all streams, pick fastest, rank the rest
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
        // Auto-play the fastest working one
        const best = sorted.find(s => s.ok !== false) || sorted[0];
        setActiveStream(best);
      })
      .catch(() => {
        // Fallback: just use as-is
        setRankedStreams(match.streams);
        setActiveStream(match.streams[0]);
      })
      .finally(() => setTesting(false));
  }, [match.id]);

  // Step 2: load the active stream into hls.js
  useEffect(() => {
    if (!activeStream || !videoRef.current) return;

    setLoading(true);
    setError(null);

    const proxyUrl = `${API_BASE}/api/sports/stream-proxy?url=${encodeURIComponent(activeStream.url)}`;
    const video = videoRef.current;

    // Destroy previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(proxyUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setError('Stream unavailable — try another channel');
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxyUrl;
      video.addEventListener('loadedmetadata', () => { setLoading(false); video.play().catch(() => {}); });
      video.addEventListener('error', () => setError('Stream unavailable'));
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [activeStream?.url]);

  const switchStream = (stream: Stream) => {
    setActiveStream(stream);
    setError(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: '#050816' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <p className="text-xs font-black text-white">{match.homeTeam} vs {match.awayTeam}</p>
          {match.league && <p className="text-[10px]" style={{ color: '#8899AA' }}>{match.league}</p>}
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={match.status} />
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
        </div>
      </div>

      {/* Video */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
        {(testing || loading) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            <p className="text-xs" style={{ color: '#8899AA' }}>
              {testing ? 'Finding best stream...' : 'Loading stream...'}
            </p>
          </div>
        )}
        {error && !loading ? (
          <div className="text-center px-4">
            <WifiOff className="w-10 h-10 mx-auto mb-2 text-red-500" />
            <p className="text-white font-semibold text-sm">{error}</p>
            <p className="text-xs mt-1 mb-3" style={{ color: '#8899AA' }}>Try a different channel below</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full"
            controls
            playsInline
            style={{ maxHeight: '100%', opacity: loading || testing ? 0 : 1 }}
          />
        )}
      </div>

      {/* Score bar */}
      <div className="flex items-center justify-center gap-6 px-4 py-2 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2">
          <TeamLogo src={match.homeLogo} name={match.homeTeam} />
          <span className="text-xs font-bold text-white">{match.homeTeam}</span>
        </div>
        <span className="text-xl font-black text-white tabular-nums">
          {match.homeScore} - {match.awayScore}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">{match.awayTeam}</span>
          <TeamLogo src={match.awayLogo} name={match.awayTeam} />
        </div>
      </div>

      {/* Channel switcher */}
      {rankedStreams.length > 0 && (
        <div className="flex-shrink-0 px-4 pb-4 pt-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] font-semibold mb-2" style={{ color: '#8899AA' }}>
            <Radio size={9} className="inline mr-1" />
            CHANNELS
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {rankedStreams.map((stream, idx) => {
              const isActive = activeStream?.url === stream.url;
              const isFastest = idx === 0 && stream.ok !== false;
              return (
                <button
                  key={stream.url}
                  onClick={() => switchStream(stream)}
                  className="flex-shrink-0 flex flex-col items-start px-3 py-2 rounded-xl text-left transition-all"
                  style={isActive ? {
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.15))',
                    border: '1px solid rgba(239,68,68,0.5)',
                  } : {
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                    <span className="text-xs font-bold" style={{ color: isActive ? '#fff' : '#8899AA' }}>
                      {idx === 0 ? stream.name : `Ch ${idx + 1}`}
                    </span>
                    {isFastest && !isActive && (
                      <Zap size={9} style={{ color: '#eab308' }} />
                    )}
                  </div>
                  {stream.ms && stream.ms < 9999 && (
                    <span className="text-[9px]" style={{ color: stream.ok ? '#22c55e' : '#ef4444' }}>
                      {stream.ok ? `${stream.ms}ms` : 'offline'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SportsPage() {
  const [sport, setSport] = useState('football');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [source, setSource] = useState<'local' | 'english'>('local');

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = source === 'english'
        ? `${API_BASE}/api/embedhd/matches`
        : `${API_BASE}/api/sports/matches?sport=${sport}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed to fetch matches');
      const data = await res.json();
      setMatches(data.matches || []);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sport, source]);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);
  useEffect(() => {
    const t = setInterval(fetchMatches, 60000);
    return () => clearInterval(t);
  }, [fetchMatches]);

  const live     = matches.filter(m => m.status === 'LIVE');
  const upcoming = matches.filter(m => m.status === 'UPCOMING');
  const finished = matches.filter(m => m.status === 'FINISHED');

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg, #050816)' }}>
      <AnimatePresence>
        {activeMatch && (
          <SportsPlayer match={activeMatch} onClose={() => setActiveMatch(null)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" style={{ color: '#00D4FF' }} />
            <h1 className="text-xl font-black text-white">Sports</h1>
            {live.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                {live.length} LIVE
              </span>
            )}
          </div>
          <button onClick={fetchMatches} disabled={loading}
            className="p-2 rounded-xl transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#8899AA' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {lastUpdated && (
          <p className="text-[10px]" style={{ color: '#8899AA' }}>
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Source toggle */}
      <div className="flex gap-2 px-4 mb-3">
        <button onClick={() => setSource('local')}
          className="flex-shrink-0 px-4 py-1.5 rounded-xl text-xs font-bold transition-all"
          style={source === 'local' ? {
            background: 'linear-gradient(135deg, #00D4FF22, #8B5CF622)',
            border: '1px solid rgba(0,212,255,0.4)', color: '#00D4FF',
          } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899AA' }}>
          🌍 All Sports
        </button>
        <button onClick={() => setSource('english')}
          className="flex-shrink-0 px-4 py-1.5 rounded-xl text-xs font-bold transition-all"
          style={source === 'english' ? {
            background: 'linear-gradient(135deg, #00D4FF22, #8B5CF622)',
            border: '1px solid rgba(0,212,255,0.4)', color: '#00D4FF',
          } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899AA' }}>
          🏴󠁧󠁢󠁥󠁮󠁧󠁿 English Streams
        </button>
      </div>

      {/* Sport tabs */}
      <div className="flex gap-2 px-4 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {SPORTS.map(s => (
          <button
            key={s.key}
            onClick={() => setSport(s.key)}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all"
            style={sport === s.key ? {
              background: 'linear-gradient(135deg, #00D4FF22, #8B5CF622)',
              border: '1px solid rgba(0,212,255,0.4)',
              color: '#00D4FF',
            } : {
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#8899AA',
            }}
          >
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: '#00D4FF' }} />
            <p className="text-sm" style={{ color: '#8899AA' }}>Fetching live matches...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-20 px-4">
          <div className="text-center">
            <WifiOff className="w-10 h-10 mx-auto mb-3 text-red-500" />
            <p className="text-white font-semibold mb-1">Couldn't load matches</p>
            <p className="text-sm mb-4" style={{ color: '#8899AA' }}>{error}</p>
            <button onClick={fetchMatches} className="px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #00D4FF, #8B5CF6)' }}>
              Try Again
            </button>
          </div>
        </div>
      ) : matches.length === 0 ? (
        <div className="flex items-center justify-center py-20 px-4">
          <div className="text-center">
            <Trophy className="w-10 h-10 mx-auto mb-3" style={{ color: '#8899AA' }} />
            <p className="text-white font-semibold mb-1">No matches found</p>
            <p className="text-sm" style={{ color: '#8899AA' }}>Check back when games are scheduled</p>
          </div>
        </div>
      ) : (
        <div className="px-4 space-y-6">
          {live.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <h2 className="text-sm font-black text-white">Live Now</h2>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {live.map(m => <MatchCard key={m.id} match={m} onPlay={setActiveMatch} source={source} />)}
              </div>
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={12} style={{ color: '#eab308' }} />
                <h2 className="text-sm font-black text-white">Upcoming</h2>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {upcoming.map(m => <MatchCard key={m.id} match={m} onPlay={setActiveMatch} source={source} />)}
              </div>
            </section>
          )}
          {finished.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={12} style={{ color: '#8899AA' }} />
                <h2 className="text-sm font-black text-white">Finished</h2>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {finished.map(m => <MatchCard key={m.id} match={m} onPlay={setActiveMatch} source={source} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
