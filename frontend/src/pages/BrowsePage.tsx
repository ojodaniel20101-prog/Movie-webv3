import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Film, Tv, Sparkles, Search, X,
  Flame, Star, Clapperboard, CalendarClock, Zap, Laugh, Ghost, Heart,
  Rocket, Wand2, Palette, RadioTower, Brain, Mic, Swords, Drama,
  Bot, Trophy, Sun, Compass, Eye, type LucideIcon,
} from 'lucide-react';
import {
  getPopularMovies, getTopRatedMovies, getNowPlayingMovies, getUpcomingMovies,
  getPopularShows, getTopRatedShows, getAiringShows, getYear,
} from '@/services/tmdb';
import {
  getTrendingAnime, getTopRatedAnime, getSeasonalAnime,
  getAnimeByGenre, getAnimeSpecials, searchAnime,
} from '@/services/anilist';
import ContentCard from '@/components/ui/ContentCard';
import type { ContentType, TMDBResponse, TMDBMovie, TMDBShow } from '@/types';

// Use same API key as tmdb.ts service (not env var which may be undefined)
const TMDB_API_KEY = '5072a0ec4e400e825a615cd9f0dab0af';
const TMDB_BASE    = 'https://api.themoviedb.org/3';

async function tmdbDiscover(media: 'movie' | 'tv', genreId: number, page: number) {
  const r = await fetch(
    `${TMDB_BASE}/discover/${media}?api_key=${TMDB_API_KEY}&with_genres=${genreId}&sort_by=popularity.desc&language=en-US&page=${page}`
  );
  if (!r.ok) throw new Error(`TMDB discover ${r.status}`);
  return r.json();
}

type Cat = 'movies' | 'tv' | 'anime';

const categoryConfig: Record<Cat, {
  label: string; icon: React.ElementType; color: string;
  sorts: { key: string; label: string; icon?: LucideIcon }[];
}> = {
  movies: {
    label: 'Movies', icon: Film, color: 'text-accent-pink',
    sorts: [
      { key: 'popular',     label: 'Popular',      icon: Flame },
      { key: 'top_rated',   label: 'Top Rated',    icon: Star },
      { key: 'now_playing', label: 'In Theatres',  icon: Clapperboard },
      { key: 'upcoming',    label: 'Coming Soon',  icon: CalendarClock },
      { key: 'g_28',        label: 'Action',       icon: Zap },
      { key: 'g_35',        label: 'Comedy',       icon: Laugh },
      { key: 'g_27',        label: 'Horror',       icon: Ghost },
      { key: 'g_10749',     label: 'Romance',      icon: Heart },
      { key: 'g_878',       label: 'Sci-Fi',       icon: Rocket },
      { key: 'g_53',        label: 'Thriller',     icon: Eye },
      { key: 'g_14',        label: 'Fantasy',      icon: Wand2 },
      { key: 'g_16',        label: 'Animation',    icon: Palette },
      { key: 'g_99',        label: 'Documentary',  icon: Film },
    ],
  },
  tv: {
    label: 'TV Shows', icon: Tv, color: 'text-accent-teal',
    sorts: [
      { key: 'popular',     label: 'Popular',           icon: Flame },
      { key: 'top_rated',   label: 'Top Rated',         icon: Star },
      { key: 'airing',      label: 'Currently Airing',  icon: RadioTower },
      { key: 'g_18',        label: 'Drama',             icon: Drama },
      { key: 'g_10759',     label: 'Action',            icon: Zap },
      { key: 'g_35',        label: 'Comedy',            icon: Laugh },
      { key: 'g_80',        label: 'Crime',             icon: Search },
      { key: 'g_10765',     label: 'Sci-Fi & Fantasy',  icon: Rocket },
      { key: 'g_16',        label: 'Animation',         icon: Palette },
      { key: 'g_9648',      label: 'Mystery',           icon: Brain },
      { key: 'g_10766',     label: 'Soap',              icon: Tv },
      { key: 'g_10767',     label: 'Talk Show',         icon: Mic },
    ],
  },
  anime: {
    label: 'Anime', icon: Sparkles, color: 'text-primary-400',
    sorts: [
      { key: 'trending',    label: 'Trending',      icon: Flame },
      { key: 'top_rated',   label: 'Top Rated',     icon: Star },
      { key: 'seasonal',    label: 'This Season',   icon: Sparkles },
      { key: 'specials',    label: 'OVAs & Films',  icon: Film },
      { key: 'g_Action',    label: 'Action',        icon: Swords },
      { key: 'g_Romance',   label: 'Romance',       icon: Heart },
      { key: 'g_Fantasy',   label: 'Fantasy',       icon: Wand2 },
      { key: 'g_Comedy',    label: 'Comedy',        icon: Laugh },
      { key: 'g_Drama',     label: 'Drama',         icon: Drama },
      { key: 'g_Isekai',    label: 'Isekai',        icon: Compass },
      { key: 'g_Mecha',     label: 'Mecha',         icon: Bot },
      { key: 'g_Horror',    label: 'Horror',        icon: Ghost },
      { key: 'g_Sports',    label: 'Sports',        icon: Trophy },
      { key: 'g_Mystery',   label: 'Mystery',       icon: Brain },
      { key: 'g_Slice of Life', label: 'Slice of Life', icon: Sun },
    ],
  },
};

