import { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import CineverseCard from './CineverseCard';
import SkeletonCard from './SkeletonCard';
import type { ContentType } from '@/types';

export interface CineverseItem {
  id: number | string;
  type: ContentType;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  rating?: number;
  releaseYear?: string;
  platform?: string;
  genre?: string;
}

interface CineverseContentRowProps {
  title: string;
  subtitle?: string;
  items: CineverseItem[];
  isLoading?: boolean;
  viewAllHref?: string;
  icon?: React.ReactNode;
  accentColor?: string;
}

export default function CineverseContentRow({
  title, subtitle, items, isLoading = false,
  viewAllHref, icon, accentColor = '#FF2D2D',
}: CineverseContentRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'right' ? 420 : -420, behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <section className="mb-6">
        <div className="flex items-center gap-2 px-4 md:px-6 lg:px-8 mb-3">
          <div className="w-1 h-5 rounded-full" style={{ background: accentColor }} />
          <div className="skeleton h-4 w-36 rounded-full" />
          <div className="ml-auto skeleton h-3 w-12 rounded-full" />
        </div>
        <div className="flex gap-3 overflow-hidden px-4 md:px-6 lg:px-8">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonCard key={i} wide={false} />
          ))}
        </div>
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mb-6"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Red accent bar like cinverse */}
          <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: accentColor }} />
          {icon && (
            <span className="text-primary-400 flex-shrink-0">{icon}</span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">{title}</h2>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          {/* Scroll arrows */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className="w-8 h-8 rounded-full flex items-center justify-center
                         bg-white/5 border border-white/10 text-white/60
                         hover:bg-white/10 hover:text-white
                         disabled:opacity-20 disabled:cursor-not-allowed
                         transition-all duration-200"
              aria-label="Scroll left"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className="w-8 h-8 rounded-full flex items-center justify-center
                         bg-white/5 border border-white/10 text-white/60
                         hover:bg-white/10 hover:text-white
                         disabled:opacity-20 disabled:cursor-not-allowed
                         transition-all duration-200"
              aria-label="Scroll right"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {viewAllHref && (
            <Link
              to={viewAllHref}
              className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-white transition-colors duration-150 whitespace-nowrap"
            >
              More
              <ChevronRight size={13} />
            </Link>
          )}
        </div>
      </div>

      {/* Scroll Container */}
      <div className="relative">
        {/* Left fade edge */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none hidden md:block"
            style={{ background: 'linear-gradient(to right, var(--bg), transparent)' }} />
        )}
        {/* Right fade edge */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to left, var(--bg), transparent)' }} />
        )}

        <div
          ref={rowRef}
          onScroll={checkScroll}
          className="flex gap-3 overflow-x-auto px-4 md:px-6 lg:px-8 pb-2
                     scrollbar-hide scroll-smooth"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {items.map((item) => (
            <CineverseCard
              key={`${item.type}-${item.id}`}
              {...item}
            />
          ))}

          {/* View-all card */}
          {viewAllHref && items.length >= 6 && (
            <Link
              to={viewAllHref}
              className="flex-shrink-0 rounded-xl flex flex-col items-center justify-center gap-2 text-center
                         cursor-pointer group transition-all duration-200 hover:bg-white/10"
              style={{
                width: 140,
                height: 210,
                background: 'var(--glass)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200"
                style={{ background: 'rgba(123,111,240,0.12)', border: '1px solid rgba(123,111,240,0.2)' }}>
                <ChevronRight size={20} className="text-primary-400" />
              </div>
              <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-300 transition-colors px-2">
                View All
              </span>
            </Link>
          )}
        </div>
      </div>
    </motion.section>
  );
}
