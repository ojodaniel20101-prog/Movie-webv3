/*
  Zentrix VideoPlayer — v3.2
  ────────────────────────────────────────────────────────────────────
  CHANGES v3.2:
  ✅ Enhanced subtitle system matching cinverse
  ✅ CC button with subtitle selector dropdown (50+ languages)
  ✅ Subtitle Settings modal: Font Size, Text Color, Background
  ✅ Subtitle overlay synced with video via native <track> elements
  ✅ LocalStorage persistence for subtitle preferences
  ✅ Text shadow and fade animations for readability
  ✅ Mobile-responsive subtitle sizing
  ────────────────────────────────────────────────────────────────────
  CHANGES v3.1:
  ✅ Replaced MovieBox with Septorch API for direct MP4 streaming
  ✅ Removed dash.js dependency — uses native HTML5 video
  ✅ Direct streaming via Septorch proxy URLs (no CORS issues)
  ✅ Download with quality selection via Septorch proxy-download
  ✅ Simplified quality switching (just swaps video src)
  ────────────────────────────────────────────────────────────────────
  CHANGES v3:
  ✅ Fixed VidSrc: vidsrc.wiki now primary (vidsrc.pro dead → redirected to ads)
  ✅ Added MovieBox DASH streaming server
  ✅ Added download functionality with quality selection
  ✅ Server 5 now uses vidsrc.wiki mirror
*/

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Globe, ChevronDown,
  AlertCircle, RefreshCw, ExternalLink, Shield, Check, Loader2,
  Mic, Link2, Zap, Clapperboard, Download, Film, HardDrive,
  Subtitles, MessageSquareOff, Settings, Type, Palette, RectangleHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { ContentType } from '@/types';
import AdBlockGuideModal from '@/components/adblock/AdBlockGuideModal';
import {
  loadSubtitleSettings,
  saveSubtitleSettings,
  applySubtitleStyles,
  type SubtitleStyleSettings,
  type SubtitleFontSize,
  type SubtitleTextColor,
  type SubtitleBackground,
  getFontSizeLabel,
  getBackgroundLabel,
  SUBTITLE_LANGUAGES,
  getLanguageName,
} from '@/services/subtitles';

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

type ServerKey  = 'megaplay' | 'megaplay-dub' | 'vidsrc' | 'vidlink' | 'vidsrc2' | 'septorch' | 'animeheaven';

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

// ─── Server definitions ─────────────────────────────────────────────

const ALL_SERVERS: ServerDef[] = [
  { id: 'animeheaven', label: 'Server 1', icon: Mic,          iconColor: '#F472B6', description: 'Direct MP4', animeOnly: true },
  { id: 'megaplay',     label: 'Server 2', icon: Globe,        iconColor: '#22D3EE', description: 'Sub audio · Verified',  animeOnly: true },
  { id: 'vidsrc',       label: 'Server 3', icon: Clapperboard, iconColor: '#7B6FF0', description: 'Primary · Reliable'                     },
  { id: 'vidlink',      label: 'Server 4', icon: Link2,        iconColor: '#2DD4BF', description: 'Fast · Recommended',  adNote: true        },
  { id: 'vidsrc2',      label: 'Server 5', icon: Zap,          iconColor: '#FCD34D', description: 'VidSrc Mirror · HD'                     },
  { id: 'septorch',     label: 'Server 6', icon: HardDrive,    iconColor: '#FB7185', description: 'Direct MP4 Stream', directPlay: true },
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
      if (type === 'movie') return `https://vidsrc.wiki/embed/movie/${tmdbId}?server=bx`;
      if (type === 'anime' && anilistId) return `https://vidsrc.wiki/embed/tv/${anilistId}/${s}/${e}?server=bx`;
      return `https://vidsrc.wiki/embed/tv/${tmdbId}/${s}/${e}?server=bx`;

    default:
      return '';
  }
}

// ─── Subtitle Settings Modal Component ──────────────────────────────

interface SubtitleSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SubtitleSettingsModal({ isOpen, onClose }: SubtitleSettingsModalProps) {
  const [settings, setSettings] = useState<SubtitleStyleSettings>(loadSubtitleSettings);

