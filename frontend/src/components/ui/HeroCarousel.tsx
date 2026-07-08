import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Info, Star, ChevronLeft, ChevronRight, Pause } from 'lucide-react';
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
  trailerKey?: string | null;
  tagline?: string;
}

interface HeroCarouselProps {
  items: HeroItem[];
  isLoading?: boolean;
}

/* CSS-only particles — no JS animation, no extra GPU compositing layers */
const PARTICLES = [
  { id: 0, x: 15, y: 20, size: 80,  color: 'rgba(0, 212, 255, 0.07)', duration: '12s', delay: '0s' },
  { id: 1, x: 75, y: 60, size: 100, color: 'rgba(139, 92, 246, 0.06)', duration: '15s', delay: '3s' },
  { id: 2, x: 45, y: 75, size: 60,  color: 'rgba(6, 255, 165, 0.05)',  duration: '10s', delay: '6s' },
  { id: 3, x: 85, y: 15, size: 70,  color: 'rgba(0, 212, 255, 0.05)', duration: '18s', delay: '1s' },
  { id: 4, x: 30, y: 50, size: 90,  color: 'rgba(139, 92, 246, 0.04)', duration: '14s', delay: '4s' },
];

const TRENDING_TAGS = ['#Trending', '#NewRelease', '#TopRated', '#Anime', '#Action', '#Thriller'];

const TYPE_LABEL: Record<ContentType, string> = {
  movie: 'MOVIE',
  tv:    'TV SERIES',
  anime: 'ANIME',
};

