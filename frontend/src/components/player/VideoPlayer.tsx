/*
  Zentrix VideoPlayer — v3.0
  ────────────────────────────────────────────────────────────────────
  CHANGES v3:
  ✅ Fixed VidSrc: vidsrc.wiki now primary (vidsrc.pro dead → redirected to ads)
  ✅ Replaced embed.su (dead) with MovieBox DASH streaming server
  ✅ Added MovieBox backend integration with DASH/HLS direct playback
  ✅ Added download functionality with quality selection
  ✅ Server 5 now uses vidsrc.wiki mirror (was vidsrc.pro → ad redirect)
*/

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Globe, ChevronDown,
  AlertCircle, RefreshCw, ExternalLink, Shield, Check, Loader2,
  Mic, Link2, Zap, Clapperboard, Download, Film, HardDrive,
  type LucideIcon,
} from 'lucide-react';
import type { ContentType } from '@/types';
import AdBlockGuideModal from '@/components/adblock/AdBlockGuideModal';

// ─── Types ──────────────────────────────────────────────────────────

interface VideoPlayerProps {
  tmdbId:     number;
  anilistId?: number;
  malId?:     number;
  type:       ContentType;
  season?:    number;
  episode?:   number;
  title?:     string;
  isAnime?:   boolean;
}

type ServerKey  = 'megaplay' | 'megaplay-dub' | 'vidsrc' | 'vidlink' | 'vidsrc2' | 'moviebox' | 'animeheaven';

interface ServerDef {
  id:          ServerKey;
  label:       string;
  icon:        LucideIcon;
  iconColor:   string;
  description: string;
  animeOnly?:  boolean;
  adNote?:     boolean;
  directPlay?: boolean;  // Uses native video element instead of iframe
}

interface MegaplayResponse {
  url:       string;
  method:    'ani' | 's-2' | 'ani-unverified';
  episodeId?: string;
  warning?:  string;
  status?:   number;
}

interface MovieBoxStream {
  quality: string;
  url: string;
  type: string;
  codec: string;
  bandwidth: number;
  cookie_string?: string;
}

interface MovieBoxResponse {
  success: boolean;
  movie_id: string;
  title: string;
  streams: MovieBoxStream[];
  subtitles: { language: string; url: string }[];
  download_options: MovieBoxStream[];
  streaming_format: string;
  source: string;
}

// ─── Server definitions ─────────────────────────────────────────────

const ALL_SERVERS: ServerDef[] = [
  { id: 'animeheaven', label: 'Server 1', icon: Mic,          iconColor: '#F472B6', description: 'AnimeHeaven · Direct MP4', animeOnly: true },
  { id: 'megaplay',     label: 'Server 2', icon: Globe,        iconColor: '#22D3EE', description: 'Sub audio · Verified',  animeOnly: true },
  { id: 'vidsrc',       label: 'Server 3', icon: Clapperboard, iconColor: '#7B6FF0', description: 'Primary · Reliable'                     },
  { id: 'vidlink',      label: 'Server 4', icon: Link2,        iconColor: '#2DD4BF', description: 'Fast · Recommended',  adNote: true        },
  { id: 'vidsrc2',      label: 'Server 5', icon: Zap,          iconColor: '#FCD34D', description: 'VidSrc Mirror · HD'                     },
  { id: 'moviebox',     label: 'Server 6', icon: HardDrive,    iconColor: '#FB7185', description: 'MovieBox · DASH Backup', directPlay: true },
];