interface Item {
  id: number | string; type: ContentType; title: string;
  posterPath?: string | null; backdropPath?: string | null;
  rating?: number; releaseYear?: string; overview?: string;
  episodeCount?: number; accentColor?: string | null;
}

export default function BrowsePage() {
  const { category = 'movies' } = useParams<{ category: Cat }>();
  const cat    = (category as Cat) in categoryConfig ? (category as Cat) : 'movies';
  const config = categoryConfig[cat];
  const Icon   = config.icon;

  const [sort,       setSort]       = useState(config.sorts[0].key);
  const [page,       setPage]       = useState(1);
  const [allItems,   setAllItems]   = useState<Item[]>([]);
  const [hasMore,    setHasMore]    = useState(true);
  const [isLoading,  setIsLoading]  = useState(false);
  const [search,     setSearch]     = useState('');
  const [searchQ,    setSearchQ]    = useState('');
  const loaderRef      = useRef<HTMLDivElement>(null);
  const isFetchingRef  = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search for anime
  useEffect(() => {
    if (cat !== 'anime') return;
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQ(search), 400);
  }, [search, cat]);

  const fetchPage = useCallback(async (pg: number, s: string, c: Cat, sq: string) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      let items: Item[] = [];

      // Anime search takes priority
      if (c === 'anime' && sq.trim()) {
        const r = await searchAnime(sq.trim(), pg, 30);
        items = r.map(mapAnime);
        if (r.length < 10) setHasMore(false);
      } else if (c === 'movies') {
        if (s.startsWith('g_')) {
          const gId = Number(s.replace('g_', ''));
          const r   = await tmdbDiscover('movie', gId, pg);
          items = (r.results || []).map(mapMovie);
        } else {
          let r: Partial<TMDBResponse<TMDBMovie>> = {};
          if (s === 'top_rated')   r = await getTopRatedMovies(pg);
          else if (s === 'now_playing') r = await getNowPlayingMovies(pg);
          else if (s === 'upcoming')    r = await getUpcomingMovies(pg);
          else                          r = await getPopularMovies(pg);
          items = (r.results || []).map(mapMovie);
        }
      } else if (c === 'tv') {
        if (s.startsWith('g_')) {
          const gId = Number(s.replace('g_', ''));
          const r   = await tmdbDiscover('tv', gId, pg);
          items = (r.results || []).map(mapShow);
        } else {
          let r: Partial<TMDBResponse<TMDBShow>> = {};
          if (s === 'top_rated') r = await getTopRatedShows(pg);
          else if (s === 'airing') r = await getAiringShows(pg);
          else                     r = await getPopularShows(pg);
          items = (r.results || []).map(mapShow);
        }
      } else {
        // Anime sort/genre
        let list;
        if (s === 'top_rated')       list = await getTopRatedAnime(pg, 30);
        else if (s === 'seasonal')   list = await getSeasonalAnime(undefined, undefined, pg, 30);
        else if (s === 'specials')   list = await getAnimeSpecials(pg, 30);
        else if (s.startsWith('g_')) list = await getAnimeByGenre(s.replace('g_', ''), pg, 30);
        else                         list = await getTrendingAnime(pg, 30);
        items = list.map(mapAnime);
        if (list.length < 10) setHasMore(false);
      }

      setAllItems(prev => {
        if (pg === 1) return items;
        const seen = new Set(prev.map(i => `${i.id}-${i.type}`));
        return [...prev, ...items.filter(i => !seen.has(`${i.id}-${i.type}`))];
      });
      if (items.length < 10) setHasMore(false);
    } catch (err) {
      console.error('BrowsePage fetch error:', err);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Reset on cat/sort/searchQ change
  useEffect(() => {
    setAllItems([]); setPage(1); setHasMore(true); isFetchingRef.current = false;
    fetchPage(1, sort, cat, searchQ);
  }, [cat, sort, searchQ]);

  // Load more on page bump
  useEffect(() => { if (page > 1) fetchPage(page, sort, cat, searchQ); }, [page]);

  // Infinite scroll
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !isFetchingRef.current && hasMore && allItems.length > 0)
        setPage(p => p + 1);
    }, { threshold: 0.1 });
    if (loaderRef.current) obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasMore, allItems.length]);

  const handleSort = (k: string) => { setSort(k); setSearch(''); setSearchQ(''); };

  const activeSorts = config.sorts;

  return (
    <div className="min-h-screen pt-20 pb-safe">
      <div className="max-w-screen-2xl mx-auto px-4 md:px-6 lg:px-8">

        {/* Header */}
        <motion.div initial={{ opacity:0,y:-16 }} animate={{ opacity:1,y:0 }}
          className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zx-s3 border border-white/[0.07] flex items-center justify-center">
              <Icon size={20} className={config.color} />
            </div>
            <div>
              <h1 className="font-display font-black text-2xl md:text-3xl text-white">{config.label}</h1>
              <p className="text-xs text-gray-600 mt-0.5">{allItems.length > 0 ? `${allItems.length} titles` : 'Loading…'}</p>
            </div>
          </div>
        </motion.div>

        {/* Anime search bar */}
        {cat === 'anime' && (
          <div className="relative mb-5">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search anime by name…"
              className="w-full pl-10 pr-10 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500/40 transition-colors"
            />
            {search && (
              <button onClick={() => { setSearch(''); setSearchQ(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300">
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {/* Sort pills */}
        {!searchQ && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6" style={{ scrollbarWidth:'none' }}>
            {activeSorts.map(({ key, label, icon: SortIcon }) => (
              <motion.button key={key} onClick={() => handleSort(key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  sort === key
                    ? 'bg-primary-500/20 border-primary-500/30 text-primary-300'
                    : 'bg-zx-s2 border-white/[0.07] text-gray-400 hover:text-white hover:border-white/15'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                {SortIcon && <SortIcon size={14} className="flex-shrink-0" />}
                {label}
              </motion.button>
            ))}
          </div>
        )}

        {/* Search label */}
        {searchQ && (
          <p className="text-sm text-gray-500 mb-5">
            Results for <span className="text-white font-semibold">"{searchQ}"</span>
            <button onClick={() => { setSearch(''); setSearchQ(''); }} className="ml-2 text-primary-400 hover:text-primary-300 text-xs underline">clear</button>
          </p>
        )}

        {/* Grid */}
        {isLoading && allItems.length === 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 md:gap-4">
            {Array.from({ length: 28 }).map((_, i) => <div key={i} className="aspect-[2/3] skeleton rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 md:gap-4">
            {allItems.map((item, i) => (
              <motion.div key={`${item.id}-${item.type}-${i}`}
                initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
                transition={{ delay: Math.min(i * 0.015, 0.3) }}>
                <ContentCard id={item.id} type={item.type} title={item.title}
                  posterPath={item.posterPath} backdropPath={item.backdropPath}
                  rating={item.rating} releaseYear={item.releaseYear}
                  overview={item.overview} episodeCount={item.episodeCount}
                  accentColor={item.accentColor} />
              </motion.div>
            ))}
          </div>
        )}

        {/* Infinite scroll trigger */}
        <div ref={loaderRef} className="py-10 flex justify-center">
          {isLoading && allItems.length > 0 && (
            <div className="flex items-center gap-3 text-gray-600 text-sm">
              <div className="w-5 h-5 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
              Loading more…
            </div>
          )}
          {!hasMore && allItems.length > 0 && (
            <p className="text-xs text-gray-700">· {allItems.length} titles loaded ·</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mappers ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapMovie = (m: any): Item => ({
  id: m.id, type: 'movie', title: m.title,
  posterPath: m.poster_path, backdropPath: m.backdrop_path,
  rating: m.vote_average, releaseYear: getYear(m.release_date), overview: m.overview,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapShow = (s: any): Item => ({
  id: s.id, type: 'tv', title: s.name,
  posterPath: s.poster_path, backdropPath: s.backdrop_path,
  rating: s.vote_average, releaseYear: getYear(s.first_air_date), overview: s.overview,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapAnime = (a: any): Item => ({
  id: a.id, type: 'anime',
  title: a.title.english || a.title.romaji,
  posterPath: a.coverImage?.large || a.coverImage?.medium,
  backdropPath: a.bannerImage,
  rating: a.averageScore ? a.averageScore / 10 : 0,
  releaseYear: String(a.seasonYear || ''),
  episodeCount: a.episodes || undefined,
  accentColor: a.coverImage?.color,
});
