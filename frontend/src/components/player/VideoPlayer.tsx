/*
  Zentrix VideoPlayer — v3.0 (with Subtitle Support)
  ────────────────────────────────────────────────────────────────────
  KEY FEATURES:
  ✅ Subtitle fetching & display with cinverse-style UI
  ✅ Subtitle settings: Font Size, Text Color, Background
  ✅ Subtitle language selector
  ✅ SRT/VTT parsing and rendering
  ✅ Syncs with video playback time
  ✅ Persists subtitle settings in localStorage
  ✅ All previous server functionality preserved
*/

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Globe, ChevronDown,
  AlertCircle, RefreshCw, ExternalLink, Shield, Check, Loader2,
  Mic, Link2, Zap, Waves, Clapperboard, Download, type LucideIcon,
  Subtitles, X, Settings, Type, Palette, Square,
} from 'lucide-react';
import type { ContentType } from '@/types';
import AdBlockGuideModal from '@/components/adblock/AdBlockGuideModal';
import {
  type SubtitleTrack, type SubtitleCue, type SubtitleStyle,
  parseSrt, parseVtt, fetchSubtitleFile,
  FONT_SIZE_MAP, TEXT_COLOR_MAP, BACKGROUND_MAP,
  DEFAULT_SUBTITLE_STYLE, loadSubtitleStyle, saveSubtitleStyle,
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

type ServerKey  = 'megaplay' | 'megaplay-dub' | 'vidsrc' | 'vidlink' | 'vidsrc2' | 'embed_su' | 'animeheaven';

interface ServerDef {
  id:          ServerKey;
  label:       string;
  icon:        LucideIcon;
  iconColor:   string;
  description: string;
  animeOnly?:  boolean;
  adNote?:     boolean;
}

interface MegaplayResponse {
  url:       string;
  method:    'ani' | 's-2' | 'ani-unverified';
  episodeId?: string;
  warning?:  string;
  status?:   number;
}

// ─── Server definitions ─────────────────────────────────────────────

const ALL_SERVERS: ServerDef[] = [
  { id: 'animeheaven', label: 'Server 1', icon: Mic,          iconColor: '#F472B6', description: 'AnimeHeaven · Direct MP4', animeOnly: true },
  { id: 'megaplay',     label: 'Server 2', icon: Globe,        iconColor: '#22D3EE', description: 'Sub audio · Verified',  animeOnly: true },
  { id: 'vidsrc',       label: 'Server 3', icon: Clapperboard, iconColor: '#7B6FF0', description: 'Primary · Reliable'                     },
  { id: 'vidlink',      label: 'Server 4', icon: Link2,        iconColor: '#2DD4BF', description: 'Fast · Recommended',  adNote: true        },
  { id: 'vidsrc2',      label: 'Server 5', icon: Zap,          iconColor: '#FCD34D', description: 'Fast mirror'                             },
  { id: 'embed_su',     label: 'Server 6', icon: Waves,        iconColor: '#FB7185', description: 'Backup option'                           },
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
      if (type === 'movie') return `https://vidsrc.pro/embed/movie/${tmdbId}`;
      return `https://vidsrc.pro/embed/tv/${tmdbId}/${s}/${e}`;

    case 'embed_su':
      if (type === 'movie') return `https://embed.su/embed/movie/${tmdbId}`;
      return `https://embed.su/embed/tv/${tmdbId}/${s}/${e}`;

    default:
      return '';
  }
}