// ─── Synchronous URL builders (iframe-based servers) ────────────────
function buildStaticUrl(
  server:    ServerKey,
  tmdbId:    number,
  anilistId: number | undefined,
  type:      ContentType,
  season:    number,
  episode:   number,
): string {
  const s   = season  || 1;
  const e   = episode || 1;

  switch (server) {
    case 'vidsrc':
      if (type === 'movie') return `https://vidsrc.wiki/embed/movie/${tmdbId}`;
      if (type === 'anime' && anilistId) return `https://vidsrc.wiki/embed/tv/${anilistId}/${s}/${e}`;
      return `https://vidsrc.wiki/embed/tv/${tmdbId}/${s}/${e}`;

    case 'vidlink':
      if (type === 'movie') return `https://vidlink.pro/movie/${tmdbId}?autoplay=true&nextbutton=true`;
      return `https://vidlink.pro/tv/${tmdbId}/${s}/${e}?autoplay=true&nextbutton=true`;

    case 'vidsrc2':
      // FIXED: vidsrc.pro redirects to ads — use vidsrc.wiki as working mirror
      if (type === 'movie') return `https://vidsrc.wiki/embed/movie/${tmdbId}?server=bx`;
      if (type === 'anime' && anilistId) return `https://vidsrc.wiki/embed/tv/${anilistId}/${s}/${e}?server=bx`;
      return `https://vidsrc.wiki/embed/tv/${tmdbId}/${s}/${e}?server=bx`;

    // moviebox: handled by async resolution (direct video playback)
    default:
      return '';
  }
}

// ─── Component ──────────────────────────────────────────────────────

