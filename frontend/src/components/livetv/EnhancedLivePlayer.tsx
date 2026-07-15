import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Hls from 'hls.js';
import {
  X, RefreshCw, Loader2, WifiOff, ChevronDown,
  Maximize, Minimize, Smartphone, Activity,
  Radio, AlertTriangle,
} from 'lucide-react';
import { useLiveTvStore } from '@/store/useLiveTvStore';
import { liveTvApi, liveProxyUrl } from '@/services/iptv';
import type { Channel } from '@/types/livetv';

// ─── Types ───────────────────────────────────────────────────────────────────
interface StreamOption {
  label: string;
  url: string;
  type: 'primary' | 'fallback';
}

// ─── Shared: StreamSelector ──────────────────────────────────────────────────
function StreamSelector({
  streams,
  activeIndex,
  onSelect,
}: {
  streams: StreamOption[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Activity size={12} style={{ color: 'var(--accent-cyan, #22D3EE)' }} />
          <span className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--text-secondary, #8899AA)' }}>STREAM</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {streams.map((s, i) => {
            const isActive = i === activeIndex;
            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.9 }}
                onClick={() => onSelect(i)}
                className="flex-shrink-0 h-9 px-3 rounded-lg flex items-center justify-center text-xs font-bold transition-all"
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,212,255,0.15))',
                  border: '1.5px solid rgba(0,212,255,0.6)',
                  color: '#22D3EE',
                  boxShadow: '0 0 12px rgba(0,212,255,0.2)',
                } : {
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--text-secondary, #8899AA)',
                }}
              >
                {s.label}
              </motion.button>
            );
          })}
        </div>
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