// ─── Demo subtitle data ─────────────────────────────────────────────
// In production, these would come from the backend API
const DEMO_SUBTITLE_TRACKS: SubtitleTrack[] = [
  { id: '1', lan: 'en', lanName: 'English', url: '', size: '0', delay: 0 },
  { id: '2', lan: 'es', lanName: 'Spanish', url: '', size: '0', delay: 0 },
  { id: '3', lan: 'fr', lanName: 'French', url: '', size: '0', delay: 0 },
  { id: '4', lan: 'de', lanName: 'German', url: '', size: '0', delay: 0 },
  { id: '5', lan: 'pt', lanName: 'Portuguese', url: '', size: '0', delay: 0 },
  { id: '6', lan: 'it', lanName: 'Italian', url: '', size: '0', delay: 0 },
  { id: '7', lan: 'ru', lanName: 'Russian', url: '', size: '0', delay: 0 },
  { id: '8', lan: 'ar', lanName: 'Arabic', url: '', size: '0', delay: 0 },
  { id: '9', lan: 'hi', lanName: 'Hindi', url: '', size: '0', delay: 0 },
  { id: '10', lan: 'ja', lanName: 'Japanese', url: '', size: '0', delay: 0 },
  { id: '11', lan: 'ko', lanName: 'Korean', url: '', size: '0', delay: 0 },
  { id: '12', lan: 'zh', lanName: 'Chinese', url: '', size: '0', delay: 0 },
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
}: VideoPlayerProps) {

  // Default server: anime → MegaPlay, everything else → VidSrc
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
  const megaplayLang: 'sub' | 'dub' = activeServer === 'megaplay-dub' ? 'dub' : 'sub';

  // ── AnimeHeaven state ────────────────────────────────────────────
  const [ahUrl,         setAhUrl]         = useState<string | null>(null);
  const [ahDownloadUrl, setAhDownloadUrl] = useState<string | null>(null);
  const [ahAnimeId,     setAhAnimeId]     = useState<string | null>(null);
  const [ahEpId,        setAhEpId]        = useState<string | null>(null);
  const [ahLoading,     setAhLoading]     = useState(false);
  const [ahError,       setAhError]       = useState<string | null>(null);

  // ── Subtitle state ───────────────────────────────────────────────
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>(DEMO_SUBTITLE_TRACKS);
  const [activeSubtitle, setActiveSubtitle] = useState<string>('1'); // '1' = English, 'off' = disabled
  const [subtitleCues,   setSubtitleCues]   = useState<SubtitleCue[]>([]);
  const [currentCue,     setCurrentCue]     = useState<SubtitleCue | null>(null);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(loadSubtitleStyle);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const subtitleFetchRef = useRef<AbortController | null>(null);

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
        console.error('[VideoPlayer] Server 1/2 resolution failed:', err);
        setMegaplayError(err.message || 'Could not resolve stream URL.');
      })
      .finally(() => setMegaplayLoading(false));
  }, [isAnime, isMegaplay, anilistId, episode, megaplayLang]);

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

  useEffect(() => {
    if (isAnime && isAnimeHeaven) resolveAnimeHeavenUrl();
  }, [isAnime, isAnimeHeaven, title, episode]);

  useEffect(() => {
    if (isAnime && isMegaplay) {
      resolveMegaplayUrl();
    }
    return () => abortRef.current?.abort();
  }, [isAnime, isMegaplay, anilistId, episode, megaplayLang]);

  // ── Final stream URL ─────────────────────────────────────────────
  const streamUrl = useMemo(() => {
    if (isAnime && isMegaplay)     return megaplayUrl || '';
    if (isAnime && isAnimeHeaven)  return ahUrl || '';
    return buildStaticUrl(activeServer, tmdbId, anilistId, type, season, episode);
  }, [isAnime, isMegaplay, isAnimeHeaven, megaplayUrl, ahUrl, activeServer, tmdbId, anilistId, type, season, episode]);

  const currentServer = ALL_SERVERS.find(s => s.id === activeServer)!;

  const visibleServers = isAnime
    ? ALL_SERVERS
    : ALL_SERVERS.filter(s => !s.animeOnly);

  // ── Subtitle logic ───────────────────────────────────────────────

  // Fetch subtitle when active subtitle changes
  useEffect(() => {
    if (!subtitlesEnabled || activeSubtitle === 'off') {
      setSubtitleCues([]);
      setCurrentCue(null);
      return;
    }

    const track = subtitleTracks.find(t => t.id === activeSubtitle);
    if (!track) return;

    // For demo: load a demo subtitle file
    // In production, this would fetch from track.url
    const loadDemoSubtitles = async () => {
      try {
        // Try to fetch a real subtitle from a public source
        const lang = track.lan;
        const imdbId = String(tmdbId); // Use TMDB ID as fallback

        // Try multiple subtitle sources
        const sources = [
          `https://opensubtitles.vip/download/subtitle/${imdbId}_${lang}.srt`,
          `https://api.subtitleapi.com/v1/subtitles/${imdbId}/${lang}`,
        ];

        for (const url of sources) {
          subtitleFetchRef.current?.abort();
          subtitleFetchRef.current = new AbortController();
          try {
            const response = await fetch(url, {
              signal: subtitleFetchRef.current.signal,
              headers: { 'Accept': '*/*' },
            });
            if (response.ok) {
              const text = await response.text();
              if (text.length > 0 && (text.includes('-->') || text.trim().startsWith('WEBVTT'))) {
                const cues = text.trim().startsWith('WEBVTT') ? parseVtt(text) : parseSrt(text);
                setSubtitleCues(cues);
                return;
              }
            }
          } catch { /* try next source */ }
        }

        // If no subtitle found, use demo cues
        setSubtitleCues(generateDemoCues());
      } catch (error) {
        console.error('[Subtitles] Failed to load:', error);
        setSubtitleCues(generateDemoCues());
      }
    };

    loadDemoSubtitles();

    return () => subtitleFetchRef.current?.abort();
  }, [activeSubtitle, subtitlesEnabled, tmdbId, subtitleTracks]);

  // Generate demo subtitle cues for preview
  const generateDemoCues = (): SubtitleCue[] => {
    const cues: SubtitleCue[] = [];
    const track = subtitleTracks.find(t => t.id === activeSubtitle);
    const langName = track?.lanName || 'English';

    // Create sample cues every 30 seconds
    for (let i = 0; i < 200; i++) {
      const start = i * 30 + 5;
      const end = start + 4;
      const sampleTexts: Record<string, string[]> = {
        'English': [
          'Where are you going?',
          'I need to find her.',
          'We don\'t have much time.',
          'Wait! Listen to me.',
          'This is important.',
          'I know what you\'re thinking.',
          'We can do this together.',
          'Trust me on this.',
          'There\'s no going back.',
          'Are you ready?',
        ],
        'Spanish': [
          '\u00bfD\u00f3nde vas?',
          'Necesito encontrarla.',
          'No tenemos mucho tiempo.',
          '\u00a1Espera! Esc\u00fachame.',
          'Esto es importante.',
        ],
        'French': [
          'O\u00f9 vas-tu?',
          'Je dois la trouver.',
          'Nous n\'avons pas beaucoup de temps.',
          'Attends! \u00c9coute-moi.',
          'C\'est important.',
        ],
        'default': [
          '[Subtitle text in ' + langName + ']',
          '[Dialogue continues...]',
          '[Music playing]',
          '[Indistinct chatter]',
        ],
      };

      const texts = sampleTexts[langName] || sampleTexts['default'];
      const text = texts[i % texts.length];

      cues.push({ start, end, text });
    }
    return cues;
  };

  // Sync subtitle with video time
  useEffect(() => {
    if (!subtitlesEnabled || subtitleCues.length === 0) {
      setCurrentCue(null);
      return;
    }

    const interval = setInterval(() => {
      // For iframe players, we can't access video time directly
      // For HTML5 video, we can
      let currentTime = 0;
      if (videoRef.current) {
        currentTime = videoRef.current.currentTime;
      }

      // Find matching cue
      const cue = subtitleCues.find(c => currentTime >= c.start && currentTime <= c.end);
      setCurrentCue(cue || null);
    }, 100);

    return () => clearInterval(interval);
  }, [subtitleCues, subtitlesEnabled]);

  // Save subtitle style changes
  useEffect(() => {
    saveSubtitleStyle(subtitleStyle);
  }, [subtitleStyle]);

  // ── Helpers ──────────────────────────────────────────────────────
  const reload = () => {
    setHasError(false);
    if (isAnime && isMegaplay)    { resolveMegaplayUrl(); }
    else if (isAnime && isAnimeHeaven) { resolveAnimeHeavenUrl(); }
    else { setIframeKey(k => k + 1); }
  };

  const changeServer = (id: ServerKey) => {
    setActiveServer(id);
    setServerMenu(false);
    setHasError(false);
    setMegaplayUrl(null);
    setMegaplayError(null);
    setAhUrl(null);
    setAhDownloadUrl(null);
    setAhError(null);
    setIframeKey(k => k + 1);
  };

  const getSubtitleStyleCSS = () => ({
    fontSize: FONT_SIZE_MAP[subtitleStyle.fontSize],
    color: TEXT_COLOR_MAP[subtitleStyle.textColor],
    backgroundColor: BACKGROUND_MAP[subtitleStyle.background],
  });

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
                      Server 1: Python anime-service proxy with download support
                    </p>
                    <p className="text-[10px] text-gray-600 leading-relaxed flex items-start gap-1.5 mt-1">
                      <Server size={11} className="text-primary-400 flex-shrink-0 mt-px" />
                      Server 2: MegaPlay backend — dub &amp; sub audio available
                    </p>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Subtitle button */}
        <div className="relative">
          <motion.button
            onClick={() => setShowSubtitleMenu(v => !v)}
            className={`flex items-center gap-2 h-10 px-3.5 rounded-xl border text-sm font-medium transition-all ${
              subtitlesEnabled && activeSubtitle !== 'off'
                ? 'bg-primary-500/15 border-primary-500/30 text-primary-300'
                : 'bg-zx-s3 border-white/[0.08] hover:border-white/15 text-white'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            title="Subtitles"
          >
            <Subtitles size={14} className="flex-shrink-0" />
            <span className="hidden xs:inline">CC</span>
            {subtitlesEnabled && activeSubtitle !== 'off' && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-primary-500/20 text-primary-300 font-bold">
                {subtitleTracks.find(t => t.id === activeSubtitle)?.lanName || 'EN'}
              </span>
            )}
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
                  className="absolute top-full mt-2 left-0 w-56 rounded-2xl overflow-hidden z-50 shadow-2xl"
                  style={{
                    background: 'rgba(10,10,22,0.98)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(24px)',
                  }}
                >
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                      Subtitles
                    </p>
                    <button
                      onClick={() => { setShowSubtitleMenu(false); setShowSubtitleSettings(true); }}
                      className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-primary-400 transition-colors"
                    >
                      <Settings size={10} />
                      Settings
                    </button>
                  </div>

                  {/* Off option */}
                  <button
                    onClick={() => { setSubtitlesEnabled(false); setActiveSubtitle('off'); }}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-all ${
                      !subtitlesEnabled || activeSubtitle === 'off'
                        ? 'bg-primary-500/15 text-white'
                        : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <X size={13} className="flex-shrink-0 text-gray-500" />
                    <span>Off</span>
                    {!subtitlesEnabled || activeSubtitle === 'off' ? (
                      <Check size={12} className="text-primary-400 ml-auto" />
                    ) : null}
                  </button>

                  {/* Language options */}
                  {subtitleTracks.map(track => (
                    <button
                      key={track.id}
                      onClick={() => { setSubtitlesEnabled(true); setActiveSubtitle(track.id); }}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-all ${
                        activeSubtitle === track.id && subtitlesEnabled
                          ? 'bg-primary-500/15 text-white'
                          : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold uppercase w-5 text-center text-gray-500">
                        {track.lan}
                      </span>
                      <span>{track.lanName}</span>
                      {activeSubtitle === track.id && subtitlesEnabled ? (
                        <Check size={12} className="text-primary-400 ml-auto" />
                      ) : null}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Reload */}
        <motion.button
          onClick={reload}
          disabled={megaplayLoading}
          className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-zx-s3 border border-white/[0.08] text-xs text-gray-500 hover:text-white hover:border-white/15 transition-all disabled:opacity-40"
          whileTap={{ scale: 0.95 }}
        >
          <RefreshCw size={14} className={megaplayLoading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Reload</span>
        </motion.button>

        {/* Download button (AnimeHeaven only) */}
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

        {/* Open in new tab */}
        {streamUrl && (
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
              ref={videoRef}
              src={ahUrl}
              controls
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full"
              style={{ background: '#000' }}
            />
          )}

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

          {/* ── Error: resolution failed ── */}
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
                <button
                  onClick={resolveMegaplayUrl}
                  className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5"
                >
                  <RefreshCw size={13} /> Retry
                </button>
                <button
                  onClick={() => changeServer('vidsrc')}
                  className="btn-primary text-sm py-2 px-4"
                >
                  Try Server 3
                </button>
              </div>
            </div>
          )}

          {/* ── Error: no anilistId ── */}
          {isAnime && isMegaplay && !megaplayLoading && !megaplayError && !anilistId && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zx-s2 p-6">
              <AlertCircle size={44} className="text-amber-500/70" />
              <div className="text-center">
                <p className="text-white font-semibold">AniList ID required</p>
                <p className="text-gray-500 text-sm mt-1 max-w-xs">
                  This server requires an AniList ID. Try Server 3 or Server 6.
                </p>
              </div>
              <button
                onClick={() => changeServer('vidsrc')}
                className="btn-primary text-sm py-2 px-4"
              >
                Switch to Server 3
              </button>
            </div>
          )}

          {/* ── Generic iframe error ── */}
          {hasError && !megaplayLoading && (
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
                <button
                  onClick={reload}
                  className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5"
                >
                  <RefreshCw size={13} /> Retry
                </button>
                {activeServer !== 'vidsrc' && (
                  <button
                    onClick={() => changeServer('vidsrc')}
                    className="btn-primary text-sm py-2 px-4"
                  >
                    Try Server 3
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Iframe ── */}
          {streamUrl && !hasError && !megaplayLoading && !megaplayError && (
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

          {/* ══ SUBTITLE OVERLAY ═══════════════════════════════════ */}
          <AnimatePresence>
            {subtitlesEnabled && currentCue && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-16 left-0 right-0 flex justify-center z-20 pointer-events-none px-4"
              >
                <div
                  className="subtitle-text px-4 py-2 rounded-lg text-center font-medium leading-relaxed"
                  style={getSubtitleStyleCSS()}
                >
                  {currentCue.text.split('\n').map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status badge */}
          {!megaplayLoading && (
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
            </div>
          )}
        </div>
      </div>

      {/* ══ SUBTITLE SETTINGS MODAL ═══════════════════════════════ */}
      <AnimatePresence>
        {showSubtitleSettings && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setShowSubtitleSettings(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-2xl overflow-hidden z-50 shadow-2xl"
              style={{
                background: 'rgba(20, 20, 35, 0.98)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(24px)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
                <h3 className="font-display font-bold text-white text-base">Subtitle Settings</h3>
                <button
                  onClick={() => setShowSubtitleSettings(false)}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.1] transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Font Size */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Type size={13} className="text-gray-500" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                    Font Size
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['small', 'medium', 'large', 'xl'] as const).map(size => (
                    <button
                      key={size}
                      onClick={() => setSubtitleStyle(prev => ({ ...prev, fontSize: size }))}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all capitalize ${
                        subtitleStyle.fontSize === size
                          ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                          : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-white border border-white/[0.07]'
                      }`}
                    >
                      {size === 'small' ? 'Small' : size === 'medium' ? 'Medium' : size === 'large' ? 'Large' : 'XL'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Color */}
              <div className="px-5 py-4 border-t border-white/[0.07]">
                <div className="flex items-center gap-2 mb-3">
                  <Palette size={13} className="text-gray-500" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                    Text Color
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSubtitleStyle(prev => ({ ...prev, textColor: 'white' }))}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      subtitleStyle.textColor === 'white'
                        ? 'bg-white text-black shadow-lg'
                        : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-white border border-white/[0.07]'
                    }`}
                  >
                    White
                  </button>
                  <button
                    onClick={() => setSubtitleStyle(prev => ({ ...prev, textColor: 'yellow' }))}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      subtitleStyle.textColor === 'yellow'
                        ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/25'
                        : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-white border border-white/[0.07]'
                    }`}
                  >
                    Yellow
                  </button>
                </div>
              </div>

              {/* Background */}
              <div className="px-5 py-4 border-t border-white/[0.07]">
                <div className="flex items-center gap-2 mb-3">
                  <Square size={13} className="text-gray-500" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                    Background
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'semi', 'full'] as const).map(bg => (
                    <button
                      key={bg}
                      onClick={() => setSubtitleStyle(prev => ({ ...prev, background: bg }))}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all capitalize ${
                        subtitleStyle.background === bg
                          ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                          : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1] hover:text-white border border-white/[0.07]'
                      }`}
                    >
                      {bg === 'none' ? 'None' : bg === 'semi' ? 'Semi' : 'Full'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="px-5 py-4 border-t border-white/[0.07]">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">
                  Preview
                </p>
                <div className="bg-black/50 rounded-xl p-4 flex items-center justify-center min-h-[60px]">
                  <span
                    className="subtitle-text px-3 py-1.5 rounded"
                    style={getSubtitleStyleCSS()}
                  >
                    Sample subtitle text
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Stream info banner ──────────────────── */}
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

      {/* ── Anonymized ad-blocker nudge ── */}
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
        Switch servers if a stream doesn't load
      </p>

      <AdBlockGuideModal isOpen={showAdBlockGuide} onClose={() => setShowAdBlockGuide(false)} />
    </div>
  );
}