  const updateSetting = <K extends keyof SubtitleStyleSettings>(
    key: K,
    value: SubtitleStyleSettings[K]
  ) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSubtitleSettings(next);
    applySubtitleStyles(next);
  };

  const fontSizes: SubtitleFontSize[] = ['small', 'medium', 'large', 'xl'];
  const textColors: { value: SubtitleTextColor; label: string; color: string }[] = [
    { value: 'white', label: 'White', color: '#FFFFFF' },
    { value: 'yellow', label: 'Yellow', color: '#FFD060' },
  ];
  const backgrounds: SubtitleBackground[] = ['none', 'semi', 'full'];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-[101] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'rgba(10,10,22,0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(40px)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-500/15 flex items-center justify-center">
                  <Settings size={15} className="text-primary-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Subtitle Settings</h3>
                  <p className="text-[11px] text-gray-500">Customize subtitle appearance</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/[0.1] transition-all"
              >
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>

            <div className="px-5 pb-5 space-y-5">
              {/* Font Size */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Type size={13} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-300">Font Size</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {fontSizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => updateSetting('fontSize', size)}
                      className={`px-2 py-2 rounded-xl text-xs font-semibold transition-all border ${
                        settings.fontSize === size
                          ? 'bg-primary-500/20 text-primary-300 border-primary-500/30'
                          : 'bg-white/[0.04] text-gray-500 border-white/[0.06] hover:text-gray-300 hover:bg-white/[0.07]'
                      }`}
                    >
                      {getFontSizeLabel(size)}
                    </button>
                  ))}
                </div>
                {/* Preview */}
                <div className="mt-2.5 p-3 rounded-xl bg-black/50 border border-white/[0.04] text-center">
                  <span
                    className="subtitle-preview-text inline-block"
                    data-font-size={settings.fontSize}
                    data-text-color={settings.textColor}
                    data-background={settings.background}
                    style={{
                      fontSize: settings.fontSize === 'small' ? '14px' : settings.fontSize === 'medium' ? '18px' : settings.fontSize === 'large' ? '22px' : '26px',
                      color: settings.textColor === 'white' ? '#FFFFFF' : '#FFD060',
                      background: settings.background === 'none' ? 'transparent' : settings.background === 'semi' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.85)',
                      padding: settings.background === 'none' ? '0' : '4px 12px',
                      borderRadius: '6px',
                      textShadow: settings.background === 'none' ? '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)' : 'none',
                    }}
                  >
                    Preview subtitle text
                  </span>
                </div>
              </div>

              {/* Text Color */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Palette size={13} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-300">Text Color</span>
                </div>
                <div className="flex gap-2">
                  {textColors.map((tc) => (
                    <button
                      key={tc.value}
                      onClick={() => updateSetting('textColor', tc.value)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                        settings.textColor === tc.value
                          ? 'bg-primary-500/20 text-primary-300 border-primary-500/30'
                          : 'bg-white/[0.04] text-gray-500 border-white/[0.06] hover:text-gray-300 hover:bg-white/[0.07]'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20"
                        style={{ background: tc.color }}
                      />
                      {tc.label}
                      {settings.textColor === tc.value && <Check size={12} className="text-primary-400" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <RectangleHorizontal size={13} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-300">Background</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {backgrounds.map((bg) => (
                    <button
                      key={bg}
                      onClick={() => updateSetting('background', bg)}
                      className={`px-2 py-2 rounded-xl text-xs font-semibold transition-all border ${
                        settings.background === bg
                          ? 'bg-primary-500/20 text-primary-300 border-primary-500/30'
                          : 'bg-white/[0.04] text-gray-500 border-white/[0.06] hover:text-gray-300 hover:bg-white/[0.07]'
                      }`}
                    >
                      {getBackgroundLabel(bg)}
                      {settings.background === bg && (
                        <Check size={11} className="inline-block ml-1 text-primary-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset */}
              <button
                onClick={() => {
                  const defaults: SubtitleStyleSettings = {
                    fontSize: 'medium',
                    textColor: 'white',
                    background: 'semi',
                    enabled: true,
                  };
                  setSettings(defaults);
                  saveSubtitleSettings(defaults);
                  applySubtitleStyles(defaults);
                }}
                className="w-full py-2.5 rounded-xl text-xs font-medium text-gray-500 hover:text-gray-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-all"
              >
                Reset to Defaults
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
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

  // Default server: anime → AnimeHeaven, movies/TV → Septorch (direct MP4)
  const [activeServer, setActiveServer] = useState<ServerKey>(
    isAnime ? 'animeheaven' : 'septorch'
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
  const isSeptorch    = activeServer === 'septorch';
  const megaplayLang: 'sub' | 'dub' = activeServer === 'megaplay-dub' ? 'dub' : 'sub';

  // ── Septorch async resolution state ──────────────────────────────
  const [septorchData,     setSeptorchData]     = useState<SeptorchResponse | null>(null);
  const [septorchLoading,  setSeptorchLoading]  = useState(false);
  const [septorchError,    setSeptorchError]    = useState<string | null>(null);
  const [septorchVideoUrl, setSeptorchVideoUrl] = useState<string | null>(null);
  const [selectedQuality,  setSelectedQuality]  = useState<string>('720p');

  // ── Subtitle state ───────────────────────────────────────────────
  const [subtitleTracks,      setSubtitleTracks]      = useState<{ label: string; srclang: string; src: string }[]>([]);
  const [selectedSubtitle,    setSelectedSubtitle]    = useState<string>('off');
  const [showSubtitleMenu,    setShowSubtitleMenu]    = useState(false);
  const [subtitlesReady,      setSubtitlesReady]      = useState(false);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);

  // ── AnimeHeaven state ────────────────────────────────────────────
  const [ahUrl,         setAhUrl]         = useState<string | null>(null);
  const [ahDownloadUrl, setAhDownloadUrl] = useState<string | null>(null);
  const [ahAnimeId,     setAhAnimeId]     = useState<string | null>(null);
  const [ahEpId,        setAhEpId]        = useState<string | null>(null);
  const [ahLoading,     setAhLoading]     = useState(false);
  const [ahError,       setAhError]       = useState<string | null>(null);

  // ── Download state ───────────────────────────────────────────────
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // ── Video ref for direct play servers ────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ── Initialize subtitle styles on mount ──────────────────────────
  useEffect(() => {
    applySubtitleStyles(loadSubtitleSettings());
  }, []);

  // ── VidLink postMessage event listener ───────────────────────────
  useEffect(() => {
    if (!isVidlink) return;
    const handleVidlinkEvent = (event: MessageEvent) => {
      if (event.origin !== 'https://vidlink.pro') return;
      if (event.data?.type !== 'PLAYER_EVENT') return;
      const { event: evtName, currentTime, duration } = event.data.data ?? {};
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

    try {
      // Step 1: Search for the movie by title
      const searchRes = await fetch(
        `/api/septorch/search?q=${encodeURIComponent(title)}`,
        { signal: abortRef.current.signal }
      );
      if (!searchRes.ok) throw new Error(`Search failed: HTTP ${searchRes.status}`);
      const searchData = await searchRes.json();

      if (!searchData.success || !searchData.results?.length) {
        throw new Error('No results found for this title');
      }

      // Find best match (prefer movies for movie type, tv for tv type)
      const expectedType = type === 'movie' ? 1 : 2;
      let match = searchData.results.find((r: any) =>
        r.subject_type === expectedType
      ) || searchData.results[0];

      const movieId = match.id;
      const detailPath = match.detail_path;

      if (!movieId || !detailPath) {
        throw new Error('Invalid search result: missing id or detailPath');
      }

      // Step 2: Get streams (pass season/episode for TV shows)
      const isTvShow = type === 'tv';
      const streamsRes = await fetch(
        `/api/septorch/streams?id=${movieId}&detailPath=${encodeURIComponent(detailPath)}${isTvShow ? `&season=${season || 1}&episode=${episode || 1}` : ''}`,
        { signal: abortRef.current.signal }
      );
      if (!streamsRes.ok) throw new Error(`Streams failed: HTTP ${streamsRes.status}`);
      const streamsData: SeptorchResponse = await streamsRes.json();

      if (!streamsData.success || !streamsData.streams?.length) {
        throw new Error('No streams available for this title');
      }

      setSeptorchData(streamsData);

      // Auto-select best quality (prefer 720p, then 1080p, then best available)
      const streams = streamsData.streams;
      const preferred = streams.find((s: SeptorchStream) => s.quality === '720p')
        || streams.find((s: SeptorchStream) => s.quality === '1080p')
        || streams[0];

      setSelectedQuality(preferred.quality);
      setSeptorchVideoUrl(preferred.stream_url);

      // Process subtitles - proxy them through backend to avoid CORS
      if (streamsData.subtitles && streamsData.subtitles.length > 0) {
        const tracks = streamsData.subtitles
          .filter((sub: any) => sub.url && sub.language)
          .map((sub: any) => ({
            label: sub.language_name || sub.language,
            srclang: sub.language,
            src: `/api/septorch/subtitle?url=${encodeURIComponent(sub.url)}`,
          }));
        setSubtitleTracks(tracks);
        // Auto-select English subtitle if available, otherwise first subtitle
        const engTrack = tracks.find(t => t.srclang.toLowerCase().startsWith('en'));
        setSelectedSubtitle(engTrack ? engTrack.srclang : tracks[0]?.srclang || 'off');
        setSubtitlesReady(true);
      } else {
        setSubtitleTracks([]);
        setSelectedSubtitle('off');
        setSubtitlesReady(false);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[VideoPlayer] Septorch resolution failed:', err);
      setSeptorchError(err.message || 'Could not resolve stream. Try another server.');
    } finally {
      setSeptorchLoading(false);
    }
  }, [isSeptorch, title, type, season, episode]);

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

  // ── Septorch download handler ────────────────────────────────────
  const handleSeptorchDownload = useCallback((quality: string) => {
    if (!septorchData?.streams?.length) return;

    const stream = septorchData.streams.find((s: SeptorchStream) => s.quality === quality)
      || septorchData.streams[0];

    if (!stream?.download_url) return;

    // Open the proxy-download URL in a new tab (triggers download)
    window.open(stream.download_url, '_blank');
  }, [septorchData]);

  // ── Septorch quality change ──────────────────────────────────────
  const handleSeptorchQualityChange = useCallback((quality: string) => {
    setSelectedQuality(quality);

    if (septorchData?.streams) {
      const stream = septorchData.streams.find((s: SeptorchStream) => s.quality === quality);
      if (stream && stream.stream_url !== septorchVideoUrl) {
        setSeptorchVideoUrl(stream.stream_url);
      }
    }
  }, [septorchData, septorchVideoUrl]);

  // ── Subtitle track switching effect ──────────────────────────────
  useEffect(() => {
    if (!videoRef.current || !isSeptorch) return;
    const video = videoRef.current;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = tracks[i].language === selectedSubtitle ? 'showing' : 'hidden';
    }
  }, [selectedSubtitle, isSeptorch, septorchVideoUrl]);

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

  // Filter menu: hide anime-only servers for movies/TV
  const visibleServers = isAnime
    ? ALL_SERVERS
    : ALL_SERVERS.filter(s => !s.animeOnly);

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

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-3">

      {/* ══ SUBTITLE SETTINGS MODAL ═════════════════════════════ */}
      <SubtitleSettingsModal
        isOpen={showSubtitleSettings}
        onClose={() => setShowSubtitleSettings(false)}
      />

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
                              MP4
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
                      Server 6: Septorch direct MP4 stream with download support
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
          disabled={megaplayLoading || septorchLoading}
          className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-zx-s3 border border-white/[0.08] text-xs text-gray-500 hover:text-white hover:border-white/15 transition-all disabled:opacity-40"
          whileTap={{ scale: 0.95 }}
        >
          <RefreshCw size={14} className={megaplayLoading || septorchLoading ? 'animate-spin' : ''} />
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

        {/* Download button with quality selector (Septorch) */}
        {isSeptorch && septorchData?.streams && septorchData.streams.length > 0 && (
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
                    className="absolute top-full mt-2 left-0 w-52 rounded-xl overflow-hidden z-50 shadow-2xl"
                    style={{
                      background: 'rgba(10,10,22,0.98)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(24px)',
                    }}
                  >
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                      Select Quality
                    </p>
                    {septorchData.streams.map((stream: SeptorchStream) => (
                      <button
                        key={stream.quality}
                        onClick={() => { handleSeptorchDownload(stream.quality); setShowDownloadMenu(false); }}
                        className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left text-gray-300 hover:bg-white/[0.06] hover:text-white transition-all"
                      >
                        <Film size={12} className="text-emerald-400 flex-shrink-0" />
                        <span className="font-medium">{stream.quality}</span>
                        <span className="text-[10px] text-gray-500 ml-1">
                          {stream.size_mb} MB
                        </span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Subtitle Controls Group */}
        {isSeptorch && (
          <div className="flex items-center gap-1.5">
            {/* CC / Subtitle selector */}
            <div className="relative">
              <motion.button
                onClick={() => setShowSubtitleMenu(v => !v)}
                className={`flex items-center gap-1.5 h-10 px-3 rounded-xl border text-xs transition-all ${
                  selectedSubtitle !== 'off' && subtitlesReady
                    ? 'bg-primary-500/15 border-primary-500/25 text-primary-300'
                    : 'bg-zx-s3 border-white/[0.08] text-gray-400 hover:text-white hover:border-white/15'
                }`}
                whileTap={{ scale: 0.95 }}
                title="Select subtitles"
              >
                {selectedSubtitle === 'off' || !subtitlesReady ? <MessageSquareOff size={14} /> : <Subtitles size={14} />}
                <span className="hidden sm:inline">
                  {selectedSubtitle === 'off' || !subtitlesReady
                    ? 'Subtitles'
                    : subtitleTracks.find(t => t.srclang === selectedSubtitle)?.label || 'Subtitles'
                  }
                </span>
                <ChevronDown size={11} className={`transition-transform ${showSubtitleMenu ? 'rotate-180' : ''}`} />
              </motion.button>

              <AnimatePresence>
                {showSubtitleMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSubtitleMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full mt-2 left-0 w-56 rounded-xl overflow-hidden z-50 shadow-2xl max-h-72 overflow-y-auto"
                      style={{
                        background: 'rgba(10,10,22,0.98)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        backdropFilter: 'blur(24px)',
                      }}
                    >
                      <div className="flex items-center justify-between px-3 pt-3 pb-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                          Subtitles
                        </p>
                        {subtitlesReady && subtitleTracks.length > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                            {subtitleTracks.length} track{subtitleTracks.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Off option */}
                      <button
                        onClick={() => { setSelectedSubtitle('off'); setShowSubtitleMenu(false); }}
                        className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left transition-all ${
                          selectedSubtitle === 'off'
                            ? 'bg-primary-500/15 text-white'
                            : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <MessageSquareOff size={13} className="flex-shrink-0" />
                        <span className="font-medium">Off</span>
                        {selectedSubtitle === 'off' && <Check size={13} className="text-primary-400 ml-auto flex-shrink-0" />}
                      </button>

                      {/* Available subtitle tracks from stream */}
                      {subtitlesReady && subtitleTracks.length > 0 && (
                        <div className="border-t border-white/[0.06] pt-1">
                          <p className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
                            Available
                          </p>
                          {subtitleTracks.map((track) => (
                            <button
                              key={track.srclang}
                              onClick={() => { setSelectedSubtitle(track.srclang); setShowSubtitleMenu(false); }}
                              className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left transition-all ${
                                selectedSubtitle === track.srclang
                                  ? 'bg-primary-500/15 text-white'
                                  : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                              }`}
                            >
                              <Subtitles size={13} className="flex-shrink-0" />
                              <span className="font-medium">{track.label}</span>
                              {selectedSubtitle === track.srclang && <Check size={13} className="text-primary-400 ml-auto flex-shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* All language options (for manual selection) */}
                      <div className="border-t border-white/[0.06] pt-1">
                        <p className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
                          All Languages
                        </p>
                        <div className="max-h-40 overflow-y-auto">
                          {SUBTITLE_LANGUAGES.filter(l => l.code !== 'off').map((lang) => (
                            <button
                              key={lang.code}
                              onClick={() => { setSelectedSubtitle(lang.code); setShowSubtitleMenu(false); }}
                              className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-all ${
                                selectedSubtitle === lang.code
                                  ? 'bg-primary-500/15 text-white'
                                  : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                              }`}
                            >
                              <span className="text-[10px] font-mono text-gray-500 w-6 flex-shrink-0 uppercase">
                                {lang.code}
                              </span>
                              <span className="font-medium text-xs">{lang.name}</span>
                              {selectedSubtitle === lang.code && <Check size={13} className="text-primary-400 ml-auto flex-shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Subtitle Settings button */}
            <motion.button
              onClick={() => setShowSubtitleSettings(true)}
              className="flex items-center justify-center h-10 w-10 rounded-xl bg-zx-s3 border border-white/[0.08] text-gray-400 hover:text-white hover:border-white/15 transition-all"
              whileTap={{ scale: 0.95 }}
              title="Subtitle settings"
            >
              <Settings size={14} />
            </motion.button>
          </div>
        )}

        {/* Open in new tab (iframe servers only) */}
        {streamUrl && !isSeptorch && (
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
                <p className="text-white font-semibold text-sm">Fetching from server…</p>
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

          {/* ── Septorch loading ── */}
          {isSeptorch && septorchLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zx-s2">
              <Loader2 size={40} className="text-emerald-400 animate-spin" />
              <div className="text-center">
                <p className="text-white font-semibold text-sm">Fetching from server…</p>
                <p className="text-gray-500 text-xs mt-1">
                  {title ? `Searching: "${title}"` : 'Resolving streams…'}
                </p>
              </div>
            </div>
          )}

          {/* ── Septorch error ── */}
          {isSeptorch && !septorchLoading && septorchError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zx-s2 p-6">
              <AlertCircle size={44} className="text-red-500/70" />
              <div className="text-center">
                <p className="text-white font-semibold">Septorch failed</p>
                <p className="text-gray-500 text-sm mt-1 max-w-xs leading-relaxed">
                  {septorchError}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <button onClick={() => resolveSeptorchUrl()} className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5">
                  <RefreshCw size={13} /> Retry
                </button>
                <button onClick={() => changeServer('vidsrc')} className="btn-primary text-sm py-2 px-4">
                  Try Server 3
                </button>
              </div>
            </div>
          )}

          {/* ── Generic iframe error ── */}
          {hasError && !megaplayLoading && !septorchLoading && (
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

          {/* ── Septorch native video player with styled subtitles ── */}
          {isSeptorch && !septorchLoading && !septorchError && septorchVideoUrl && (
            <video
              ref={videoRef}
              key={septorchVideoUrl}
              src={septorchVideoUrl}
              controls
              autoPlay
              playsInline
              crossOrigin="anonymous"
              className="absolute inset-0 w-full h-full zentrix-video-player"
              style={{ background: '#000' }}
            >
              {/* Subtitle tracks */}
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

          {/* ── Iframe (for embed-based servers) ── */}
          {!isSeptorch && !isAnimeHeaven && streamUrl && !hasError && !megaplayLoading && !megaplayError && (
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
          {!megaplayLoading && !septorchLoading && (
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
              {isSeptorch && septorchData && (
                <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">
                  MP4
                </span>
              )}
              {/* Subtitle indicator */}
              {isSeptorch && selectedSubtitle !== 'off' && subtitlesReady && (
                <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-primary-500/20 text-primary-300 flex items-center gap-0.5">
                  <Subtitles size={8} />
                  {subtitleTracks.find(t => t.srclang === selectedSubtitle)?.label || selectedSubtitle}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ Septorch quality selector ═════════════════════════════ */}
      {isSeptorch && septorchData?.streams && septorchData.streams.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15">
          <HardDrive size={14} className="text-emerald-400 flex-shrink-0" />
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-emerald-400/80 font-medium">Quality:</span>
            {septorchData.streams.map((stream: SeptorchStream) => (
              <button
                key={stream.quality}
                onClick={() => handleSeptorchQualityChange(stream.quality)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  selectedQuality === stream.quality
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                    : 'bg-white/[0.04] text-gray-500 border border-white/[0.06] hover:text-gray-300'
                }`}
              >
                {stream.quality}
                <span className="text-[9px] text-gray-600 ml-1">({stream.size_mb}MB)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ MegaPlay info banner ════════════════════════════════ */}
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

      {/* ═─ Ad-blocker nudge ── */}
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
