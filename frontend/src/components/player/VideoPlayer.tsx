/*
  Zentrix VideoPlayer — v4.0 (Cineverse Edition)
  ────────────────────────────────────────────────────────────────────
  Complete redesign to match Cineverse modal player style.
  Clean, minimal, professional modal overlay player.
  Fixed subtitle system with proper SRT→VTT conversion.
  ────────────────────────────────────────────────────────────────────
*/

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Globe, ChevronDown, X,
  AlertCircle, RefreshCw, ExternalLink, Check, Loader2,
  Mic, Link2, Zap, Clapperboard, Download, Film, HardDrive,
  Subtitles, MessageSquareOff, Settings, Maximize2,
  type LucideIcon,
} from 'lucide-react';
import type { ContentType } from '@/types';

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
  onClose?:   () => void;
  isOpen:     boolean;
}

type ServerKey  = 'megaplay' | 'megaplay-dub' | 'vidsrc' | 'vidlink' | 'vidsrc2' | 'septorch' | 'animeheaven';

interface ServerDef {
  id:          ServerKey;
  label:       string;
  icon:        LucideIcon;
  iconColor:   string;
  description: string;
  animeOnly?:  boolean;
  adNote?:     boolean;
  directPlay?: boolean;
}

interface MegaplayResponse {
  url:       string;
  method:    'ani' | 's-2' | 'ani-unverified';
  episodeId?: string;
  warning?:  string;
  status?:   number;
}

interface SeptorchStream {
  quality: string;
  resolution: number;
  stream_url: string;
  download_url: string;
  source_url: string;
  size_mb: string;
  size_bytes: number;
  id: string;
}

interface SeptorchResponse {
  success: boolean;
  movie_id: string;
  detail_path: string;
  streams: SeptorchStream[];
  subtitles: { language: string; language_name: string; url: string }[];
  source: string;
}

interface SubtitleTrack {
  label: string;
  srclang: string;
  src: string;
}

// ─── Server definitions ─────────────────────────────────────────────

const ALL_SERVERS: ServerDef[] = [
  { id: 'animeheaven', label: 'Server 1', icon: Mic,          iconColor: '#F472B6', description: 'Direct MP4', animeOnly: true },
  { id: 'megaplay',     label: 'Server 2', icon: Globe,        iconColor: '#22D3EE', description: 'Sub audio · Verified',  animeOnly: true },
  { id: 'vidsrc',       label: 'Server 3', icon: Clapperboard, iconColor: '#7B6FF0', description: 'Primary · Reliable'                     },
  { id: 'vidlink',      label: 'Server 4', icon: Link2,        iconColor: '#2DD4BF', description: 'Fast · Recommended',  adNote: true        },
  { id: 'vidsrc2',      label: 'Server 5', icon: Zap,          iconColor: '#FCD34D', description: 'VidSrc Mirror · HD'                     },
  { id: 'septorch',     label: 'Server 6', icon: HardDrive,    iconColor: '#FB7185', description: 'Direct MP4 Stream', directPlay: true },
];

// ─── Synchronous URL builders ───────────────────────────────────────
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
      if (type === 'movie') return `https://vidsrc.wiki/embed/movie/${tmdbId}?server=bx`;
      if (type === 'anime' && anilistId) return `https://vidsrc.wiki/embed/tv/${anilistId}/${s}/${e}?server=bx`;
      return `https://vidsrc.wiki/embed/tv/${tmdbId}/${s}/${e}?server=bx`;

    default:
      return '';
  }
}

// ─── Subtitle Language Options ──────────────────────────────────────