// ─── Shared: VideoPlayerCore ─────────────────────────────────────────────────
function VideoPlayerCore({
  videoRef,
  loading,
  error,
  streamCount,
  onRetry,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  loading: boolean;
  error: string | null;
  streamCount: number;
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
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary, #8899AA)' }}>
            Loading stream...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-4">
          <WifiOff className="w-12 h-12 mb-3" style={{ color: '#ef4444' }} />
          <p className="text-white font-bold text-base text-center">{error}</p>
          {streamCount > 1 && (
            <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-secondary, #8899AA)' }}>
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
  channel,
  onClose,
  isFullscreen,
  onToggleFullscreen,
}: {
  channel: Channel;
  onClose: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
      style={{ background: 'var(--bg, #050816)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="p-2 rounded-xl transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ChevronDown size={18} style={{ color: '#fff' }} />
        </motion.button>
        <div className="flex items-center gap-2.5 min-w-0">
          {channel.logo ? (
            <img
              src={channel.logo}
              alt={channel.name}
              className="w-8 h-8 rounded-lg object-contain flex-shrink-0"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))', color: '#8899AA', border: '1px solid rgba(255,255,255,0.06)' }}>
              {channel.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{channel.name}</p>
            {channel.quality && (
              <p className="text-[10px]" style={{ color: 'var(--text-secondary, #8899AA)' }}>{channel.quality}</p>
            )}
          </div>
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

// ─── Shared: ChannelInfoBar ──────────────────────────────────────────────────
function ChannelInfoBar({ channel, epg }: { channel: Channel; epg: import('@/types/livetv').EpgResponse | null }) {
  const CatIcon = getCategoryIcon(channel.category);

  return (
    <div className="px-4 py-4">
      {/* LIVE + Category */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-[10px] font-bold tracking-widest" style={{ color: 'var(--text-secondary, #8899AA)' }}>
          {channel.groupTitle?.toUpperCase() || channel.category.toUpperCase()}
        </span>
        <span style={{ color: 'var(--text-muted, #556677)' }}>·</span>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
          <span className="text-[10px] font-black tracking-wider" style={{ color: '#ff6b6b' }}>LIVE</span>
        </div>
      </div>

      {/* Channel Name + Logo (single display — header already shows name) */}
      <div className="flex items-center justify-center gap-3 mb-3">
        {channel.logo ? (
          <img src={channel.logo} alt={channel.name} className="w-12 h-12 object-contain rounded-xl" />
        ) : (
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))', color: '#8899AA', border: '1px solid rgba(255,255,255,0.06)' }}>
            {channel.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        {channel.quality && (
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,212,255,0.12)', color: '#22D3EE' }}>
            {channel.quality}
          </span>
        )}
      </div>

      {/* EPG: Now Playing */}
      {epg?.currentProgramme ? (
        <div className="mt-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.12)' }}>
          <div className="flex items-center gap-2">
            <Radio size={12} style={{ color: '#22D3EE' }} />
            <span className="text-[10px] font-bold tracking-wider" style={{ color: '#22D3EE' }}>NOW PLAYING</span>
          </div>
          <p className="text-sm font-semibold text-white mt-1">{epg.currentProgramme.title}</p>
          {epg.currentProgramme.description && (
            <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary, #8899AA)' }}>
              {epg.currentProgramme.description}
            </p>
          )}
        </div>
      ) : epg === null ? null : (
        <div className="mt-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted, #556677)' }}>No programme information available</p>
        </div>
      )}

      {/* Channel meta */}
      <div className="flex items-center justify-center gap-4 mt-3 text-[10px]" style={{ color: 'var(--text-muted, #556677)' }}>
        <span className="flex items-center gap-1 capitalize">
          <CatIcon size={10} /> {channel.category}
        </span>
        {channel.country && <span>{channel.country}</span>}
      </div>
    </div>
  );
}

// ─── Helper: category icon ───────────────────────────────────────────────────
function getCategoryIcon(category: string) {
  // Return a simple circle icon for all categories (avoids importing from categoryIcons)
  const iconMap: Record<string, typeof Radio> = {};
  return Radio;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EnhancedLivePlayer — Sports-style player for Live TV
// ═══════════════════════════════════════════════════════════════════════════════
export default function EnhancedLivePlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const channel = useLiveTvStore(s => s.player.channel);
  const epg = useLiveTvStore(s => s.player.epg);
  const activeStreamUrl = useLiveTvStore(s => s.player.activeStreamUrl);

  const { closePlayer, toggleFullscreen, setEpg, setEpgLoading, setActiveStreamUrl } = useLiveTvStore();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeStreamIndex, setActiveStreamIndex] = useState(0);

  // Build stream options: primary + fallbacks
  const streamOptions: StreamOption[] = channel ? [
    { label: 'Primary', url: channel.url, type: 'primary' },
    ...channel.fallbacks.map((url, i) => ({
      label: `Channel ${i + 2}`,
      url,
      type: 'fallback' as const,
    })),
  ] : [];

  // Fetch EPG on mount
  useEffect(() => {
    if (!channel?.tvgId) return;
    setEpgLoading(true);
    liveTvApi.epg(channel.tvgId)
      .then(data => setEpg(data))
      .catch(() => setEpg(null))
      .finally(() => setEpgLoading(false));
  }, [channel?.tvgId, setEpg, setEpgLoading]);

  // Determine active stream URL
  const currentStreamUrl = activeStreamUrl || streamOptions[activeStreamIndex]?.url;

  // Load HLS stream
  useEffect(() => {
    if (!currentStreamUrl || !videoRef.current || !channel) return;

    setLoading(true);
    setError(null);

    const video = videoRef.current;
    const proxyUrl = liveProxyUrl(currentStreamUrl, channel.userAgent, channel.referer);

    // Destroy previous HLS instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    video.src = '';

    // Safety timeout: if nothing happens in 25s, show error (prevents infinite loading)
    const loadTimeout = setTimeout(() => {
      console.warn('[LiveTV] Loading timeout for', channel.name);
      setLoading(false);
      // Auto-try next fallback if available
      const idx = streamOptions.findIndex(s => s.url === currentStreamUrl);
      if (idx >= 0 && idx < streamOptions.length - 1) {
        setError('Stream timed out — trying next...');
        setTimeout(() => {
          setActiveStreamIndex(idx + 1);
          setActiveStreamUrl(streamOptions[idx + 1].url);
        }, 600);
      } else {
        setError('Stream unavailable — timed out');
      }
    }, 25000);

    const onPlaying = () => { clearTimeout(loadTimeout); setLoading(false); };
    const onError = () => {
      clearTimeout(loadTimeout);
      setLoading(false);
      // Auto-try next fallback
      const idx = streamOptions.findIndex(s => s.url === currentStreamUrl);
      if (idx >= 0 && idx < streamOptions.length - 1) {
        setError('Stream failed — trying next...');
        setTimeout(() => {
          setActiveStreamIndex(idx + 1);
          setActiveStreamUrl(streamOptions[idx + 1].url);
        }, 800);
      } else {
        setError('Stream unavailable — all sources failed');
      }
    };

    if (Hls.isSupported() && /\.m3u8?/i.test(currentStreamUrl)) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,        // disabled for broader compatibility
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 3,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 3,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 3,
        // Be more forgiving with stalls
        highBufferWatchdogPeriod: 3,
        nudgeOffset: 0.3,
        nudgeMaxRetry: 5,
      });
      hlsRef.current = hls;
      hls.loadSource(proxyUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        clearTimeout(loadTimeout);
        setLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          // Try to recover on network/media errors before giving up
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.warn('[LiveTV] Network error, attempting recovery...');
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            console.warn('[LiveTV] Media error, attempting recovery...');
            hls.recoverMediaError();
          } else {
            clearTimeout(loadTimeout);
            onError();
          }
        }
      });
      video.addEventListener('playing', onPlaying, { once: true });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxyUrl;
      video.addEventListener('loadedmetadata', () => {
        clearTimeout(loadTimeout);
        setLoading(false);
        video.play().catch(() => {});
      }, { once: true });
      video.addEventListener('error', onError, { once: true });
    } else {
      video.src = proxyUrl;
      video.play().catch(() => {});
      video.addEventListener('canplay', () => {
        clearTimeout(loadTimeout);
        setLoading(false);
        video.play().catch(() => {});
      }, { once: true });
      video.addEventListener('error', onError, { once: true });
    }

    return () => {
      clearTimeout(loadTimeout);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      video.src = '';
    };
  }, [currentStreamUrl, channel?.id]);

  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (videoRef.current) videoRef.current.src = '';
    setActiveStreamUrl(null);
    closePlayer();
  }, [closePlayer, setActiveStreamUrl]);

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    const idx = activeStreamIndex;
    setActiveStreamIndex(-1);
    setTimeout(() => setActiveStreamIndex(idx), 50);
  }, [activeStreamIndex]);

  const handleStreamSelect = useCallback((index: number) => {
    setActiveStreamIndex(index);
    setActiveStreamUrl(streamOptions[index].url);
    setError(null);
    setLoading(true);
  }, [streamOptions, setActiveStreamUrl]);

  if (!channel) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg, #050816)' }}
    >
      {/* Header */}
      <PlayerHeader
        channel={channel}
        onClose={handleClose}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {/* Landscape Hint */}
        <LandscapeHint />

        {/* Video Player Container */}
        <div className="px-4 mt-3">
          <div className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            {/* Video Player */}
            <VideoPlayerCore
              videoRef={videoRef}
              loading={loading}
              error={error}
              streamCount={streamOptions.length}
              onRetry={handleRetry}
            />

            {/* Stream Selector */}
            {streamOptions.length > 1 && (
              <StreamSelector
                streams={streamOptions}
                activeIndex={activeStreamIndex}
                onSelect={handleStreamSelect}
              />
            )}

            {/* Report Issue */}
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <AlertTriangle size={12} style={{ color: 'var(--text-muted, #556677)' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted, #556677)' }}>
                Report stream issue
              </span>
            </div>

            {/* Channel Info + EPG */}
            <ChannelInfoBar channel={channel} epg={epg} />
          </div>
        </div>

        {/* Extra bottom padding */}
        <div className="h-6" />
      </div>
    </motion.div>
  );
}
