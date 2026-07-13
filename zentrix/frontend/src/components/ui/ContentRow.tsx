import { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import ContentCard from './ContentCard';
import SkeletonCard from './SkeletonCard';
import type { ContentType } from '@/types';

export interface ContentItem {
  id: number | string;
  type: ContentType;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string;
  rating?: number;
  releaseYear?: string;
  episodeCount?: number;
  format?: string;
  accentColor?: string | null;
}

interface ContentRowProps {
  title: string;
  subtitle?: string;
  items: ContentItem[];
  isLoading?: boolean;
  viewAllHref?: string;
  icon?: React.ReactNode;
  wide?: boolean;
  showRanking?: boolean;
}

export default function ContentRow({
  title, subtitle, items, isLoading = false,
  viewAllHref, icon, wide = false, showRanking = false,
}: ContentRowProps) {
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
    el.scrollBy({ left: dir === 'right' ? 340 : -340, behavior: 'smooth' });
  };

  const cardWidth = wide ? 200 : 120;

  if (isLoading) {
    return (
      <section>
        <div className="flex items-center gap-2 px-4 md:px-6 lg:px-8 mb-3">
          <div className="skeleton w-4 h-4 rounded-md" />
          <div className="skeleton h-4 w-36 rounded-full" />
        </div>
        <div className="flex gap-3 overflow-hidden px-4 md:px-6 lg:px-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} wide={wide} />
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
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Section Header ── */}
      <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 mb-3">
        <div className="section-header">
          {icon && (
            <span className="text-primary-400 flex-shrink-0">{icon}</span>
          )}
          <div className="min-w-0">
            <h2 className="section-title truncate">{title}</h2>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          {/* Scroll arrows – desktop only */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className="btn-icon !w-8 !h-8 !min-w-8 disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label="Scroll left"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className="btn-icon !w-8 !h-8 !min-w-8 disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label="Scroll right"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {viewAllHref && (
            <Link
              to={viewAllHref}
              className="flex items-center gap-1 text-xs font-semibold transition-colors duration-150 whitespace-nowrap"
              style={{ color: 'var(--primary-light)' }}
            >
              All
              <ChevronRight size={13} />
            </Link>
          )}
        </div>
      </div>

      {/* ── Scroll Container ── */}
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
          className="scroll-row px-4 md:px-6 lg:px-8"
        >
          {items.map((item, idx) => (
            <ContentCard
              key={`${item.type}-${item.id}`}
              {...item}
              wide={wide}
              rank={showRanking ? idx + 1 : undefined}
            />
          ))}

          {/* View-all card */}
          {viewAllHref && items.length >= 6 && (
            <Link
              to={viewAllHref}
              className="flex-shrink-0 rounded-xl flex flex-col items-center justify-center gap-2 text-center
                         cursor-pointer group transition-all duration-200"
              style={{
                width: cardWidth,
                height: wide ? 120 : 178,
                background: 'var(--glass)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
                style={{ background: 'rgba(123,111,240,0.12)', border: '1px solid rgba(123,111,240,0.2)' }}>
                <ChevronRight size={18} className="text-primary-400" />
              </div>
              <span className="text-2xs font-semibold text-gray-500 group-hover:text-gray-300 transition-colors px-2">
                View All
              </span>
            </Link>
          )}
        </div>
      </div>
    </motion.section>
  );
}
