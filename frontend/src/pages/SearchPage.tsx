import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, TrendingUp, Film, Tv, Sparkles } from 'lucide-react';
import { searchMulti, searchMovies, searchShows, getTrendingMovies, getYear } from '@/services/tmdb';
import { searchAnime, getTrendingAnime } from '@/services/anilist';
import { useDebounce } from '@/hooks/useDebounce';
import ContentCard from '@/components/ui/ContentCard';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import type { ContentType } from '@/types';

type FilterTab = 'all' | 'movies' | 'tv' | 'anime';

const FILTER_TABS: { key: FilterTab; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'All', icon: <Search size={13} /> },
  { key: 'movies', label: 'Movies', icon: <Film size={13} /> },
  { key: 'tv', label: 'TV Shows', icon: <Tv size={13} /> },
  { key: 'anime', label: 'Anime', icon: <Sparkles size={13} /> },
];

interface ResultItem {
  id: number | string;
  type: ContentType;
  title: string;
  posterPath: string | null;
  backdropPath?: string | null;
  rating?: number;
  releaseYear?: string;
  overview?: string;
  episodeCount?: number;
  accentColor?: string | null;
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('zentrix_search_history') || '[]'); } catch { return []; }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 350);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (searchParams.get('q')) {
      setQuery(searchParams.get('q') || '');
    }
  }, [searchParams]);

  // ─── Search queries ──────────────────────────────────────
  const { data: multiResults, isLoading: multiLoading } = useQuery({
    queryKey: ['search-multi', debouncedQuery],
    queryFn: () => searchMulti(debouncedQuery),
    enabled: !!debouncedQuery && (filter === 'all' || filter === 'movies' || filter === 'tv'),
    staleTime: 30 * 1000,
  });

  const { data: animeResults, isLoading: animeLoading } = useQuery({
    queryKey: ['search-anime', debouncedQuery],
    queryFn: () => searchAnime(debouncedQuery, 1, 20),
    enabled: !!debouncedQuery && (filter === 'all' || filter === 'anime'),
    staleTime: 30 * 1000,
  });

  // ─── Trending (shown when no query) ─────────────────────
  const { data: trendingMovies } = useQuery({
    queryKey: ['trending-movies-search'],
    queryFn: () => getTrendingMovies(),
    enabled: !debouncedQuery,
    staleTime: 5 * 60 * 1000,
  });

  const { data: trendingAnime } = useQuery({
    queryKey: ['trending-anime-search'],
    queryFn: () => getTrendingAnime(1, 12),
    enabled: !debouncedQuery,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = multiLoading || animeLoading;

  // ─── Combine results ─────────────────────────────────────
  const allResults: ResultItem[] = [];

  if (multiResults?.results) {
    for (const item of multiResults.results) {
      if (item.media_type === 'person') continue;
      const type: ContentType = item.media_type === 'tv' ? 'tv' : 'movie';
      if (filter === 'movies' && type !== 'movie') continue;
      if (filter === 'tv' && type !== 'tv') continue;
      if (filter === 'anime') continue;
      allResults.push({
        id: item.id,
        type,
        title: item.title || item.name || '',
        posterPath: item.poster_path,
        backdropPath: item.backdrop_path,
        rating: item.vote_average,
        releaseYear: getYear(item.release_date || item.first_air_date),
        overview: item.overview,
      });
    }
  }

  if (animeResults && (filter === 'all' || filter === 'anime')) {
    for (const anime of animeResults) {
      allResults.push({
        id: anime.id,
        type: 'anime',
        title: anime.title.english || anime.title.romaji,
        posterPath: anime.coverImage.large || anime.coverImage.medium,
        backdropPath: anime.bannerImage,
        rating: anime.averageScore ? anime.averageScore / 10 : 0,
        releaseYear: String(anime.seasonYear || ''),
        episodeCount: anime.episodes || undefined,
        accentColor: anime.coverImage.color,
        overview: anime.description?.replace(/<[^>]*>/g, '') || '',
      });
    }
  }

  // ─── Trending items ──────────────────────────────────────
  const trendingItems: ResultItem[] = [
    ...(trendingMovies?.results || []).slice(0, 12).map((m) => ({
      id: m.id, type: 'movie' as ContentType,
      title: m.title, posterPath: m.poster_path,
      backdropPath: m.backdrop_path,
      rating: m.vote_average,
      releaseYear: getYear(m.release_date),
    })),
    ...(trendingAnime || []).slice(0, 12).map((a) => ({
      id: a.id, type: 'anime' as ContentType,
      title: a.title.english || a.title.romaji,
      posterPath: a.coverImage.large,
      rating: a.averageScore ? a.averageScore / 10 : 0,
      releaseYear: String(a.seasonYear || ''),
      accentColor: a.coverImage.color,
    })),
  ];

  const handleSearch = (value: string) => {
    setQuery(value);
    if (value.trim()) {
      setSearchParams({ q: value });
    } else {
      setSearchParams({});
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      const updated = [query, ...searchHistory.filter((h) => h !== query)].slice(0, 8);
      setSearchHistory(updated);
      localStorage.setItem('zentrix_search_history', JSON.stringify(updated));
    }
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('zentrix_search_history');
  };

  return (
    <div className="min-h-screen pt-20 pb-safe px-4 md:px-6 lg:px-8">
      <div className="max-w-screen-xl mx-auto">

        {/* ─── SEARCH BAR ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mb-6"
        >
          <form onSubmit={handleSubmit}>
            <div className="relative flex items-center">
              <Search size={20} className="absolute left-4 text-gray-500 pointer-events-none z-10" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search movies, TV shows, anime..."
                className="w-full h-14 pl-12 pr-12 rounded-2xl bg-zx-s2 border border-white/[0.08] text-base text-white placeholder-gray-600 outline-none focus:border-primary-500/50 focus:bg-zx-s3 transition-all shadow-card font-body"
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => handleSearch('')}
                  className="absolute right-4 text-gray-500 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </form>
        </motion.div>

        {/* ─── FILTER TABS ─────────────────────────────────── */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-1 scroll-row">
          {FILTER_TABS.map(({ key, label, icon }) => (
            <motion.button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-2 flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                filter === key
                  ? 'bg-primary-500/20 border-primary-500/30 text-primary-300'
                  : 'bg-zx-s2 border-white/[0.07] text-gray-400 hover:text-white hover:border-white/15'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              {icon}
              {label}
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ─── WITH QUERY: RESULTS ──────────────────────── */}
          {debouncedQuery ? (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              {isLoading ? (
                <div>
                  <div className="skeleton h-6 w-40 rounded-lg mb-6" />
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <div key={i} className="aspect-[2/3] skeleton rounded-xl" />
                    ))}
                  </div>
                </div>
              ) : allResults.length > 0 ? (
                <div>
                  <p className="text-sm text-gray-500 mb-5">
                    <span className="text-white font-semibold">{allResults.length}</span> results for "
                    <span className="text-primary-300">{debouncedQuery}</span>"
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4">
                    {allResults.map((item, i) => (
                      <motion.div
                        key={`${item.id}-${item.type}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      >
                        <ContentCard
                          id={item.id}
                          type={item.type}
                          title={item.title}
                          posterPath={item.posterPath}
                          backdropPath={item.backdropPath}
                          rating={item.rating}
                          releaseYear={item.releaseYear}
                          overview={item.overview}
                          accentColor={item.accentColor}
                          episodeCount={item.episodeCount}
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="w-20 h-20 rounded-full bg-zx-s3 flex items-center justify-center mx-auto mb-4">
                    <Search size={32} className="text-gray-600" />
                  </div>
                  <p className="text-xl font-display font-bold text-white mb-2">No results found</p>
                  <p className="text-gray-500 text-sm">
                    Try different keywords or browse our categories
                  </p>
                </div>
              )}
            </motion.div>
          ) : (
            /* ─── NO QUERY: DISCOVER VIEW ───────────────────── */
            <motion.div
              key="discover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-8"
            >
              {/* Search history */}
              {searchHistory.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display font-bold text-white">Recent Searches</h3>
                    <button onClick={clearHistory} className="text-xs text-gray-500 hover:text-primary-400 transition-colors">
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {searchHistory.map((h) => (
                      <button
                        key={h}
                        onClick={() => handleSearch(h)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zx-s3 border border-white/[0.07] text-sm text-gray-300 hover:text-white hover:border-white/15 transition-all"
                      >
                        <Search size={11} className="text-gray-600" />
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={18} className="text-primary-400" />
                  <h3 className="font-display font-bold text-xl text-white">Trending Now</h3>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4">
                  {trendingItems.slice(0, 14).map((item, i) => (
                    <motion.div
                      key={`${item.id}-${item.type}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <ContentCard
                        id={item.id}
                        type={item.type}
                        title={item.title}
                        posterPath={item.posterPath}
                        backdropPath={item.backdropPath}
                        rating={item.rating}
                        releaseYear={item.releaseYear}
                        accentColor={item.accentColor}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Browse by category hint */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                {[
                  { label: 'Movies', icon: Film, href: '/browse/movies', gradient: 'from-accent-pink/20 to-transparent', border: 'border-accent-pink/20' },
                  { label: 'TV Shows', icon: Tv, href: '/browse/tv', gradient: 'from-accent-teal/20 to-transparent', border: 'border-accent-teal/20' },
                  { label: 'Anime', icon: Sparkles, href: '/browse/anime', gradient: 'from-primary-500/20 to-transparent', border: 'border-primary-500/20' },
                ].map(({ label, icon: Icon, href, gradient, border }) => (
                  <motion.a
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r ${gradient} border ${border} hover:scale-[1.02] transition-transform cursor-pointer`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icon size={20} className="text-white/70" />
                    <span className="font-semibold text-white">Browse {label}</span>
                  </motion.a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