const SUBTITLE_LANGUAGES: { code: string; name: string }[] = [
  { code: 'off', name: 'Off' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'tr', name: 'Turkish' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' },
  { code: 'cs', name: 'Czech' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'id', name: 'Indonesian' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'bg', name: 'Bulgarian' },
];

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
  onClose,
  isOpen,
}: VideoPlayerProps) {

  const [activeServer, setActiveServer] = useState<ServerKey>(
    isAnime ? 'animeheaven' : 'septorch'
  );
  const [serverMenu, setServerMenu] = useState(false);
  const [iframeKey,  setIframeKey]  = useState(0);
  const [hasError,   setHasError]   = useState(false);

  // ── MegaPlay state ──────────────────────────────────────────────
  const [megaplayUrl,     setMegaplayUrl]     = useState<string | null>(null);
  const [megaplayLoading, setMegaplayLoading] = useState(false);
  const [megaplayMeta,    setMegaplayMeta]    = useState<Pick<MegaplayResponse, 'method' | 'warning'> | null>(null);
  const [megaplayError,   setMegaplayError]   = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const isMegaplay    = activeServer === 'megaplay' || activeServer === 'megaplay-dub';
  const isAnimeHeaven = activeServer === 'animeheaven';
  const isVidlink     = activeServer === 'vidlink';
  const isSeptorch    = activeServer === 'septorch';
  const megaplayLang: 'sub' | 'dub' = activeServer === 'megaplay-dub' ? 'dub' : 'sub';

  // ── Septorch state ───────────────────────────────────────────────
  const [septorchData,     setSeptorchData]     = useState<SeptorchResponse | null>(null);
  const [septorchLoading,  setSeptorchLoading]  = useState(false);
  const [septorchError,    setSeptorchError]    = useState<string | null>(null);
  const [septorchVideoUrl, setSeptorchVideoUrl] = useState<string | null>(null);
  const [selectedQuality,  setSelectedQuality]  = useState<string>('720p');

  // ── Subtitle state ───────────────────────────────────────────────
  const [subtitleTracks,   setSubtitleTracks]   = useState<SubtitleTrack[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>('off');
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [subtitlesReady,   setSubtitlesReady]   = useState(false);

  // ── AnimeHeaven state ────────────────────────────────────────────
  const [ahUrl,         setAhUrl]         = useState<string | null>(null);
  const [ahDownloadUrl, setAhDownloadUrl] = useState<string | null>(null);
  const [ahAnimeId,     setAhAnimeId]     = useState<string | null>(null);
  const [ahEpId,        setAhEpId]        = useState<string | null>(null);
  const [ahLoading,     setAhLoading]     = useState(false);
  const [ahError,       setAhError]       = useState<string | null>(null);

  // ── Download state ───────────────────────────────────────────────
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // ── Video ref ────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── Reset state when modal opens ─────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setHasError(false);
      setMegaplayError(null);
      setSeptorchError(null);
      setAhError(null);
      setSubtitlesReady(false);
      setSubtitleTracks([]);
      setSelectedSubtitle('off');
    }
  }, [isOpen]);

  // ── Close on Escape key ──────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── VidLink postMessage listener ─────────────────────────────────
  useEffect(() => {
    if (!isVidlink) return;
    const handleVidlinkEvent = (event: MessageEvent) => {
      if (event.origin !== 'https://vidlink.pro') return;
      if (event.data?.type !== 'PLAYER_EVENT') return;
      const { event: evtName, currentTime, duration } = event.data.data ?? {};
      if (evtName === 'timeupdate' && currentTime && duration && currentTime % 30 < 2) {
        window.dispatchEvent(new CustomEvent('vidlink:progress', {
          detail: { currentTime, duration, tmdbId, type, season, episode },
        }));
      }
    };
    window.addEventListener('message', handleVidlinkEvent);
    return () => window.removeEventListener('message', handleVidlinkEvent);
  }, [isVidlink, tmdbId, type, season, episode]);

  // ── Fetch MegaPlay URL ───────────────────────────────────────────
  const resolveMegaplayUrl = useCallback(() => {
    if (!isAnime || !isMegaplay) return;
    if (!anilistId) {
      setMegaplayError('No AniList ID available. Try Server 3.');
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
        setMegaplayError(err.message || 'Could not resolve stream URL.');
      })
      .finally(() => setMegaplayLoading(false));
  }, [isAnime, isMegaplay, anilistId, episode, megaplayLang]);

  // ── Septorch resolution ──────────────────────────────────────────
  const resolveSeptorchUrl = useCallback(async () => {
    if (!isSeptorch || !title) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setSeptorchLoading(true);
    setSeptorchData(null);
    setSeptorchError(null);
    setSeptorchVideoUrl(null);
    setHasError(false);
    setSubtitlesReady(false);
    setSubtitleTracks([]);
    setSelectedSubtitle('off');

    try {
      // Step 1: Search
      const searchRes = await fetch(
        `/api/septorch/search?q=${encodeURIComponent(title)}`,
        { signal: abortRef.current.signal }
      );
      if (!searchRes.ok) throw new Error(`Search failed: HTTP ${searchRes.status}`);
      const searchData = await searchRes.json();

      if (!searchData.success || !searchData.results?.length) {
        throw new Error('No results found for this title');
      }

      const expectedType = type === 'movie' ? 1 : 2;
      let match = searchData.results.find((r: any) => r.subject_type === expectedType) || searchData.results[0];
      const movieId = match.id;
      const detailPath = match.detail_path;

      if (!movieId || !detailPath) {
        throw new Error('Invalid search result: missing id or detailPath');
      }

      // Step 2: Get streams
      const isTvShow = type === 'tv';
      const streamsRes = await fetch(
        `/api/septorch/streams?id=${movieId}&detailPath=${encodeURIComponent(detailPath)}${isTvShow ? `&season=${season || 1}&episode=${episode || 1}` : ''}`,
        { signal: abortRef.current.signal }
      );
      if (!streamsRes.ok) throw new Error(`Streams failed: HTTP ${streamsRes.status}`);
      const streamsData: SeptorchResponse = await streamsRes.json();

      if (!streamsData.success || !streamsData.streams?.length) {
        throw new Error('No streams available');
      }

      setSeptorchData(streamsData);

      // Auto-select best quality
      const streams = streamsData.streams;
      const preferred = streams.find((s: SeptorchStream) => s.quality === '720p')
        || streams.find((s: SeptorchStream) => s.quality === '1080p')
        || streams[0];

      setSelectedQuality(preferred.quality);
      setSeptorchVideoUrl(preferred.stream_url);

      // Process subtitles
      if (streamsData.subtitles && streamsData.subtitles.length > 0) {
        const tracks = streamsData.subtitles
          .filter((sub: any) => sub.url && sub.language)
          .map((sub: any) => ({
            label: sub.language_name || sub.language,
            srclang: sub.language,
            src: `/api/septorch/subtitle?url=${encodeURIComponent(sub.url)}`,
          }));
        setSubtitleTracks(tracks);
        const engTrack = tracks.find((t: SubtitleTrack) => t.srclang.toLowerCase().startsWith('en'));
        setSelectedSubtitle(engTrack ? engTrack.srclang : 'off');
        setSubtitlesReady(true);
      } else {
        setSubtitleTracks([]);
        setSelectedSubtitle('off');
        setSubtitlesReady(false);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setSeptorchError(err.message || 'Could not resolve stream.');
    } finally {
      setSeptorchLoading(false);
    }
  }, [isSeptorch, title, type, season, episode]);

  // ── AnimeHeaven resolution ───────────────────────────────────────
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
      if (!searchData.results?.length) throw new Error('Anime not found');

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

      setAhUrl('/api/anime/python/proxy-stream?url=' + encodeURIComponent(srcData.streamUrl));
      setAhDownloadUrl(srcData.downloadUrl || null);
      setAhAnimeId(animeId);
      setAhEpId(ep.ep_id || null);
    } catch (e: any) {
      setAhError(e.message);
    } finally {
      setAhLoading(false);
    }
  }, [isAnime, isAnimeHeaven, title, episode]);

  // ── AnimeHeaven download ─────────────────────────────────────────
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
      }
    } catch (e: any) {
      console.error('[VideoPlayer] Download failed:', e);
    }
  }, [ahAnimeId, ahEpId, episode, title]);

  // ── Septorch download ────────────────────────────────────────────
  const handleSeptorchDownload = useCallback((quality: string) => {
    if (!septorchData?.streams?.length) return;
    const stream = septorchData.streams.find((s: SeptorchStream) => s.quality === quality) || septorchData.streams[0];
    if (!stream?.download_url) return;
    window.open(stream.download_url, '_blank');
  }, [septorchData]);

  // ── Septorch quality change ──────────────────────────────────────
  const handleSeptorchQualityChange = useCallback((quality: string) => {
    setSelectedQuality(quality);
    if (septorchData?.streams) {
      const stream = septorchData.streams.find((s: SeptorchStream) => s.quality === quality);
      if (stream && stream.stream_url !== septorchVideoUrl) {
        // Save current time before switching
        const currentTime = videoRef.current?.currentTime || 0;
        setSeptorchVideoUrl(stream.stream_url);
        // Restore time after source change
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = currentTime;
          }
        }, 500);
      }
    }
  }, [septorchData, septorchVideoUrl]);

  // ── Subtitle track switching (robust implementation) ─────────────
  useEffect(() => {
    if (!videoRef.current || !isSeptorch) return;
    const video = videoRef.current;

    // Wait for tracks to be loaded
    const switchTrack = () => {
      const tracks = video.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (track.language === selectedSubtitle && selectedSubtitle !== 'off') {
          track.mode = 'showing';
        } else {
          track.mode = 'hidden';
        }
      }
    };

    // Try immediately and also after loadedmetadata
    switchTrack();
    video.addEventListener('loadedmetadata', switchTrack);

    return () => {
      video.removeEventListener('loadedmetadata', switchTrack);
    };
  }, [selectedSubtitle, isSeptorch, septorchVideoUrl, subtitleTracks]);

  // ── Effects ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isAnime && isAnimeHeaven) resolveAnimeHeavenUrl();
  }, [isAnime, isAnimeHeaven, title, episode, resolveAnimeHeavenUrl]);

  useEffect(() => {
    if (isAnime && isMegaplay) {
      resolveMegaplayUrl();
    }
    return () => abortRef.current?.abort();
  }, [isAnime, isMegaplay, anilistId, episode, megaplayLang, resolveMegaplayUrl]);

  useEffect(() => {
    if (isSeptorch) {
      resolveSeptorchUrl();
    }
    return () => abortRef.current?.abort();
  }, [isSeptorch, resolveSeptorchUrl]);

  // ── Final stream URL ─────────────────────────────────────────────
  const streamUrl = useMemo(() => {
    if (isAnime && isMegaplay)     return megaplayUrl || '';
    if (isAnime && isAnimeHeaven)  return ahUrl || '';
    if (isSeptorch)                return septorchVideoUrl || '';
    return buildStaticUrl(activeServer, tmdbId, anilistId, type, season, episode);
  }, [isAnime, isMegaplay, isAnimeHeaven, isSeptorch, megaplayUrl, ahUrl, septorchVideoUrl, activeServer, tmdbId, anilistId, type, season, episode]);

  const currentServer = ALL_SERVERS.find(s => s.id === activeServer)!;
  const visibleServers = isAnime ? ALL_SERVERS : ALL_SERVERS.filter(s => !s.animeOnly);

  // ── Helpers ──────────────────────────────────────────────────────
  const reload = () => {
    setHasError(false);
    if (isAnime && isMegaplay)    { resolveMegaplayUrl(); }
    else if (isAnime && isAnimeHeaven) { resolveAnimeHeavenUrl(); }
    else if (isSeptorch)          { resolveSeptorchUrl(); }
    else { setIframeKey(k => k + 1); }
  };

  const changeServer = (id: ServerKey) => {
    setActiveServer(id);
    setServerMenu(false);
    setHasError(false);
    setMegaplayUrl(null);
    setMegaplayError(null);
    setSeptorchData(null);
    setSeptorchVideoUrl(null);
    setSeptorchError(null);
    setSubtitleTracks([]);
    setSelectedSubtitle('off');
    setSubtitlesReady(false);
    setShowSubtitleMenu(false);
    setAhUrl(null);
    setAhDownloadUrl(null);
    setAhError(null);
    setIframeKey(k => k + 1);
  };

  // ── Toggle fullscreen ────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  // Don't render if not open
  if (!isOpen) return null;

  // ── Render ───────────────────────────────────────────────────────
  const modalContent = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[90] flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(12px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      {/* Main Player Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[1100px] mx-4"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl"
          style={{
            background: 'rgba(20, 20, 30, 0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-white font-semibold text-sm truncate">
              {title || 'Now Playing'}
            </h3>
            {isSeptorch && septorchData?.streams?.[0] && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium flex-shrink-0">
                {selectedQuality}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.08] transition-all"
              title="Fullscreen"
            >
              <Maximize2 size={15} />
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.08] transition-all"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Video Player Area */}
        <div
          ref={containerRef}
          className="relative w-full bg-black"
          style={{
            aspectRatio: '16/9',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            borderRight: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Loading States */}
          {isSeptorch && septorchLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a12]">
              <Loader2 size={36} className="text-emerald-400 animate-spin" />
              <p className="text-gray-400 text-xs">Loading stream...</p>
            </div>
          )}

          {isSeptorch && !septorchLoading && septorchError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a12] p-6">
              <AlertCircle size={36} className="text-red-400/70" />
              <p className="text-white text-sm font-medium">Stream unavailable</p>
              <p className="text-gray-500 text-xs text-center max-w-xs">{septorchError}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={reload} className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-xs text-white hover:bg-white/[0.1] transition-all flex items-center gap-1.5">
                  <RefreshCw size={12} /> Retry
                </button>
                <button onClick={() => changeServer('vidsrc')} className="px-3 py-1.5 rounded-lg bg-primary-500/20 text-xs text-primary-300 hover:bg-primary-500/30 transition-all">
                  Try Server 3
                </button>
              </div>
            </div>
          )}

          {isAnime && isAnimeHeaven && ahLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a12]">
              <Loader2 size={36} className="text-primary-400 animate-spin" />
              <p className="text-gray-400 text-xs">Fetching episode...</p>
            </div>
          )}

          {isAnime && isAnimeHeaven && !ahLoading && ahError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a12] p-6">
              <AlertCircle size={36} className="text-red-400/70" />
              <p className="text-white text-sm font-medium">AnimeHeaven failed</p>
              <p className="text-gray-500 text-xs">{ahError}</p>
              <button onClick={resolveAnimeHeavenUrl} className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-xs text-white hover:bg-white/[0.1] transition-all flex items-center gap-1.5">
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {isAnime && isMegaplay && megaplayLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a12]">
              <Loader2 size={36} className="text-primary-400 animate-spin" />
              <p className="text-gray-400 text-xs">Resolving stream...</p>
            </div>
          )}

          {isAnime && isMegaplay && !megaplayLoading && megaplayError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a12] p-6">
              <AlertCircle size={36} className="text-red-400/70" />
              <p className="text-white text-sm font-medium">Stream resolution failed</p>
              <p className="text-gray-500 text-xs text-center max-w-xs">{megaplayError}</p>
              <div className="flex gap-2">
                <button onClick={resolveMegaplayUrl} className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-xs text-white hover:bg-white/[0.1] transition-all flex items-center gap-1.5">
                  <RefreshCw size={12} /> Retry
                </button>
                <button onClick={() => changeServer('vidsrc')} className="px-3 py-1.5 rounded-lg bg-primary-500/20 text-xs text-primary-300 hover:bg-primary-500/30 transition-all">
                  Try Server 3
                </button>
              </div>
            </div>
          )}

          {hasError && !megaplayLoading && !septorchLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a12] p-6">
              <AlertCircle size={36} className="text-gray-500" />
              <p className="text-white text-sm font-medium">Stream unavailable</p>
              <p className="text-gray-500 text-xs">Try a different server or reload.</p>
              <button onClick={reload} className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-xs text-white hover:bg-white/[0.1] transition-all flex items-center gap-1.5">
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {/* Native Video Player (Septorch) */}
          {isSeptorch && !septorchLoading && !septorchError && septorchVideoUrl && (
            <video
              ref={videoRef}
              key={septorchVideoUrl}
              src={septorchVideoUrl}
              controls
              autoPlay
              playsInline
              crossOrigin="anonymous"
              className="absolute inset-0 w-full h-full"
              style={{ background: '#000' }}
            >
              {subtitleTracks.map((track) => (
                <track
                  key={track.srclang}
                  kind="subtitles"
                  src={track.src}
                  srcLang={track.srclang}
                  label={track.label}
                  default={selectedSubtitle === track.srclang}
                />
              ))}
            </video>
          )}

          {/* AnimeHeaven Video */}
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

          {/* Iframe (embed servers) */}
          {!isSeptorch && !isAnimeHeaven && streamUrl && !hasError && !megaplayLoading && !megaplayError && (
            <iframe
              key={iframeKey}
              src={streamUrl}
              title={title || 'Player'}
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
        </div>

        {/* Controls Bar */}
        <div
          className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-b-2xl"
          style={{
            background: 'rgba(20, 20, 30, 0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderTop: 'none',
          }}
        >
          {/* Server Picker */}
          <div className="relative">
            <button
              onClick={() => setServerMenu(v => !v)}
              className="flex items-center gap-2 h-9 px-3 rounded-xl text-xs text-white font-medium transition-all"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <currentServer.icon size={13} style={{ color: currentServer.iconColor }} />
              <span>{currentServer.label}</span>
              <ChevronDown size={12} className={`text-gray-500 transition-transform ${serverMenu ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {serverMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setServerMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full mb-2 left-0 w-64 rounded-xl overflow-hidden z-50 shadow-2xl"
                    style={{
                      background: 'rgba(15, 15, 25, 0.98)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(24px)',
                    }}
                  >
                    <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                      Streaming Server
                    </p>
                    {visibleServers.map(sv => (
                      <button
                        key={sv.id}
                        onClick={() => changeServer(sv.id)}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 text-sm text-left transition-all ${
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
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-xs">{sv.label}</p>
                            {sv.animeOnly && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-pink-500/20 text-pink-300 font-bold">ANIME</span>
                            )}
                            {sv.directPlay && (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">MP4</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 truncate">{sv.description}</p>
                        </div>
                        {activeServer === sv.id && <Check size={13} className="text-primary-400 flex-shrink-0" />}
                      </button>
                    ))}

                    {/* Quality selection (Septorch) */}
                    {isSeptorch && septorchData?.streams && septorchData.streams.length > 0 && (
                      <div className="px-3 py-2 border-t border-white/[0.06]">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2">Quality</p>
                        <div className="flex flex-wrap gap-1.5">
                          {septorchData.streams.map((stream: SeptorchStream) => (
                            <button
                              key={stream.quality}
                              onClick={() => handleSeptorchQualityChange(stream.quality)}
                              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                                selectedQuality === stream.quality
                                  ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                                  : 'bg-white/[0.04] text-gray-500 border-white/[0.06] hover:text-gray-300'
                              }`}
                            >
                              {stream.quality}
                              <span className="text-[9px] text-gray-600 ml-1">({stream.size_mb}MB)</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Reload */}
          <button
            onClick={reload}
            disabled={megaplayLoading || septorchLoading}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs text-gray-400 hover:text-white transition-all disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RefreshCw size={13} className={megaplayLoading || septorchLoading ? 'animate-spin' : ''} />
          </button>

          {/* Subtitle Controls (Septorch only) */}
          {isSeptorch && (
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  onClick={() => setShowSubtitleMenu(v => !v)}
                  className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs transition-all border ${
                    selectedSubtitle !== 'off' && subtitlesReady
                      ? 'bg-primary-500/15 border-primary-500/25 text-primary-300'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  style={selectedSubtitle === 'off' || !subtitlesReady ? { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' } : {}}
                  title="Select subtitles"
                >
                  {selectedSubtitle === 'off' || !subtitlesReady ? <MessageSquareOff size={13} /> : <Subtitles size={13} />}
                  <span className="hidden sm:inline text-[11px]">
                    {selectedSubtitle === 'off' || !subtitlesReady
                      ? 'CC'
                      : subtitleTracks.find(t => t.srclang === selectedSubtitle)?.label || 'CC'
                    }
                  </span>
                  <ChevronDown size={11} className={`transition-transform ${showSubtitleMenu ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showSubtitleMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSubtitleMenu(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full mb-2 left-0 w-52 rounded-xl overflow-hidden z-50 shadow-2xl max-h-64 overflow-y-auto"
                        style={{
                          background: 'rgba(15, 15, 25, 0.98)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          backdropFilter: 'blur(24px)',
                        }}
                      >
                        <div className="flex items-center justify-between px-3 pt-3 pb-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Subtitles</p>
                          {subtitlesReady && subtitleTracks.length > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                              {subtitleTracks.length} track{subtitleTracks.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        {/* Off */}
                        <button
                          onClick={() => { setSelectedSubtitle('off'); setShowSubtitleMenu(false); }}
                          className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-all ${
                            selectedSubtitle === 'off'
                              ? 'bg-primary-500/15 text-white'
                              : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          <MessageSquareOff size={13} />
                          <span className="text-xs font-medium">Off</span>
                          {selectedSubtitle === 'off' && <Check size={12} className="text-primary-400 ml-auto" />}
                        </button>

                        {/* Available tracks */}
                        {subtitlesReady && subtitleTracks.length > 0 && (
                          <div className="border-t border-white/[0.06] pt-1">
                            <p className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-500">Available</p>
                            {subtitleTracks.map((track) => (
                              <button
                                key={track.srclang}
                                onClick={() => { setSelectedSubtitle(track.srclang); setShowSubtitleMenu(false); }}
                                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-all ${
                                  selectedSubtitle === track.srclang
                                    ? 'bg-primary-500/15 text-white'
                                    : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                                }`}
                              >
                                <Subtitles size={13} />
                                <span className="text-xs font-medium">{track.label}</span>
                                {selectedSubtitle === track.srclang && <Check size={12} className="text-primary-400 ml-auto" />}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* All languages */}
                        <div className="border-t border-white/[0.06] pt-1">
                          <p className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-500">All Languages</p>
                          <div className="max-h-36 overflow-y-auto">
                            {SUBTITLE_LANGUAGES.filter(l => l.code !== 'off').map((lang) => (
                              <button
                                key={lang.code}
                                onClick={() => { setSelectedSubtitle(lang.code); setShowSubtitleMenu(false); }}
                                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-all ${
                                  selectedSubtitle === lang.code
                                    ? 'bg-primary-500/15 text-white'
                                    : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                                }`}
                              >
                                <span className="text-[10px] font-mono text-gray-500 w-5 flex-shrink-0 uppercase">{lang.code}</span>
                                <span className="text-[11px]">{lang.name}</span>
                                {selectedSubtitle === lang.code && <Check size={11} className="text-primary-400 ml-auto" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Download (Septorch) */}
          {isSeptorch && septorchData?.streams && septorchData.streams.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowDownloadMenu(v => !v)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs text-emerald-400 hover:text-emerald-300 transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <Download size={13} />
                <span className="hidden sm:inline text-[11px]">Download</span>
                <ChevronDown size={11} className={`transition-transform ${showDownloadMenu ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showDownloadMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full mb-2 right-0 w-48 rounded-xl overflow-hidden z-50 shadow-2xl"
                      style={{
                        background: 'rgba(15, 15, 25, 0.98)',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">Select Quality</p>
                      {septorchData.streams.map((stream: SeptorchStream) => (
                        <button
                          key={stream.quality}
                          onClick={() => { handleSeptorchDownload(stream.quality); setShowDownloadMenu(false); }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all"
                        >
                          <Film size={12} className="text-emerald-400 flex-shrink-0" />
                          <span className="text-xs font-medium">{stream.quality}</span>
                          <span className="text-[10px] text-gray-500 ml-auto">{stream.size_mb}MB</span>
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Download (AnimeHeaven) */}
          {isAnimeHeaven && ahDownloadUrl && (
            <button
              onClick={handleAnimeHeavenDownload}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs text-gray-400 hover:text-white transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Download size={13} />
              <span className="hidden sm:inline text-[11px]">Download</span>
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Open in new tab */}
          {streamUrl && !isSeptorch && (
            <a
              href={streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs text-gray-500 hover:text-white transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <ExternalLink size={13} />
              <span className="hidden sm:inline text-[11px]">Open</span>
            </a>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(
    <AnimatePresence>{modalContent}</AnimatePresence>,
    document.body
  );
}
