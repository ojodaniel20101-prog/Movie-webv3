import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Film, Tv, Sparkles, Loader2 } from 'lucide-react';
import { searchMulti, getPosterUrl, getYear } from '@/services/tmdb';
import { searchAnime } from '@/services/anilist';
import { useDebounce } from '@/hooks/useDebounce';
import type { ContentType } from '@/types';

interface SearchResult {
  id: number;
  type: ContentType;
  title: string;
  posterPath: string | null;
  year: string;
  rating?: number;
}

interface Props {
  query: string;
  onClose: () => void;
  onClear: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function LiveSearchDropdown({ query, onClose, onClear, anchorRef }: Props) {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Fetch search results
  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasSearched(true);

    const fetchResults = async () => {
      try {
        const [multiData, animeData] = await Promise.all([
          searchMulti(debouncedQuery, 1).catch(() => null),
          searchAnime(debouncedQuery, 1, 10).catch(() => null),
        ]);

        if (cancelled) return;

        const items: SearchResult[] = [];

        // TMDB results (movies + TV)
        if (multiData?.results) {
          for (const item of multiData.results) {
            if (item.media_type === 'person') continue;
            const type: ContentType = item.media_type === 'tv' ? 'tv' : 'movie';
            items.push({
              id: item.id,
              type,
              title: item.title || item.name || '',
              posterPath: item.poster_path,
              year: getYear(item.release_date || item.first_air_date),
              rating: item.vote_average,
            });
            if (items.length >= 8) break;
          }
        }

        // Anime results
        if (animeData) {
          for (const anime of animeData) {
            const title = anime.title.english || anime.title.romaji;
            // Avoid duplicates
            if (items.some(i => i.title === title)) continue;
            items.push({
              id: anime.id,
              type: 'anime',
              title,
              posterPath: anime.coverImage.large || anime.coverImage.medium,
              year: String(anime.seasonYear || ''),
              rating: anime.averageScore ? anime.averageScore / 10 : undefined,
            });
            if (items.length >= 12) break;
          }
        }

        if (!cancelled) setResults(items);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchResults();
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      onClose();
      onClear();
      navigate(`/details/${result.type}/${result.id}`);
    },
    [navigate, onClose, onClear]
  );

  const handleViewAll = useCallback(() => {
    onClose();
    navigate(`/search?q=${encodeURIComponent(debouncedQuery)}`);
  }, [navigate, onClose, debouncedQuery]);

  const getTypeIcon = (type: ContentType) => {
    switch (type) {
      case 'movie': return <Film size={12} />;
      case 'tv': return <Tv size={12} />;
      case 'anime': return <Sparkles size={12} />;
      default: return null;
    }
  };

  const getTypeLabel = (type: ContentType) => {
    switch (type) {
      case 'movie': return 'Movie';
      case 'tv': return 'TV Show';
      case 'anime': return 'Anime';
      default: return type;
    }
  };

  const getTypeColor = (type: ContentType) => {
    switch (type) {
      case 'movie': return 'text-accent-pink bg-accent-pink/15';
      case 'tv': return 'text-accent-teal bg-accent-teal/15';
      case 'anime': return 'text-primary-300 bg-primary-500/15';
      default: return 'text-gray-400 bg-gray-500/15';
    }
  };

  if (!query.trim()) return null;

  return (
    <motion.div
      ref={dropdownRef}
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl overflow-hidden shadow-2xl"
      style={{
        background: 'rgba(10,10,22,0.98)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(24px)',
        maxHeight: 'min(500px, 70vh)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <span className="text-xs font-semibold text-gray-500">
          {isLoading ? 'Searching…' : `${results.length} results`}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X size={14} className="text-gray-500" />
        </button>
      </div>

      {/* Results list */}
      <div className="overflow-y-auto py-1" style={{ maxHeight: 'calc(min(500px, 70vh) - 50px)' }}>
        {isLoading ? (
          /* Loading state */
          <div className="flex items-center justify-center gap-2.5 py-8">
            <Loader2 size={18} className="text-primary-400 animate-spin" />
            <span className="text-sm text-gray-500">Searching…</span>
          </div>
        ) : results.length > 0 ? (
          /* Results */
          <>
            {results.map((result, i) => {
              const posterUrl = result.posterPath
                ? result.posterPath.startsWith('http')
                  ? result.posterPath
                  : getPosterUrl(result.posterPath, 'w92')
                : null;

              return (
                <motion.button
                  key={`${result.type}-${result.id}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.2) }}
                  onClick={() => handleResultClick(result)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.05] transition-colors group"
                >
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-10 h-14 rounded-lg overflow-hidden bg-zx-s3 border border-white/[0.06]">
                    {posterUrl ? (
                      <img
                        src={posterUrl}
                        alt={result.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film size={14} className="text-gray-600" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate group-hover:text-primary-300 transition-colors">
                      {result.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* Type badge */}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${getTypeColor(result.type)}`}>
                        {getTypeIcon(result.type)}
                        {getTypeLabel(result.type)}
                      </span>
                      {/* Year */}
                      {result.year && (
                        <span className="text-[10px] text-gray-500">{result.year}</span>
                      )}
                      {/* Rating */}
                      {result.rating ? (
                        <span className="text-[10px] text-gray-500">
                          {result.rating.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </motion.button>
              );
            })}

            {/* View all results */}
            <div className="px-4 py-2 border-t border-white/[0.04]">
              <button
                onClick={handleViewAll}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-primary-300 hover:bg-primary-500/10 transition-colors"
              >
                <Search size={12} />
                View all results for &quot;{debouncedQuery}&quot;
              </button>
            </div>
          </>
        ) : hasSearched ? (
          /* No results */
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <div className="w-12 h-12 rounded-full bg-zx-s3 flex items-center justify-center mb-3">
              <Search size={20} className="text-gray-600" />
            </div>
            <p className="text-sm font-medium text-white mb-1">No results found</p>
            <p className="text-xs text-gray-500 text-center">
              Try different keywords or press Enter for full search
            </p>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
