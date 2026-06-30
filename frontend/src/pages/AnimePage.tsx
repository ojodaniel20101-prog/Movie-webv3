import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sword, Filter, Search, Loader2, X } from 'lucide-react';
import {
  getTrendingAnime, getPopularAnime, getTopRatedAnime,
  getSeasonalAnime, getAnimeByGenre, searchAnime,
} from '@/services/anilist';
import type { AniListMedia } from '@/types';

const ANIME_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy',
  'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller', 'Mecha', 'Music',
];

function getCurrentSeason(): { season: string; year: number } {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  if (month <= 3) return { season: 'WINTER', year };
  if (month <= 6) return { season: 'SPRING', year };
  if (month <= 9) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}

function AnimeCard({ anime }: { anime: AniListMedia }) {
  const title = anime.title?.english || anime.title?.romaji || 'Unknown';
  const image = anime.coverImage?.large || anime.coverImage?.medium;
  const score = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : null;

  return (
    <motion.div
      whileHover={{ scale: 1.04, y: -4 }}
      className="relative rounded-xl overflow-hidden cursor-pointer group"
      style={{ background: 'var(--bg-card)' }}
    >
      <div className="relative aspect-[2/3]">
        {image ? (
          <img src={image} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5">
            <Sword className="w-8 h-8 text-gray-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {score && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg text-xs font-black"
            style={{ background: 'rgba(139,92,246,0.9)', color: 'white' }}>
            ⭐ {score}
          </div>
        )}
        {anime.status === 'RELEASING' && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-black"
            style={{ background: 'rgba(34,197,94,0.9)', color: 'white' }}>
            AIRING
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-white truncate">{title}</p>
        <p className="text-[10px] text-gray-500 truncate">{anime.format || 'TV'} · {anime.seasonYear || '—'}</p>
      </div>
    </motion.div>
  );
}

function AnimeRow({ title, items, accentColor = '#8B5CF6' }: { title: string; items: AniListMedia[]; accentColor?: string }) {
  if (!items.length) return null;
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-5 rounded-full" style={{ background: accentColor }} />
        <h2 className="text-base font-black text-white">{title}</h2>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
        {items.slice(0, 10).map(anime => (
          <AnimeCard key={anime.id} anime={anime} />
        ))}
      </div>
    </div>
  );
}

export default function AnimePage() {
  const [trending, setTrending] = useState<AniListMedia[]>([]);
  const [popular, setPopular] = useState<AniListMedia[]>([]);
  const [topRated, setTopRated] = useState<AniListMedia[]>([]);
  const [seasonal, setSeasonal] = useState<AniListMedia[]>([]);
  const [genreAnime, setGenreAnime] = useState<AniListMedia[]>([]);
  const [searchResults, setSearchResults] = useState<AniListMedia[]>([]);
  const [selectedGenre, setSelectedGenre] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { season, year } = getCurrentSeason();
        const [t, p, tr, s] = await Promise.all([
          getTrendingAnime(1, 20),
          getPopularAnime(1, 20),
          getTopRatedAnime(1, 20),
          getSeasonalAnime(season, year, 1, 20),
        ]);
        setTrending(t);
        setPopular(p);
        setTopRated(tr);
        setSeasonal(s);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedGenre) { setGenreAnime([]); return; }
    getAnimeByGenre(selectedGenre).then(setGenreAnime).catch(console.error);
  }, [selectedGenre]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchAnime(searchQuery);
        setSearchResults(res);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  return (
    <div className="pt-6 pb-16 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
            <Sword className="w-5 h-5" style={{ color: '#8B5CF6' }} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">Anime</h1>
            <p className="text-xs text-gray-500">Trending · Top Rated · Seasonal</p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowSearch(s => !s)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#8B5CF6' }}
        >
          <Search className="w-3.5 h-3.5" />
          Search
        </motion.button>
      </motion.div>

      {/* Search Bar */}
      {showSearch && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 relative"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              autoFocus
              type="text"
              placeholder="Search anime..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-10 py-3 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(139,92,246,0.3)' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Genre + Filter */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-3 mb-8 overflow-x-auto pb-1 scrollbar-hide"
      >
        <Filter className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <button
          onClick={() => setSelectedGenre('')}
          className="px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 transition-all"
          style={{
            background: !selectedGenre ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
            border: !selectedGenre ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.07)',
            color: !selectedGenre ? '#8B5CF6' : '#8899AA',
          }}
        >
          All
        </button>
        {ANIME_GENRES.map(g => (
          <button
            key={g}
            onClick={() => setSelectedGenre(selectedGenre === g ? '' : g)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 transition-all"
            style={{
              background: selectedGenre === g ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
              border: selectedGenre === g ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.07)',
              color: selectedGenre === g ? '#8B5CF6' : '#8899AA',
            }}
          >
            {g}
          </button>
        ))}
      </motion.div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#8B5CF6' }} />
        </div>
      ) : searching ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#8B5CF6' }} />
        </div>
      ) : searchQuery && searchResults.length > 0 ? (
        <AnimeRow title={`Results for "${searchQuery}"`} items={searchResults} />
      ) : selectedGenre && genreAnime.length > 0 ? (
        <AnimeRow title={`${selectedGenre} Anime`} items={genreAnime} />
      ) : (
        <>
          <AnimeRow title="🔥 Trending Now" items={trending} accentColor="#E31837" />
          <AnimeRow title="🌸 This Season" items={seasonal} accentColor="#EC4899" />
          <AnimeRow title="⭐ Top Rated" items={topRated} accentColor="#F59E0B" />
          <AnimeRow title="📺 Most Popular" items={popular} accentColor="#8B5CF6" />
        </>
      )}
    </div>
  );
}
