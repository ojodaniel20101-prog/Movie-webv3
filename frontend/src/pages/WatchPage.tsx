import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ChevronLeft, ChevronRight, List, Star,
  Play, Info, Bookmark, BookmarkCheck, X, Loader2,
  Layers, Radio, Clock, CalendarClock, Film,
} from 'lucide-react';
import { getMovieDetails, getShowDetails, getSeasonDetails, getYear } from '@/services/tmdb';
import { getAnimeById } from '@/services/anilist';
import VideoPlayer from '@/components/player/VideoPlayer';
import AdBlockBanner from '@/components/adblock/AdBlockBanner';
import { useAuthStore } from '@/store/useAuthStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useWatchlistStore } from '@/store/useWatchlistStore';
import type { ContentType, Season, Episode } from '@/types';

type WatchType = 'movie' | 'tv' | 'anime';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtAirDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtCountdown(seconds: number): string {
  if (seconds <= 0) return 'Soon';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Episode status for airing anime ─────────────────────────────────────────
type EpStatus = 'aired' | 'airing_soon' | 'upcoming';
function getEpStatus(epNum: number, nextAiring: { airingAt: number; episode: number } | null | undefined): EpStatus {
  if (!nextAiring) return 'aired';
  if (epNum < nextAiring.episode) return 'aired';
  if (epNum === nextAiring.episode) return 'airing_soon';
  return 'upcoming';
}
function getEpAiringAt(base: { airingAt: number; episode: number }, targetEp: number): number {
  return base.airingAt + (targetEp - base.episode) * 7 * 24 * 3600;
}

export default function WatchPage() {
  const { type, id }                    = useParams<{ type: WatchType; id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate                        = useNavigate();
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [activeTab, setActiveTab]       = useState<'episodes' | 'seasons' | 'extras'>('episodes');

  const episode = Number(searchParams.get('episode') || 1);
  const season  = type === 'tv' ? Number(searchParams.get('season') || 1) : 1;

  const { updateHistory }                                      = useHistoryStore();
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlistStore();
  const { isAuthenticated }                                    = useAuthStore();

  const contentType = type as ContentType;
  const contentId   = String(id);
  const anilistId   = contentType === 'anime' ? Number(id) : undefined;
  const inWatchlist = isInWatchlist(contentId, contentType);
  const isAnime     = type === 'anime';

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: movie }      = useQuery({ queryKey:['movie',id],      queryFn:()=>getMovieDetails(Number(id)),         enabled:type==='movie', staleTime:10*60*1000 });
  const { data: show }       = useQuery({ queryKey:['show',id],       queryFn:()=>getShowDetails(Number(id)),          enabled:type==='tv',    staleTime:10*60*1000 });
  const { data: anime }      = useQuery({ queryKey:['anime',id],      queryFn:()=>getAnimeById(Number(id)),            enabled:type==='anime', staleTime:10*60*1000 });
  const { data: seasonData } = useQuery({ queryKey:['season-w',id,season], queryFn:()=>getSeasonDetails(Number(id),season), enabled:type==='tv'&&!!show, staleTime:10*60*1000 });

  // ── Derived ───────────────────────────────────────────────────────────────
  const title        = movie?.title || show?.name || anime?.title.english || anime?.title.romaji || '';
  const posterPath   = movie?.poster_path  || show?.poster_path  || anime?.coverImage?.large  || null;
  const backdropPath = movie?.backdrop_path|| show?.backdrop_path|| anime?.bannerImage        || null;
  const tvSeasonsList: Season[] = type === 'tv' ? (show?.seasons?.filter(s=>s.season_number>0)||[]) : [];
  const tvEpisodes:   Episode[] = seasonData?.episodes || [];

  // ── Anime Relations Processing ────────────────────────────────────────────
  const { animeSeasons, animeExtras } = useMemo(() => {
    if (!isAnime || !anime) return { animeSeasons: [], animeExtras: [] };
    type RelEdge = { relationType: string; node: { id: number; title: { romaji: string; english?: string }; coverImage: { large?: string; medium?: string }; format: string; episodes?: number; status?: string; nextAiringEpisode?: { airingAt: number; episode: number } } };
    const edges: RelEdge[] = (anime as { relations?: { edges?: RelEdge[] } }).relations?.edges || [];

    const TV_FORMATS    = ['TV', 'TV_SHORT', 'ONA'];
    const EXTRA_FORMATS = ['OVA', 'SPECIAL', 'MOVIE'];

    const prequels = edges.filter(e => e.relationType === 'PREQUEL' && TV_FORMATS.includes(e.node.format)).map(e => ({ ...e.node, isCurrentSeason: false }));
    const sequels  = edges.filter(e => e.relationType === 'SEQUEL'  && TV_FORMATS.includes(e.node.format)).map(e => ({ ...e.node, isCurrentSeason: false }));
    const extras   = edges.filter(e => EXTRA_FORMATS.includes(e.node.format)).map(e => ({ ...e.node, relationType: e.relationType }));

    const currentEntry = { id: Number(id), title: anime.title, coverImage: anime.coverImage, format: anime.format, episodes: anime.episodes, status: anime.status, nextAiringEpisode: anime.nextAiringEpisode, isCurrentSeason: true };
    const seasons = [...prequels, currentEntry, ...sequels];

    return { animeSeasons: seasons, animeExtras: extras };
  }, [isAnime, anime, id]);

  // ── Anime Episode List (streamingEpisodes for thumbnails/titles) ───────────
  const animeEpisodes = useMemo<(Episode & { thumbnail?: string | null; airingAt?: number; epStatus?: EpStatus })[]>(() => {
    if (!isAnime || !anime) return [];
    const total     = anime.episodes ?? 1;
    const streaming = (anime as { streamingEpisodes?: { title?: string; thumbnail?: string }[] }).streamingEpisodes || [];
    const nextAir   = anime.nextAiringEpisode;

    return Array.from({ length: total }, (_, i) => {
      const ep      = i + 1;
      const sEp     = streaming.find(s => s.title?.toLowerCase().includes(`episode ${ep}`) || streaming.indexOf(s) === i);
      const status  = getEpStatus(ep, nextAir);
      const airAt   = nextAir && status !== 'aired' ? getEpAiringAt(nextAir, ep) : undefined;
      return {
        id: ep, episode_number: ep, season_number: 1,
        name:        sEp?.title?.replace(/^Episode \d+[:\s-]*/i, '').trim() || `Episode ${ep}`,
        overview:    '',
        still_path:  null,
        thumbnail:   sEp?.thumbnail || null,
        air_date:    '',
        vote_average: 0,
        runtime:     anime.duration ?? undefined,
        airingAt:    airAt,
        epStatus:    status,
      };
    });
  }, [isAnime, anime]);

  const displayEpisodes = isAnime ? animeEpisodes : tvEpisodes;
  const currentEpisode  = tvEpisodes.find(ep => ep.episode_number === episode);

  // ── History ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!title) return;
    const t = setTimeout(() => {
      updateHistory({
        content_id: contentId, content_type: contentType, title,
        poster_path: posterPath, backdrop_path: backdropPath,
        season_number:   type !== 'movie' ? season  : null,
        episode_number:  type !== 'movie' ? episode : null,
        episode_title:   currentEpisode?.name || null,
        progress_seconds: 60,
        duration_seconds: type === 'movie'
          ? (movie?.runtime ? movie.runtime * 60 : 5400)
          : ((currentEpisode?.runtime || (anime as {duration?:number})?.duration || 24) * 60),
      });
    }, 15000);
    return () => clearTimeout(t);
  }, [contentId, title, season, episode]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goToEpisode = (s: number, ep: number) => {
    setSearchParams(isAnime ? { episode: String(ep) } : { season: String(s), episode: String(ep) });
    setShowEpisodes(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goNext = () => {
    const maxEp = isAnime ? (anime?.episodes ?? 1) : tvEpisodes.length;
    if (episode < maxEp) { goToEpisode(season, episode + 1); return; }
    if (!isAnime) { const ns = tvSeasonsList.find(s=>s.season_number===season+1); if(ns) goToEpisode(ns.season_number,1); }
  };
  const goPrev = () => {
    if (episode > 1) { goToEpisode(season, episode - 1); return; }
    if (!isAnime) { const ps = tvSeasonsList.find(s=>s.season_number===season-1); if(ps) goToEpisode(ps.season_number, ps.episode_count); }
  };

  const handleWatchlist = () => {
    if (inWatchlist) { removeFromWatchlist(contentId, contentType); return; }
    addToWatchlist({
      content_id: contentId, content_type: contentType, title,
      poster_path: posterPath, backdrop_path: backdropPath,
      overview:    movie?.overview || show?.overview || anime?.description?.replace(/<[^>]*>/g,'') || '',
      vote_average: movie?.vote_average || show?.vote_average || (anime?.averageScore ? anime.averageScore/10 : 0) || 0,
      release_year: getYear(movie?.release_date||show?.first_air_date||'') || String(anime?.seasonYear||''),
    });
  };

  const hasDrawerContent = type !== 'movie';
  const hasSeasonsTab    = isAnime && animeSeasons.length > 1;
  const hasExtrasTab     = isAnime && animeExtras.length > 0;

  return (
    <div className="min-h-screen bg-zx-bg pt-16">
      <div className="max-w-screen-2xl mx-auto px-3 md:px-5 lg:px-8 py-3 md:py-4">

        {/* ── TOP BAR ───────────────────────────────────── */}
        <div className="flex items-start gap-2 mb-4">
          <motion.button onClick={()=>navigate(-1)} whileHover={{x:-2}}
            className="flex-shrink-0 flex items-center gap-1 h-9 px-2.5 text-sm text-gray-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition-all mt-0.5">
            <ArrowLeft size={16}/><span className="hidden sm:inline text-xs">Back</span>
          </motion.button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-white text-base md:text-xl leading-tight truncate">{title}</h1>
            {type !== 'movie' && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {isAnime ? `Episode ${episode}` : `Season ${season} · Episode ${episode}${currentEpisode?.name ? ` · "${currentEpisode.name}"` : ''}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasDrawerContent && (
              <motion.button onClick={()=>setShowEpisodes(true)} whileTap={{scale:0.95}}
                className={`flex items-center gap-1 h-9 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  showEpisodes ? 'bg-primary-500/20 border-primary-500/30 text-primary-300' : 'bg-zx-s3 border-white/[0.08] text-gray-300 hover:text-white'
                }`}>
                <List size={13}/>
                <span className="hidden xs:inline">Episodes</span>
                {(hasSeasonsTab || hasExtrasTab) && <Layers size={9} className="text-gray-500"/>}
              </motion.button>
            )}
            <motion.button onClick={handleWatchlist} className="btn-icon w-9 h-9" whileTap={{scale:0.9}}>
              {inWatchlist ? <BookmarkCheck size={15} className="text-primary-400"/> : <Bookmark size={15} className="text-gray-400"/>}
            </motion.button>
            <Link to={`/details/${type}/${id}`} className="btn-icon w-9 h-9">
              <Info size={15} className="text-gray-400"/>
            </Link>
          </div>
        </div>

        <>
            {/* ── AD-FREE SETUP NOTIFICATION ──────────────────── */}
            <AdBlockBanner />

            {/* ── PLAYER ────────────────────────────────────── */}
            <VideoPlayer tmdbId={type==='movie'||type==='tv'?Number(id):0} anilistId={anilistId}
              type={contentType} season={season} episode={episode} title={title} isAnime={isAnime}/>
        </>

        {/* ── PREV / NEXT ───────────────────────────────── */}
        {type !== 'movie' && (
          <div className="flex items-center justify-between mt-4 gap-2">
            <motion.button onClick={goPrev} whileTap={{scale:0.97}}
              disabled={episode===1&&(isAnime||season===1)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zx-s3 border border-white/[0.08] text-sm text-gray-400 hover:text-white hover:border-white/15 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft size={15}/> Prev
            </motion.button>
            <span className="text-sm text-gray-600 font-medium tabular-nums">
              {isAnime ? `EP ${String(episode).padStart(2,'0')}` : `S${String(season).padStart(2,'0')} E${String(episode).padStart(2,'0')}`}
            </span>
            <motion.button onClick={goNext} whileTap={{scale:0.97}}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-500/15 border border-primary-500/25 text-sm text-primary-300 hover:bg-primary-500/25 transition-all">
              Next <ChevronRight size={15}/>
            </motion.button>
          </div>
        )}

        {/* ── CURRENTLY AIRING BADGE ────────────────────── */}
        {isAnime && anime?.status === 'RELEASING' && anime.nextAiringEpisode && (
          <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <Radio size={14} className="text-emerald-400 animate-pulse flex-shrink-0"/>
            <div className="text-sm">
              <span className="text-emerald-400 font-semibold">Currently Airing · </span>
              <span className="text-gray-400">Episode {anime.nextAiringEpisode.episode} airs in </span>
              <span className="text-white font-semibold">{fmtCountdown(anime.nextAiringEpisode.timeUntilAiring)}</span>
              <span className="text-gray-600 text-xs ml-2">({fmtAirDate(anime.nextAiringEpisode.airingAt)})</span>
            </div>
          </div>
        )}

        {/* ── INFO CARDS ────────────────────────────────── */}
        {type==='movie'&&movie&&(
          <div className="mt-5 p-4 rounded-2xl bg-zx-s2 border border-white/[0.05]">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {movie.vote_average>0&&<span className="flex items-center gap-1 text-sm text-rating font-bold"><Star size={13} fill="currentColor"/>{movie.vote_average.toFixed(1)}</span>}
              {movie.release_date&&<span className="text-sm text-gray-500">{movie.release_date.split('-')[0]}</span>}
              {movie.runtime&&<span className="text-sm text-gray-500">{Math.floor(movie.runtime/60)}h {movie.runtime%60}m</span>}
              {movie.genres?.slice(0,3).map(g=><span key={g.id} className="genre-chip text-xs">{g.name}</span>)}
            </div>
            <p className="text-sm text-gray-400 leading-relaxed line-clamp-3">{movie.overview}</p>
          </div>
        )}
        {isAnime&&anime&&(
          <div className="mt-5 p-4 rounded-2xl bg-zx-s2 border border-white/[0.05]">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {anime.averageScore&&<span className="flex items-center gap-1 text-sm text-rating font-bold"><Star size={13} fill="currentColor"/>{(anime.averageScore/10).toFixed(1)}</span>}
              {anime.seasonYear&&<span className="text-sm text-gray-500">{anime.seasonYear}</span>}
              {anime.episodes&&<span className="text-sm text-gray-500">{anime.episodes} eps</span>}
              {anime.genres?.slice(0,3).map(g=><span key={g} className="genre-chip text-xs">{g}</span>)}
            </div>
            <p className="text-sm text-gray-400 leading-relaxed line-clamp-3">{anime.description?.replace(/<[^>]*>/g,'')||''}</p>
          </div>
        )}
        {currentEpisode&&(
          <div className="mt-4 p-4 rounded-2xl bg-zx-s2 border border-white/[0.05]">
            <p className="text-xs text-gray-500 mb-1">Now Playing</p>
            <p className="font-semibold text-white mb-1">{currentEpisode.name}</p>
            {currentEpisode.vote_average>0&&<span className="flex items-center gap-1 text-xs text-rating mb-2"><Star size={10} fill="currentColor"/>{currentEpisode.vote_average.toFixed(1)}</span>}
            {currentEpisode.overview&&<p className="text-sm text-gray-400 leading-relaxed line-clamp-3">{currentEpisode.overview}</p>}
          </div>
        )}
        <div className="h-24"/>
      </div>

      {/* ══════════════════════════════════════════════════════
          EPISODE DRAWER
          ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showEpisodes && hasDrawerContent && (
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={()=>setShowEpisodes(false)}/>
            <motion.div
              initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}}
              transition={{type:'spring',stiffness:400,damping:40}}
              className="fixed bottom-0 left-0 right-0 xl:right-0 xl:top-0 xl:left-auto xl:bottom-0 xl:w-96 z-50 flex flex-col"
              style={{ maxHeight:'92vh', background:'rgba(10,10,20,0.98)', backdropFilter:'blur(24px)', borderTop:'1px solid rgba(255,255,255,0.08)', borderRadius:'24px 24px 0 0' }}>
              
              <div className="flex justify-center pt-3 pb-1 xl:hidden">
                <div className="w-10 h-1 rounded-full bg-white/20"/>
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
                <div>
                  <h3 className="font-display font-bold text-white text-base">Episodes</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{displayEpisodes.length > 0 ? `${displayEpisodes.length} episodes` : 'Loading…'}</p>
                </div>
                <motion.button onClick={()=>setShowEpisodes(false)} whileTap={{scale:0.9}}
                  className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.1] transition-all">
                  <X size={16}/>
                </motion.button>
              </div>

              {/* Tabs (for anime with seasons or extras) */}
              {isAnime && (hasSeasonsTab || hasExtrasTab) && (
                <div className="flex gap-1 px-4 py-2.5 border-b border-white/[0.06]">
                  {(['episodes', hasSeasonsTab && 'seasons', hasExtrasTab && 'extras'] as const).filter(Boolean).map(t => (
                    <button key={t} onClick={()=>setActiveTab(t as typeof activeTab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                        activeTab===t ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30' : 'text-gray-500 hover:text-gray-300'
                      }`}>
                      {t === 'episodes' ? `Episodes (${displayEpisodes.length})` : t === 'seasons' ? `Seasons (${animeSeasons.length})` : `Extras (${animeExtras.length})`}
                    </button>
                  ))}
                </div>
              )}

              {/* TV Season tabs */}
              {!isAnime && tvSeasonsList.length > 1 && (
                <div className="flex gap-2 px-5 py-3 border-b border-white/[0.06] overflow-x-auto" style={{scrollbarWidth:'none'}}>
                  {tvSeasonsList.map(s => (
                    <motion.button key={s.id} whileTap={{scale:0.95}}
                      onClick={()=>setSearchParams({season:String(s.season_number),episode:'1'})}
                      className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                        season===s.season_number ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30' : 'bg-white/[0.05] text-gray-400 border border-white/[0.07] hover:text-white'
                      }`}>
                      S{s.season_number}<span className="ml-1 opacity-50 text-[10px]">({s.episode_count})</span>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Scrollable content — pb-32 clears the bottom nav on mobile */}
              <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>

                {/* EPISODES tab */}
                {(activeTab === 'episodes' || !isAnime || (!hasSeasonsTab && !hasExtrasTab)) && (
                  <div className="py-2 pb-32">
                    {displayEpisodes.length > 0 ? displayEpisodes.map((ep: typeof animeEpisodes[0]) => {
                      const isActive = ep.episode_number===episode && (isAnime||ep.season_number===season);
                      const thumbUrl = ep.thumbnail || (ep.still_path ? `https://image.tmdb.org/t/p/w185${ep.still_path}` : null);
                      const epSt     = isAnime ? ep.epStatus : 'aired';
                      const isLocked = epSt === 'airing_soon' || epSt === 'upcoming';
                      return (
                        <motion.button key={ep.id} whileTap={{scale:0.98}}
                          onClick={()=>!isLocked && goToEpisode(ep.season_number, ep.episode_number)}
                          className={`flex items-center gap-4 w-full px-5 py-3.5 text-left transition-all ${
                            isActive ? 'bg-primary-500/10 border-l-2 border-l-primary-400'
                            : isLocked ? 'opacity-50 cursor-default'
                            : 'hover:bg-white/[0.04] active:bg-white/[0.07]'
                          }`}>
                          {/* Thumbnail */}
                          <div className="relative flex-shrink-0 w-24 h-[54px] rounded-xl overflow-hidden bg-zx-s3">
                            {thumbUrl
                              ? <img src={thumbUrl} alt="" className="w-full h-full object-cover"/>
                              : <div className="w-full h-full flex items-center justify-center">
                                  <span className="text-xl font-bold text-gray-700">{ep.episode_number}</span>
                                </div>
                            }
                            {isActive && <div className="absolute inset-0 bg-primary-500/50 flex items-center justify-center"><Play size={16} fill="white" className="text-white"/></div>}
                            {epSt==='airing_soon' && <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center"><Radio size={14} className="text-emerald-400"/></div>}
                            {epSt==='upcoming'    && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Clock size={14} className="text-gray-400"/></div>}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <p className={`text-xs font-bold ${isActive?'text-primary-400':'text-gray-500'}`}>
                                EP {ep.episode_number}{ep.runtime?<span className="ml-1.5 font-normal text-gray-600">{ep.runtime}m</span>:null}
                              </p>
                              {epSt==='airing_soon' && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full">AIRING SOON</span>}
                            </div>
                            <p className={`text-sm font-medium leading-tight truncate ${isActive?'text-white':'text-gray-200'}`}>{ep.name}</p>
                            {isAnime && ep.airingAt && (
                              <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1">
                                <CalendarClock size={9}/>{fmtAirDate(ep.airingAt)}
                              </p>
                            )}
                            {ep.vote_average>0&&<span className="flex items-center gap-0.5 text-[10px] text-rating mt-0.5"><Star size={8} fill="currentColor"/>{ep.vote_average.toFixed(1)}</span>}
                          </div>
                        </motion.button>
                      );
                    }) : (
                      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                        <Loader2 size={28} className="text-gray-700 animate-spin mb-3"/>
                        <p className="text-gray-500 text-sm">Loading episodes…</p>
                      </div>
                    )}
                  </div>
                )}

                {/* SEASONS tab (anime only) */}
                {activeTab==='seasons' && isAnime && (
                  <div className="py-3 px-4 space-y-2 pb-32">
                    {animeSeasons.map((s, i) => {
                      const isCurrent = s.id === Number(id);
                      const sTitle    = (s.title as { english?: string; romaji?: string })?.english || (s.title as { english?: string; romaji?: string })?.romaji || `Season ${i+1}`;
                      return (
                        <motion.button key={s.id} whileTap={{scale:0.97}}
                          onClick={()=>{ if(!isCurrent) navigate(`/watch/anime/${s.id}?episode=1`); setShowEpisodes(false); }}
                          className={`flex items-center gap-3 w-full p-3 rounded-2xl border transition-all text-left ${
                            isCurrent ? 'border-primary-500/30 bg-primary-500/10' : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]'
                          }`}>
                          <div className="w-12 h-[68px] rounded-xl overflow-hidden bg-zx-s3 flex-shrink-0">
                            {s.coverImage?.large || (s.coverImage as {medium?:string})?.medium
                              ? <img src={s.coverImage.large || (s.coverImage as {medium?:string}).medium} alt="" className="w-full h-full object-cover"/>
                              : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-600">S{i+1}</div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold mb-0.5 ${isCurrent?'text-primary-400':'text-gray-500'}`}>Season {i+1}</p>
                            <p className="text-sm font-semibold text-white truncate">{sTitle}</p>
                            <p className="text-xs text-gray-600 mt-0.5">{s.episodes ? `${s.episodes} episodes` : 'Unknown eps'}</p>
                          </div>
                          {isCurrent && <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-400"/>}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* EXTRAS tab (OVA / Specials / Movies) */}
                {activeTab==='extras' && isAnime && (
                  <div className="py-3 px-4 space-y-2 pb-32">
                    {animeExtras.length > 0 ? animeExtras.map(ex => {
                      const exTitle = (ex.title as {english?:string;romaji?:string})?.english || (ex.title as {english?:string;romaji?:string})?.romaji || 'Unknown';
                      const formatLabel: Record<string,string> = { OVA:'OVA', SPECIAL:'Special', MOVIE:'Movie', MUSIC:'Music' };
                      const fmtLabel = formatLabel[ex.format] || ex.format;
                      const fmtColor: Record<string,string> = { OVA:'text-amber-400', SPECIAL:'text-purple-400', MOVIE:'text-accent-teal', MUSIC:'text-pink-400' };
                      return (
                        <motion.button key={ex.id} whileTap={{scale:0.97}}
                          onClick={()=>{ navigate(`/details/anime/${ex.id}`); setShowEpisodes(false); }}
                          className="flex items-center gap-3 w-full p-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] transition-all text-left">
                          <div className="w-12 h-[68px] rounded-xl overflow-hidden bg-zx-s3 flex-shrink-0">
                            {(ex.coverImage as {large?:string})?.large || (ex.coverImage as {medium?:string})?.medium
                              ? <img src={(ex.coverImage as {large?:string}).large||(ex.coverImage as {medium?:string}).medium} alt="" className="w-full h-full object-cover"/>
                              : <Film size={16} className="text-gray-600 m-auto mt-6"/>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`text-[10px] font-bold uppercase tracking-wide ${fmtColor[ex.format]||'text-gray-500'}`}>{fmtLabel}</span>
                              {ex.episodes && <span className="text-[10px] text-gray-600">{ex.episodes} ep{ex.episodes>1?'s':''}</span>}
                            </div>
                            <p className="text-sm font-semibold text-white truncate">{exTitle}</p>
                          </div>
                          <ChevronRight size={14} className="text-gray-600 flex-shrink-0"/>
                        </motion.button>
                      );
                    }) : (
                      <div className="text-center py-10 text-gray-600 text-sm">No extras found</div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
