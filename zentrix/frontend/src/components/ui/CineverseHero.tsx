import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Info, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { getBackdropUrl } from '@/services/tmdb';
import type { ContentType } from '@/types';

interface HeroItem {
  id: number | string;
  type: ContentType;
  title: string;
  overview: string;
  backdropPath: string | null;
  posterPath: string | null;
  rating?: number;
  releaseYear?: string;
  genres?: string[];
  tagline?: string;
}

interface CineverseHeroProps {
  items: HeroItem[];
  isLoading?: boolean;
}

const GENRE_COLORS: Record<string, string> = {
  Action: '#FF2D2D',
  Adventure: '#22D3EE',
  Comedy: '#FCD34D',
  Crime: '#FB923C',
  Drama: '#A78BFA',
  Horror: '#DC2626',
  Thriller: '#F472B6',
  Romance: '#EC4899',
  Sci: '#2DD4BF',
  Fantasy: '#8B5CF6',
  Animation: '#06B6D4',
  Documentary: '#84CC16',
  Family: '#10B981',
  Mystery: '#6366F1',
  War: '#B45309',
  Western: '#D97706',
};

function getGenreColor(genre: string): string {
  for (const [key, color] of Object.entries(GENRE_COLORS)) {
    if (genre.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#6B7280';
}

export default function CineverseHero({ items, isLoading = false }: CineverseHeroProps) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const totalItems = items.length;

  const goNext = useCallback(() => setCurrent(c => (c + 1) % totalItems), [totalItems]);
  const goPrev = useCallback(() => setCurrent(c => (c - 1 + totalItems) % totalItems), [totalItems]);

  useEffect(() => {
    if (isPaused || !totalItems) return;
    timerRef.current = setTimeout(goNext, 8000);
    return () => clearTimeout(timerRef.current);
  }, [current, isPaused, goNext, totalItems]);

  if (isLoading || !items.length) {
    return (
      <div className="relative w-full overflow-hidden"
        style={{ height: '65vh', minHeight: '400px', maxHeight: '600px', background: 'var(--bg)' }}>
        <div className="absolute inset-0 skeleton" />
      </div>
    );
  }

  const item = items[current];
  const backdropUrl = getBackdropUrl(item.backdropPath, 'original');
  const detailPath =
    item.type === 'anime' ? `/details/anime/${item.id}` :
    item.type === 'movie' ? `/details/movie/${item.id}` :
    `/details/tv/${item.id}`;

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{ height: '65vh', minHeight: '400px', maxHeight: '600px' }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Image */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${current}`}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
        >
          {backdropUrl ? (
            <img
              src={backdropUrl}
              alt=""
              role="presentation"
              className="w-full h-full object-cover"
              style={{ filter: 'brightness(0.4) saturate(1.1)' }}
              decoding="async"
            />
          ) : (
            <div className="w-full h-full" style={{ background: 'var(--bg)' }} />
          )}

          {/* Gradient overlays - cinverse style */}
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(90deg, rgba(2,2,8,0.95) 0%, rgba(2,2,8,0.7) 30%, rgba(2,2,8,0.2) 70%, rgba(2,2,8,0.4) 100%)' }} />
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, transparent 50%, rgba(2,2,8,0.9) 90%, var(--bg) 100%)' }} />
        </motion.div>
      </AnimatePresence>

      {/* Content */}
      <div className="relative h-full flex items-end pb-8">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-xl">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`content-${current}`}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
              >
                {/* Genre tags */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center gap-2 mb-4 flex-wrap"
                >
                  {item.genres?.slice(0, 3).map(g => (
                    <span
                      key={g}
                      className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
                      style={{
                        background: `${getGenreColor(g)}25`,
                        border: `1px solid ${getGenreColor(g)}50`,
                        color: getGenreColor(g),
                      }}
                    >
                      {g}
                    </span>
                  ))}
                  {item.rating && item.rating > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md"
                      style={{
                        background: 'rgba(255,208,96,0.15)',
                        border: '1px solid rgba(255,208,96,0.3)',
                      }}>
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-bold text-yellow-400">
                        {item.rating.toFixed(1)}
                      </span>
                    </div>
                  )}
                </motion.div>

                {/* Title */}
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="font-black leading-tight mb-3"
                  style={{
                    fontSize: 'clamp(1.75rem, 4.5vw, 3.5rem)',
                    letterSpacing: '-0.02em',
                    color: '#FFFFFF',
                    textShadow: '0 2px 20px rgba(0,0,0,0.5)',
                  }}
                >
                  {item.title}
                </motion.h1>

                {/* Year */}
                {item.releaseYear && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-sm text-gray-400 mb-4"
                  >
                    {item.releaseYear}
                  </motion.p>
                )}

                {/* Overview */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="text-sm leading-relaxed mb-6 hidden sm:block text-gray-300 line-clamp-2"
                >
                  {item.overview}
                </motion.p>

                {/* Action Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center gap-3"
                >
                  <Link to={detailPath}>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white"
                      style={{
                        background: 'linear-gradient(135deg, #FF2D2D, #FF4444)',
                        boxShadow: '0 4px 20px rgba(255,45,45,0.4)',
                      }}
                    >
                      <Play size={16} fill="white" />
                      Watch Now
                    </motion.button>
                  </Link>
                  <Link to={detailPath}>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white/80
                                 bg-white/10 border border-white/10 hover:bg-white/15 hover:text-white transition-all"
                    >
                      <Info size={15} />
                      Trailer
                    </motion.button>
                  </Link>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Navigation arrows - bottom center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
        <button
          onClick={goPrev}
          className="w-8 h-8 rounded-full flex items-center justify-center
                     bg-black/40 border border-white/10 text-white/60
                     hover:bg-black/60 hover:text-white transition-all"
          aria-label="Previous"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Slide indicators */}
        <div className="flex items-center gap-1.5">
          {items.slice(0, 10).map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="transition-all duration-300 rounded-full"
              style={{
                width: i === current ? 20 : 6,
                height: 6,
                background: i === current ? '#FF2D2D' : 'rgba(255,255,255,0.3)',
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          className="w-8 h-8 rounded-full flex items-center justify-center
                     bg-black/40 border border-white/10 text-white/60
                     hover:bg-black/60 hover:text-white transition-all"
          aria-label="Next"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