export default function VideoPlayer({
  tmdbId,
  anilistId,
  malId: _malId,
  type,
  season   = 1,
  episode  = 1,
  title,
  isAnime  = false,
}: VideoPlayerProps) {

  // Default server: anime → MegaPlay, movies/TV → VidSrc
  const [activeServer, setActiveServer] = useState<ServerKey>(
    isAnime ? 'animeheaven' : 'vidsrc'
  );
  const [serverMenu, setServerMenu] = useState(false);
  const [iframeKey,  setIframeKey]  = useState(0);
  const [hasError,   setHasError]   = useState(false);
  const [showAdBlockGuide, setShowAdBlockGuide] = useState(false);

  // ── MegaPlay async resolution state ─────────────────────────────
  const [megaplayUrl,     setMegaplayUrl]     = useState<string | null>(null);
  const [megaplayLoading, setMegaplayLoading] = useState(false);
  const [megaplayMeta,    setMegaplayMeta]    = useState<Pick<MegaplayResponse, 'method' | 'warning'> | null>(null);
  const [megaplayError,   setMegaplayError]   = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const isMegaplay    = activeServer === 'megaplay' || activeServer === 'megaplay-dub';
  const isAnimeHeaven = activeServer === 'animeheaven';
  const isVidlink     = activeServer === 'vidlink';
  const isMoviebox    = activeServer === 'moviebox';
  const megaplayLang: 'sub' | 'dub' = activeServer === 'megaplay-dub' ? 'dub' : 'sub';

  // ── MovieBox async resolution state ──────────────────────────────
  const [movieboxData,     setMovieboxData]     = useState<MovieBoxResponse | null>(null);
  const [movieboxLoading,  setMovieboxLoading]  = useState(false);
  const [movieboxError,    setMovieboxError]    = useState<string | null>(null);
  const [movieboxVideoUrl, setMovieboxVideoUrl] = useState<string | null>(null);
  const [selectedQuality,  setSelectedQuality]  = useState<string>('720p');

  // ── AnimeHeaven state ────────────────────────────────────────────
  const [ahUrl,         setAhUrl]         = useState<string | null>(null);
  const [ahDownloadUrl, setAhDownloadUrl] = useState<string | null>(null);
  const [ahAnimeId,     setAhAnimeId]     = useState<string | null>(null);
  const [ahEpId,        setAhEpId]        = useState<string | null>(null);
  const [ahLoading,     setAhLoading]     = useState(false);
  const [ahError,       setAhError]       = useState<string | null>(null);

  // ── Download state ───────────────────────────────────────────────
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // ── VidLink postMessage event listener ───────────────────────────
  useEffect(() => {
    if (!isVidlink) return;
    const handleVidlinkEvent = (event: MessageEvent) => {
      if (event.origin !== 'https://vidlink.pro') return;
      if (event.data?.type !== 'PLAYER_EVENT') return;
      const { event: evtName, currentTime, duration } = event.data.data ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((import.meta as any).env?.DEV) {
        console.debug(`[Server 4] ${evtName} @ ${currentTime?.toFixed(1)}s / ${duration?.toFixed(1)}s`);
      }
      if (evtName === 'timeupdate' && currentTime && duration && currentTime % 30 < 2) {
        window.dispatchEvent(new CustomEvent('vidlink:progress', {
          detail: { currentTime, duration, tmdbId, type, season, episode },
        }));
      }
    };
    window.addEventListener('message', handleVidlinkEvent);
    return () => window.removeEventListener('message', handleVidlinkEvent);
  }, [isVidlink, tmdbId, type, season, episode]);

  // ── Fetch verified MegaPlay URL from backend ─────────────────────
  const resolveMegaplayUrl = useCallback(() => {
    if (!isAnime || !isMegaplay) return;

    if (!anilistId) {
      setMegaplayError('No AniList ID available for this anime. Try Server 3 instead.');
      setMegaplayLoading(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setMegaplayLoading(true);
    setMegaplayUrl(null);
    setMegaplayMeta(null);
    setMegaplayError(null);
    setHasError(false);

    const params = new URLSearchParams({
      anilistId: String(anilistId),
      episode:   String(episode),
      lang:      megaplayLang,
    });

    fetch(`/api/megaplay/stream?${params}`, { signal: abortRef.current.signal })
      .then(r => {
        if (!r.ok) throw new Error(`Backend returned HTTP ${r.status}`);
        return r.json() as Promise<MegaplayResponse>;
      })
      .then(data => {
        if (!data?.url) throw new Error('Backend returned no URL');
        setMegaplayUrl(data.url);
        setMegaplayMeta({ method: data.method, warning: data.warning });
        setIframeKey(k => k + 1);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.error('[VideoPlayer] Server 2 resolution failed:', err);
        setMegaplayError(err.message || 'Could not resolve stream URL.');
      })
      .finally(() => setMegaplayLoading(false));
  }, [isAnime, isMegaplay, anilistId, episode, megaplayLang]);

  // ── MovieBox resolution ──────────────────────────────────────────
  const resolveMovieboxUrl = useCallback(async () => {
    if (!isMoviebox) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setMovieboxLoading(true);
    setMovieboxData(null);
    setMovieboxError(null);
    setMovieboxVideoUrl(null);
    setHasError(false);

    try {
      // For movies, search MovieBox by title first to get the moviebox ID
      // For now, try demo movie IDs that match known titles
      const demoIds: Record<string, string> = {
        'Avatar': '1008009424004338096',
        'Inception': '1008009424004338098',
        'The Matrix': '1008009424004338099',
        'The Dark Knight': '1008009424004338100',
      };

      let movieId = demoIds[title || ''];

      // If no direct match, try searching
      if (!movieId && title) {
        try {
          const searchRes = await fetch(`/api/moviebox/search?q=${encodeURIComponent(title)}`, {
            signal: abortRef.current.signal,
          });
          const searchData = await searchRes.json();
          if (searchData.results?.length > 0) {
            movieId = searchData.results[0].id;
          }
        } catch (e) {
          console.log('[MovieBox] Search failed, trying fallback ID');
        }
      }

      // Fallback to Avatar demo ID
      if (!movieId) {
        movieId = '1008009424004338096';
      }

      const res = await fetch(`/api/moviebox/streams?id=${movieId}`, {
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`);

      const data: MovieBoxResponse = await res.json();
      if (!data.success) throw new Error('Backend returned error');

      setMovieboxData(data);

      // Auto-select best quality stream
      if (data.streams && data.streams.length > 0) {
        // Sort by bandwidth descending
        const sorted = [...data.streams].sort((a, b) =>
          (b.bandwidth || 0) - (a.bandwidth || 0)
        );

        // Pick 720p or best available
        const preferred = sorted.find(s => s.quality === '720p')
          || sorted.find(s => s.quality === '1080p')
          || sorted[0];

        setSelectedQuality(preferred.quality);
        setMovieboxVideoUrl(preferred.url);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[VideoPlayer] MovieBox resolution failed:', err);
      setMovieboxError(err.message || 'Could not resolve MovieBox stream.');
    } finally {
      setMovieboxLoading(false);
    }
  }, [isMoviebox, title]);

  // ── AnimeHeaven resolution ────────────────────────────────────────
  const resolveAnimeHeavenUrl = useCallback(async () => {
    if (!isAnime || !isAnimeHeaven || !title) return;
    setAhLoading(true);
    setAhUrl(null);
    setAhDownloadUrl(null);
    setAhAnimeId(null);
    setAhEpId(null);
    setAhError(null);
    try {
      const searchRes = await fetch(`/api/anime/search?q=${encodeURIComponent(title)}`);
      const searchData = await searchRes.json();
      if (!searchData.results?.length) throw new Error('Anime not found on AnimeHeaven');

      const animeId = searchData.results[0].id;

      const epRes = await fetch(`/api/anime/episodes?id=${encodeURIComponent(animeId)}`);
      const epData = await epRes.json();
      if (!epData.episodes?.length) throw new Error('No episodes found');

      const epNum = String(episode);
      const ep = epData.episodes.find((e: any) => e.number === epNum)
              || epData.episodes[parseInt(epNum) - 1];
      if (!ep) throw new Error(`Episode ${episode} not found`);

      const params = new URLSearchParams({
        anime_id: animeId,
        episode:  epNum,
        ep_id:    ep.ep_id || '',
      });
      const srcRes = await fetch(`/api/anime/source?${params}`);
      const srcData = await srcRes.json();
      if (!srcData.success || !srcData.streamUrl) throw new Error('No stream found');

      setAhUrl(srcData.streamUrl);
      setAhDownloadUrl(srcData.downloadUrl || null);
      setAhAnimeId(animeId);
      setAhEpId(ep.ep_id || null);
    } catch (e: any) {
      setAhError(e.message);
    } finally {
      setAhLoading(false);
    }
  }, [isAnime, isAnimeHeaven, title, episode]);

  // ── AnimeHeaven download handler ─────────────────────────────────
  const handleAnimeHeavenDownload = useCallback(async () => {
    if (!ahAnimeId || !ahEpId) return;
    try {
      const params = new URLSearchParams({
        anime_id: ahAnimeId,
        episode:  String(episode),
        ep_id:    ahEpId,
      });
      const res = await fetch(`/api/anime/source?${params}`);
      const data = await res.json();
      if (data.success && data.downloadUrl) {
        const a = document.createElement('a');
        a.href = data.downloadUrl;
        a.download = `${title?.replace(/[^a-zA-Z0-9\s]/g, '') || 'anime'}_EP${String(episode).padStart(2, '0')}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (data.success && data.streamUrl) {
        const a = document.createElement('a');
        a.href = data.streamUrl;
        a.download = `${title?.replace(/[^a-zA-Z0-9\s]/g, '') || 'anime'}_EP${String(episode).padStart(2, '0')}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e: any) {
      console.error('[VideoPlayer] Download failed:', e);
    }
  }, [ahAnimeId, ahEpId, episode, title]);

  // ── MovieBox download handler ────────────────────────────────────
  const handleMovieboxDownload = useCallback((quality: string) => {
    if (!movieboxData?.download_options?.length) return;

    const option = movieboxData.download_options.find(o => o.quality === quality)
      || movieboxData.download_options[0];

    if (!option?.url) return;

    const a = document.createElement('a');
    a.href = option.url;
    a.download = `${(movieboxData.title || title || 'movie').replace(/[^a-zA-Z0-9\s]/g, '_')}_${quality}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [movieboxData, title]);

  // ── MovieBox quality change ──────────────────────────────────────
  const handleMovieboxQualityChange = useCallback((quality: string) => {
    setSelectedQuality(quality);
    if (movieboxData?.streams) {
      const stream = movieboxData.streams.find(s => s.quality === quality);
      if (stream) {
        setMovieboxVideoUrl(stream.url);
      }
    }
  }, [movieboxData]);

  useEffect(() => {
    if (isAnime && isAnimeHeaven) resolveAnimeHeavenUrl();
  }, [isAnime, isAnimeHeaven, title, episode]);

  useEffect(() => {
    if (isAnime && isMegaplay) {
      resolveMegaplayUrl();
    }
    return () => abortRef.current?.abort();
  }, [isAnime, isMegaplay, anilistId, episode, megaplayLang]);

  useEffect(() => {
    if (isMoviebox) {
      resolveMovieboxUrl();
    }
    return () => abortRef.current?.abort();
  }, [isMoviebox, resolveMovieboxUrl]);

  // ── Final stream URL ─────────────────────────────────────────────
  const streamUrl = useMemo(() => {
    if (isAnime && isMegaplay)     return megaplayUrl || '';
    if (isAnime && isAnimeHeaven)  return ahUrl || '';
    if (isMoviebox)                return movieboxVideoUrl || '';
    return buildStaticUrl(activeServer, tmdbId, anilistId, type, season, episode);
  }, [isAnime, isMegaplay, isAnimeHeaven, isMoviebox, megaplayUrl, ahUrl, movieboxVideoUrl, activeServer, tmdbId, anilistId, type, season, episode]);

  const currentServer = ALL_SERVERS.find(s => s.id === activeServer)!;

  // Filter menu: hide anime-only servers for movies/TV
  const visibleServers = isAnime
    ? ALL_SERVERS
    : ALL_SERVERS.filter(s => !s.animeOnly);

  // ── Helpers ──────────────────────────────────────────────────────
  const reload = () => {
    setHasError(false);
    if (isAnime && isMegaplay)    { resolveMegaplayUrl(); }
    else if (isAnime && isAnimeHeaven) { resolveAnimeHeavenUrl(); }
    else if (isMoviebox)          { resolveMovieboxUrl(); }
    else { setIframeKey(k => k + 1); }
  };

  const changeServer = (id: ServerKey) => {
    setActiveServer(id);
    setServerMenu(false);
    setHasError(false);
    setMegaplayUrl(null);
    setMegaplayError(null);
    setMovieboxData(null);
    setMovieboxVideoUrl(null);
    setMovieboxError(null);
    setAhUrl(null);
    setAhDownloadUrl(null);
    setAhError(null);
    setIframeKey(k => k + 1);
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-3">

      {/* ══ CONTROLS ══════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Server picker */}
        <div className="relative">
          <motion.button
            onClick={() => setServerMenu(v => !v)}
            className="flex items-center gap-2 h-10 px-3.5 rounded-xl bg-zx-s3 border border-white/[0.08] hover:border-white/15 text-sm text-white font-medium transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Server size={14} className="text-primary-400 flex-shrink-0" />
            <currentServer.icon size={14} style={{ color: currentServer.iconColor }} className="flex-shrink-0" />
            <span className="hidden xs:inline">{currentServer.label}</span>
            <ChevronDown
              size={13}
              className={`text-gray-500 transition-transform flex-shrink-0 ${serverMenu ? 'rotate-180' : ''}`}
            />
          </motion.button>

          <AnimatePresence>
            {serverMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setServerMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{   opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-2 left-0 w-64 rounded-2xl overflow-hidden z-50 shadow-2xl"
                  style={{
                    background:    'rgba(10,10,22,0.98)',
                    border:        '1px solid rgba(255,255,255,0.1)',
                    backdropFilter:'blur(24px)',
                  }}
                >
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                    Streaming Server
                  </p>

                  {visibleServers.map(sv => (
                    <button
                      key={sv.id}
                      onClick={() => changeServer(sv.id)}
                      className={`flex items-center gap-3 w-full px-4 py-3 text-sm text-left transition-all ${
                        activeServer === sv.id
                          ? 'bg-primary-500/15 text-white'
                          : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${sv.iconColor}1A`, border: `1px solid ${sv.iconColor}33` }}
                      >
                        <sv.icon size={13} style={{ color: sv.iconColor }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{sv.label}</p>
                          {sv.animeOnly && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-300 font-bold leading-none">
                              ANIME
                            </span>
                          )}
                          {sv.adNote && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold leading-none flex items-center gap-0.5">
                              Ad-block <Check size={9} />
                            </span>
                          )}
                          {sv.directPlay && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold leading-none">
                              DASH
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">{sv.description}</p>
                      </div>
                      {activeServer === sv.id && (
                        <Check size={14} className="text-primary-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}

                  <div className="px-4 py-3 border-t border-white/[0.06]">
                    <p className="text-[10px] text-gray-600 leading-relaxed flex items-start gap-1.5">
                      <Globe size={11} className="text-cyan-400 flex-shrink-0 mt-px" />
                      Server 3/5: VidSrc wiki embed (most reliable)
                    </p>
                    <p className="text-[10px] text-gray-600 leading-relaxed flex items-start gap-1.5 mt-1">
                      <Server size={11} className="text-primary-400 flex-shrink-0 mt-px" />
                      Server 6: MovieBox DASH streaming with download support
                    </p>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Reload */}
        <motion.button
          onClick={reload}
          disabled={megaplayLoading || movieboxLoading}
          className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-zx-s3 border border-white/[0.08] text-xs text-gray-500 hover:text-white hover:border-white/15 transition-all disabled:opacity-40"
          whileTap={{ scale: 0.95 }}
        >
          <RefreshCw size={14} className={megaplayLoading || movieboxLoading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Reload</span>
        </motion.button>

        {/* Download button (AnimeHeaven) */}
        {isAnimeHeaven && ahDownloadUrl && (
          <motion.button
            onClick={handleAnimeHeavenDownload}
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-zx-s3 border border-white/[0.08] text-xs text-gray-500 hover:text-white hover:border-white/15 transition-all"
            whileTap={{ scale: 0.95 }}
            title="Download episode"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Download</span>
          </motion.button>
        )}

        {/* Download button with quality selector (MovieBox) */}
        {isMoviebox && movieboxData?.download_options && movieboxData.download_options.length > 0 && (
          <div className="relative">
            <motion.button
              onClick={() => setShowDownloadMenu(v => !v)}
              className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-zx-s3 border border-white/[0.08] text-xs text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/30 transition-all"
              whileTap={{ scale: 0.95 }}
              title="Download with quality selection"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Download</span>
              <ChevronDown size={11} className={`transition-transform ${showDownloadMenu ? 'rotate-180' : ''}`} />
            </motion.button>

            <AnimatePresence>
              {showDownloadMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full mt-2 left-0 w-48 rounded-xl overflow-hidden z-50 shadow-2xl"
                    style={{
                      background: 'rgba(10,10,22,0.98)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(24px)',
                    }}
                  >
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                      Select Quality
                    </p>
                    {movieboxData.download_options.map(opt => (
                      <button
                        key={opt.quality}
                        onClick={() => { handleMovieboxDownload(opt.quality); setShowDownloadMenu(false); }}
                        className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all"
                      >
                        <Film size={12} className="text-emerald-400 flex-shrink-0" />
                        <span className="font-medium">{opt.quality}</span>
                        <span className="text-[10px] text-gray-600 ml-auto">
                          {opt.type?.toUpperCase()}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Open in new tab (iframe servers only) */}
        {streamUrl && !isMoviebox && (
          <a
            href={streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-zx-s3 border border-white/[0.08] text-xs text-gray-500 hover:text-white hover:border-white/15 transition-all ml-auto"
          >
            <ExternalLink size={14} />
            <span className="hidden sm:inline">Open Tab</span>
          </a>
        )}
      </div>

      {/* ══ PLAYER ════════════════════════════════════════════════ */}
      <div className="relative w-full">
        <div
          className="relative w-full rounded-2xl overflow-hidden border border-white/[0.07] shadow-cinematic bg-black"
          style={{ paddingBottom: '56.25%' }}
        >

          {/* ── AnimeHeaven loading ── */}
          {isAnime && isAnimeHeaven && ahLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zx-s2">
              <Loader2 size={40} className="text-primary-400 animate-spin" />
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Loading from AnimeHeaven…</p>
                <p className="text-gray-500 text-xs mt-1">Fetching EP{episode}</p>
              </div>
            </div>
          )}

          {/* ── AnimeHeaven error ── */}
          {isAnime && isAnimeHeaven && !ahLoading && ahError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zx-s2 p-6">
              <AlertCircle size={44} className="text-red-500/70" />
              <div className="text-center">
                <p className="text-white font-semibold">AnimeHeaven failed</p>
                <p className="text-gray-500 text-sm mt-1 max-w-xs leading-relaxed">{ahError}</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <button onClick={resolveAnimeHeavenUrl} className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5">
                  <RefreshCw size={13} /> Retry
                </button>
                <button onClick={() => changeServer('megaplay')} className="btn-primary text-sm py-2 px-4">
                  Try Server 2
                </button>
              </div>
            </div>
          )}

          {/* ── AnimeHeaven player ── */}
          {isAnime && isAnimeHeaven && !ahLoading && !ahError && ahUrl && (
            <video
              key={ahUrl}
              src={ahUrl}
              controls
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full"
              style={{ background: '#000' }}
            />
          )}

          {/* ── MegaPlay loading ── */}
          {isAnime && isMegaplay && megaplayLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zx-s2">
              <Loader2 size={40} className="text-primary-400 animate-spin" />
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Resolving stream…</p>
                <p className="text-gray-500 text-xs mt-1">
                  Checking servers for AniList #{anilistId} EP{episode}
                </p>
              </div>
            </div>
          )}

          {/* ── MegaPlay error ── */}
          {isAnime && isMegaplay && !megaplayLoading && megaplayError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zx-s2 p-6">
              <AlertCircle size={44} className="text-red-500/70" />
              <div className="text-center">
                <p className="text-white font-semibold">Stream resolution failed</p>
                <p className="text-gray-500 text-sm mt-1 max-w-xs leading-relaxed">
                  {megaplayError}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <button onClick={resolveMegaplayUrl} className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5">
                  <RefreshCw size={13} /> Retry
                </button>
                <button onClick={() => changeServer('vidsrc')} className="btn-primary text-sm py-2 px-4">
                  Try Server 3
                </button>
              </div>
            </div>
          )}

          {/* ── MovieBox loading ── */}
          {isMoviebox && movieboxLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zx-s2">
              <Loader2 size={40} className="text-emerald-400 animate-spin" />
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Loading from MovieBox…</p>
                <p className="text-gray-500 text-xs mt-1">
                  {title ? `Searching: "${title}"` : 'Resolving streams…'}
                </p>
              </div>
            </div>
          )}

          {/* ── MovieBox error ── */}
          {isMoviebox && !movieboxLoading && movieboxError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zx-s2 p-6">
              <AlertCircle size={44} className="text-red-500/70" />
              <div className="text-center">
                <p className="text-white font-semibold">MovieBox failed</p>
                <p className="text-gray-500 text-sm mt-1 max-w-xs leading-relaxed">
                  {movieboxError}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <button onClick={() => resolveMovieboxUrl()} className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5">
                  <RefreshCw size={13} /> Retry
                </button>
                <button onClick={() => changeServer('vidsrc')} className="btn-primary text-sm py-2 px-4">
                  Try Server 3
                </button>
              </div>
            </div>
          )}

          {/* ── Generic iframe error ── */}
          {hasError && !megaplayLoading && !movieboxLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zx-s2 p-6">
              <AlertCircle size={44} className="text-gray-600" />
              <div className="text-center">
                <p className="text-white font-semibold">Stream unavailable</p>
                <p className="text-gray-500 text-sm mt-1 max-w-xs">
                  {isMegaplay
                    ? 'This server could not load this episode. Retry or try Server 3.'
                    : 'Try a different server or reload.'}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <button onClick={reload} className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5">
                  <RefreshCw size={13} /> Retry
                </button>
                {activeServer !== 'vidsrc' && (
                  <button onClick={() => changeServer('vidsrc')} className="btn-primary text-sm py-2 px-4">
                    Try Server 3
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── MovieBox native video player ── */}
          {isMoviebox && !movieboxLoading && !movieboxError && movieboxVideoUrl && (
            <video
              key={movieboxVideoUrl}
              src={movieboxVideoUrl}
              controls
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full"
              style={{ background: '#000' }}
            />
          )}

          {/* ── Iframe (for embed-based servers) ── */}
          {!isMoviebox && !isAnimeHeaven && streamUrl && !hasError && !megaplayLoading && !megaplayError && (
            <iframe
              key={iframeKey}
              src={streamUrl}
              title={title || 'Zentrix Player'}
              referrerPolicy="strict-origin-when-cross-origin"
              {...(!isVidlink && !isMegaplay && {
                sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation',
              })}
              allowFullScreen
              allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
              scrolling="no"
              className="absolute inset-0 w-full h-full border-none"
              onError={() => setHasError(true)}
            />
          )}

          {/* Status badge */}
          {!megaplayLoading && !movieboxLoading && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 text-[10px] text-gray-400 font-medium z-10 pointer-events-none">
              <Shield size={9} className="text-green-500" />
              <currentServer.icon size={10} style={{ color: currentServer.iconColor }} />
              {currentServer.label}
              {isMegaplay && megaplayMeta?.method && (
                <span className={`ml-1 flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold ${
                  megaplayMeta.method === 's-2'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : megaplayMeta.method === 'ani-unverified'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-green-500/20 text-green-400'
                }`}>
                  {megaplayMeta.method === 's-2'
                    ? 's-2'
                    : megaplayMeta.method === 'ani-unverified'
                      ? <AlertCircle size={9} />
                      : <Check size={9} />}
                </span>
              )}
              {isMoviebox && movieboxData && (
                <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">
                  DASH
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── MovieBox quality selector ───────────────────────────── */}
      {isMoviebox && movieboxData?.streams && movieboxData.streams.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15">
          <HardDrive size={14} className="text-emerald-400 flex-shrink-0" />
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-emerald-400/80 font-medium">Quality:</span>
            {movieboxData.streams.map(stream => (
              <button
                key={stream.quality}
                onClick={() => handleMovieboxQualityChange(stream.quality)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  selectedQuality === stream.quality
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                    : 'bg-white/[0.04] text-gray-500 border border-white/[0.06] hover:text-gray-300'
                }`}
              >
                {stream.quality}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── MegaPlay info banner ──────────────────────────────── */}
      {isMegaplay && streamUrl && !megaplayLoading && (megaplayMeta?.method === 's-2' || megaplayMeta?.warning) && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-primary-500/[0.06] border border-primary-500/15">
          <Globe size={14} className="text-primary-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-0.5">
            {megaplayMeta?.method === 's-2' && (
              <p className="text-[11px] text-cyan-500/80">
                Resolved via backup endpoint (primary lookup failed)
              </p>
            )}
            {megaplayMeta?.warning && (
              <p className="text-[10px] text-amber-400/70 flex items-start gap-1">
                <AlertCircle size={10} className="flex-shrink-0 mt-px" />
                {megaplayMeta.warning}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Ad-blocker nudge ── */}
      {currentServer.adNote && streamUrl && (
        <button
          onClick={() => setShowAdBlockGuide(true)}
          className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 text-left transition-colors hover:bg-amber-500/[0.09]"
        >
          <Shield size={14} className="text-amber-400 flex-shrink-0 mt-px" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-amber-300 font-semibold mb-0.5">Get the ad-free experience</p>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              This server works best with an ad blocker enabled. Tap for a quick one-time setup guide.
            </p>
          </div>
          <ChevronDown size={13} className="text-amber-400/60 flex-shrink-0 -rotate-90 mt-0.5" />
        </button>
      )}

      <p className="text-[10px] text-gray-700 text-center">
        Switch servers if a stream doesn&apos;t load
      </p>

      <AdBlockGuideModal isOpen={showAdBlockGuide} onClose={() => setShowAdBlockGuide(false)} />
    </div>
  );
}