export default function HeroCarousel({ items, isLoading = false }: HeroCarouselProps) {
  const [current,  setCurrent]  = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const totalItems = items.length;

  const goTo   = useCallback((i: number) => setCurrent(i), []);
  const goNext = useCallback(() => setCurrent(c => (c + 1) % totalItems), [totalItems]);
  const goPrev = useCallback(() => setCurrent(c => (c - 1 + totalItems) % totalItems), [totalItems]);

  // Auto-advance
  useEffect(() => {
    if (isPaused || !totalItems) return;
    timerRef.current = setTimeout(goNext, 8000);
    return () => clearTimeout(timerRef.current);
  }, [current, isPaused, goNext, totalItems]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  if (isLoading || !items.length) {
    return (
      <div
        className="relative w-full flex items-center justify-center overflow-hidden"
        style={{ height: '100vh', minHeight: '600px', maxHeight: '900px', background: 'linear-gradient(135deg, #050816 0%, #0B1220 100%)' }}
      >
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-full border-2 animate-spin mx-auto mb-4"
            style={{ borderColor: 'rgba(0, 212, 255, 0.5)', borderTopColor: 'transparent' }}
          />
          <p className="text-sm" style={{ color: '#8899AA' }}>Loading content...</p>
        </div>
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
      role="region"
      aria-label="Featured content"
      className="relative w-full overflow-hidden select-none"
      style={{ height: '70vh', minHeight: '420px', maxHeight: '640px' }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ── Background Image ── */}
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
              style={{ filter: 'brightness(0.5) saturate(1.2)' }}
              decoding="async"
            />
          ) : (
            <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #050816, #0B1220)' }} />
          )}

          {/* Left-to-right gradient */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(90deg, rgba(5,8,22,0.95) 0%, rgba(5,8,22,0.6) 50%, rgba(5,8,22,0.2) 100%)' }}
          />
          {/* Bottom fade */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(5,8,22,0.8) 80%, #050816 100%)' }}
          />
          {/* Vignette */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(5,8,22,0.4) 100%)' }}
          />
        </motion.div>
      </AnimatePresence>

      {/* ── CSS-only Particles ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PARTICLES.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full zx-particle-float"
            style={{
              left: `${p.x}%`,
              top:  `${p.y}%`,
              width:  p.size,
              height: p.size,
              background: p.color,
              animationDuration: p.duration,
              animationDelay:    p.delay,
            }}
          />
        ))}
      </div>

      {/* ── Scan lines ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.015]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,255,0.1) 2px, rgba(0,212,255,0.1) 4px)' }}
      />

      {/* ── Main Content ── */}
      <div className="relative h-full flex items-center pb-4 pt-16">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`content-${current}`}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
              >
                {/* Type badge + rating + year */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center gap-2 mb-4"
                >
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-wider"
                    style={{
                      background: 'rgba(0, 212, 255, 0.12)',
                      border: '1px solid rgba(0, 212, 255, 0.3)',
                      color: '#00D4FF',
                    }}
                  >
                    {TYPE_LABEL[item.type]}
                  </span>
                  {item.rating && item.rating > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-current" style={{ color: '#FFD700' }} />
                      <span className="text-sm font-bold" style={{ color: '#FFD700' }}>
                        {item.rating.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {item.releaseYear && (
                    <span className="text-sm" style={{ color: '#8899AA' }}>{item.releaseYear}</span>
                  )}
                </motion.div>

                {/* Title */}
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="font-black leading-tight mb-4"
                  style={{
                    fontSize: 'clamp(2rem, 5vw, 3.75rem)',
                    letterSpacing: '-0.03em',
                    color: '#F0F4FF',
                    textShadow: '0 2px 20px rgba(0,0,0,0.5)',
                  }}
                >
                  {item.title}
                </motion.h1>

                {/* Genres */}
                {item.genres && item.genres.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center gap-2 mb-4 flex-wrap"
                  >
                    {item.genres.slice(0, 3).map(g => (
                      <span
                        key={g}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: '#8899AA',
                          fontWeight: 600,
                        }}
                      >
                        {g}
                      </span>
                    ))}
                  </motion.div>
                )}

                {/* Overview */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="leading-relaxed mb-6 hidden sm:block"
                  style={{
                    fontSize: 'clamp(0.82rem, 1.5vw, 0.95rem)',
                    color: 'rgba(240, 244, 255, 0.7)',
                    maxWidth: '520px',
                  }}
                >
                  {item.overview.length > 200
                    ? `${item.overview.slice(0, 200)}…`
                    : item.overview}
                </motion.p>

                {/* CTA Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center gap-3 flex-wrap"
                >
                  <Link to={`/watch/${item.type}/${item.id}`}>
                    <motion.div
                      className="flex items-center gap-2 px-6 py-3 rounded-xl cursor-pointer font-bold text-sm"
                      style={{
                        background: 'linear-gradient(135deg, #00D4FF, #8B5CF6)',
                        color: '#050816',
                        boxShadow: '0 8px 30px rgba(0, 212, 255, 0.3)',
                      }}
                      whileHover={{ scale: 1.03, boxShadow: '0 12px 40px rgba(0, 212, 255, 0.45)' }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Watch Now
                    </motion.div>
                  </Link>
                  <Link to={detailPath}>
                    <motion.div
                      className="flex items-center gap-2 px-6 py-3 rounded-xl cursor-pointer font-semibold text-sm"
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#F0F4FF',
                        backdropFilter: 'blur(8px)',
                      }}
                      whileHover={{ background: 'rgba(255,255,255,0.14)' }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <Info className="w-4 h-4" />
                      More Info
                    </motion.div>
                  </Link>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Trending Tags ── */}
      <div className="absolute px-4 sm:px-6 lg:px-8 w-full max-w-screen-2xl mx-auto left-0 right-0"
        style={{ bottom: '5.5rem' }}>
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <span className="text-xs flex-shrink-0 font-semibold" style={{ color: '#8899AA' }}>
            Trending:
          </span>
          {TRENDING_TAGS.map((tag, i) => (
            <motion.span
              key={tag}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.05 }}
              className="text-xs px-3 py-1 rounded-full flex-shrink-0 cursor-pointer"
              style={{
                background: 'rgba(0, 212, 255, 0.06)',
                border: '1px solid rgba(0, 212, 255, 0.15)',
                color: '#8899AA',
                fontWeight: 600,
              }}
            >
              {tag}
            </motion.span>
          ))}
        </div>
      </div>

      {/* ── Pagination Dots ── */}
      {totalItems > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
          {items.slice(0, 8).map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="rounded-full transition-all duration-300"
              style={{
                width:  i === current ? 24 : 6,
                height: 6,
                background: i === current ? '#00D4FF' : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Prev / Next Arrows ── */}
      {totalItems > 1 && (
        <>
          <motion.button
            onClick={goPrev}
            aria-label="Previous"
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-xl z-10"
            style={{
              background: 'rgba(5, 8, 22, 0.6)',
              border: '1px solid rgba(0, 212, 255, 0.2)',
              color: '#F0F4FF',
              backdropFilter: 'blur(8px)',
            }}
            whileHover={{ background: 'rgba(0, 212, 255, 0.1)' }}
            whileTap={{ scale: 0.9 }}
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
          <motion.button
            onClick={goNext}
            aria-label="Next"
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-xl z-10"
            style={{
              background: 'rgba(5, 8, 22, 0.6)',
              border: '1px solid rgba(0, 212, 255, 0.2)',
              color: '#F0F4FF',
              backdropFilter: 'blur(8px)',
            }}
            whileHover={{ background: 'rgba(0, 212, 255, 0.1)' }}
            whileTap={{ scale: 0.9 }}
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        </>
      )}

      {/* ── Pause indicator ── */}
      {isPaused && (
        <div className="absolute top-4 right-4 hidden md:flex items-center gap-1.5 text-white/30 text-xs">
          <Pause size={10} />
          <span>Paused</span>
        </div>
      )}

      {/* ── Progress bar ── */}
      {!isPaused && (
        <motion.div
          key={`progress-${current}`}
          className="absolute bottom-0 left-0 h-[2px] z-10"
          style={{ background: 'linear-gradient(90deg, #00D4FF, #8B5CF6)' }}
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 8, ease: 'linear' }}
        />
      )}
    </div>
  );
}
