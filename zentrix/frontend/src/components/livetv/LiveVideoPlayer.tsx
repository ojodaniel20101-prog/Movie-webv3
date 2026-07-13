import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Hls from 'hls.js';
import {
  X, Play, Pause, Volume2, VolumeX,
  Maximize, Minimize, PictureInPicture2,
  RefreshCw, ChevronDown, Radio,
} from 'lucide-react';
import { useLiveTvStore } from '@/store/useLiveTvStore';
import { liveProxyUrl } from '@/services/iptv';
import { strHue, initials, countryFlag } from '@/lib/livetv';
import { liveCategoryIcon } from './categoryIcons';

export default function LiveVideoPlayer() {
  const { channel, isMuted, isFullscreen, volume } = useLiveTvStore(s => s.player);
  const { closePlayer, toggleMute, toggleFullscreen, toggleMini, setVolume } = useLiveTvStore();

  const videoRef  = useRef<HTMLVideoElement>(null);
  const hlsRef    = useRef<Hls | null>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const [status, setStatus]     = useState<'loading' | 'playing' | 'error'>('loading');
  const [ctrlsVisible, setCtrlsVisible] = useState(true);
  const [scanLine, setScanLine] = useState(false);

  // ── Load stream ─────────────────────────────────────────────
  useEffect(() => {
    if (!channel || !videoRef.current) return;
    const video = videoRef.current;

    setStatus('loading');
    setScanLine(true);
    const scanTimer = setTimeout(() => setScanLine(false), 700);

    hlsRef.current?.destroy();
    video.src = '';

    const src = liveProxyUrl(channel.url, channel.userAgent, channel.referer);
    const isHLS = /\.m3u8?(\?|$)/i.test(channel.url) || channel.url.includes('.m3u');

    const onPlaying = () => setStatus('playing');
    const onError   = () => setStatus('error');

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // Buffer settings — generous for live TV stability
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        backBufferLength: 30,
        // Loading timeouts — be patient with slower streams
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 1000,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 1000,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 3,
        levelLoadingRetryDelay: 1000,
        // ABR — conservative to avoid quality flicker
        abrEwmaFastLive: 3.0,
        abrEwmaSlowLive: 9.0,
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.7,
        startLevel: -1,
        // Cap max quality to prevent bandwidth issues
        capLevelToPlayerSize: true,
        maxBufferHole: 1.0,
        // Stall handling
        highBufferWatchdogPeriod: 3,
        nudgeOffset: 0.3,
        nudgeMaxRetry: 5,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (d.fatal) {
          // Try to recover on fatal errors instead of giving up immediately
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.warn('[LiveTV] Network error, attempting recovery...');
            hls.startLoad();
          } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
            console.warn('[LiveTV] Media error, attempting recovery...');
            hls.recoverMediaError();
          } else {
            setStatus('error');
          }
        }
      });
      video.addEventListener('playing', onPlaying, { once: true });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch(() => {});
      video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
      video.addEventListener('playing', onPlaying, { once: true });
      video.addEventListener('error',   onError,   { once: true });
    } else {
      video.src = src;
      video.play().catch(() => {});
      video.addEventListener('canplay', () => { video.play().catch(() => {}); setStatus('playing'); }, { once: true });
      video.addEventListener('error', onError, { once: true });
    }

    return () => {
      clearTimeout(scanTimer);
      hlsRef.current?.destroy();
      video.src = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  // ── Volume / Mute sync ───────────────────────────────────────
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted  = isMuted;
    videoRef.current.volume = volume;
  }, [isMuted, volume]);

  // ── Controls auto-hide ────────────────────────────────────────
  const showControls = useCallback(() => {
    setCtrlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setCtrlsVisible(false), 3500);
  }, []);

  useEffect(() => {
    showControls();
    return () => clearTimeout(hideTimer.current);
  }, [showControls]);

  // ── Fullscreen ────────────────────────────────────────────────
  const handleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => toggleFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => toggleFullscreen(false)).catch(() => {});
    }
  }, [toggleFullscreen]);

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      showControls();
      if (e.key === 'Escape')    { e.preventDefault(); closePlayer(); }
      if (e.key === ' ')         { e.preventDefault(); videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause(); }
      if (e.key === 'm')         toggleMute();
      if (e.key === 'f')         handleFullscreen();
      if (e.key === 'ArrowUp')   setVolume(Math.min(1, volume + 0.1));
      if (e.key === 'ArrowDown') setVolume(Math.max(0, volume - 0.1));
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [volume, showControls, closePlayer, toggleMute, handleFullscreen, setVolume]);

  useEffect(() => {
    const onChange = () => toggleFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PiP ───────────────────────────────────────────────────────
  const handlePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await videoRef.current.requestPictureInPicture();
    } catch { /* unsupported — ignore */ }
  };

  const retry = () => {
    if (!channel) return;
    setStatus('loading');
    setTimeout(() => {
      const v = videoRef.current;
      if (v) { v.src = liveProxyUrl(channel.url, channel.userAgent, channel.referer); v.play().catch(() => {}); }
    }, 100);
  };

  if (!channel) return null;

  const hue     = strHue(channel.name);
  const inits   = initials(channel.name);
  const CatIcon = liveCategoryIcon(channel.category);

  return (
    <motion.div
      key="live-video-player"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed inset-0 z-live-player bg-black flex flex-col"
      ref={wrapRef}
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        playsInline
        autoPlay
        onClick={() => {
          showControls();
          if (videoRef.current?.paused) videoRef.current.play();
          else videoRef.current?.pause();
        }}
      />

      {/* Scan-line channel switch effect */}
      <AnimatePresence>
        {scanLine && (
          <motion.div
            key="scan"
            initial={{ top: 0, opacity: 0.6 }}
            animate={{ top: '100%', opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="absolute left-0 right-0 h-[3px] z-50 pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(123,111,240,0.8), transparent)' }}
          />
        )}
      </AnimatePresence>

      {/* Loading overlay */}
      <AnimatePresence>
        {status === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-30"
            style={{ background: `radial-gradient(ellipse at center, hsl(${hue},40%,10%) 0%, rgba(2,2,8,0.95) 70%)` }}
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-display font-extrabold"
              style={{ background: `hsl(${hue},50%,18%)`, color: `hsl(${hue},60%,62%)` }}>
              {inits}
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-white/15 rounded-full animate-spin" style={{ borderTopColor: 'var(--primary)' }} />
              <p className="text-gray-400 text-sm">Connecting to stream…</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error overlay */}
      <AnimatePresence>
        {status === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-30 bg-black/92 text-center px-6"
          >
            <Radio size={44} className="text-gray-700" />
            <div>
              <p className="font-display font-bold text-lg text-white">Stream unavailable</p>
              <p className="text-gray-500 text-sm mt-1 max-w-xs">
                This channel may be geo-blocked, offline, or require a special connection.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={retry} className="btn-primary text-sm py-2.5 px-5 gap-2">
                <RefreshCw size={14} /> Retry
              </button>
              <button onClick={closePlayer} className="btn-secondary text-sm py-2.5 px-5 gap-2">
                <X size={14} /> Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar — ALWAYS visible (independent of inactivity auto-hide).
          This is the only reliable way back, so it never disappears,
          regardless of playback status or how long it's been since
          the last tap. Only the bottom transport controls auto-hide. */}
      <div className="absolute top-0 inset-x-0 z-40 flex items-start justify-between p-4"
        style={{ background: 'linear-gradient(180deg, rgba(2,2,8,0.85) 0%, transparent 100%)', paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 text-white text-2xs font-black px-2 py-1 rounded-md tracking-widest flex-shrink-0"
            style={{ background: 'rgba(255,59,48,0.92)' }}>
            <span className="w-[5px] h-[5px] rounded-full bg-white animate-pulse" />
            LIVE
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-white text-base leading-tight truncate">
              {channel.fullName || channel.name}
            </p>
            <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-2">
              {channel.country && <span>{countryFlag(channel.country)}&nbsp;{channel.country}</span>}
              {channel.category !== 'general' && (
                <span className="flex items-center gap-1 capitalize"><CatIcon size={11} />{channel.category}</span>
              )}
              {channel.quality && <span className="font-semibold text-primary-400">{channel.quality}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <button onClick={() => toggleMini(true)} aria-label="Minimize player" className="btn-icon !w-9 !h-9 !min-w-9" style={{ background: 'rgba(255,255,255,0.14)' }}>
            <ChevronDown size={17} />
          </button>
          <button onClick={closePlayer} aria-label="Close player" className="btn-icon !w-9 !h-9 !min-w-9" style={{ background: 'rgba(255,255,255,0.14)' }}>
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Bottom playback controls — these auto-hide after inactivity,
          which is normal/expected video-player behavior (the top bar
          above does NOT, so there's always a way back regardless). */}
      <AnimatePresence>
        {(ctrlsVisible || status !== 'playing') && status !== 'error' && (
          <motion.div
            key="bottom-controls"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 inset-x-0 z-40 p-4"
            style={{ background: 'linear-gradient(0deg, rgba(2,2,8,0.85) 0%, transparent 100%)', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}
                  aria-label={status === 'playing' ? 'Pause' : 'Play'}
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                  {status === 'playing' ? <Pause size={19} fill="white" /> : <Play size={19} fill="white" className="ml-0.5" />}
                </button>

                <button onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'} className="btn-icon !w-9 !h-9 !min-w-9" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>

                <input
                  type="range" min={0} max={1} step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={e => setVolume(parseFloat(e.target.value))}
                  className="hidden sm:block w-20 accent-primary-500"
                  aria-label="Volume"
                />
              </div>

              <div className="flex items-center gap-2">
                {'pictureInPictureEnabled' in document && (
                  <button onClick={handlePiP} aria-label="Picture in picture" className="btn-icon !w-9 !h-9 !min-w-9" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <PictureInPicture2 size={16} />
                  </button>
                )}
                <button onClick={handleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} className="btn-icon !w-9 !h-9 !min-w-9" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
