import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clapperboard, RefreshCw, Home, ChevronDown } from 'lucide-react';

import CategoryNav        from '@/components/trailers/CategoryNav';
import TrailerCard        from '@/components/trailers/TrailerCard';
import { useTrailerFeed } from '@/hooks/useTrailerFeed';
import { fetchTrailers, type TrailerItem, type TrailerCategory } from '@/services/trailers';

// ─── Category config with cinverse-style labels ──────────────────────────────
const CATEGORY_CONFIG: { id: TrailerCategory; label: string; description: string }[] = [
  { id: 'explore',  label: 'All Trailers',  description: 'Latest trailers from movies, TV & anime' },
  { id: 'movies',   label: 'Movies',        description: 'Blockbuster movie trailers' },
  { id: 'tv',       label: 'TV Series',     description: 'Binge-worthy TV show trailers' },
  { id: 'anime',    label: 'Anime',         description: 'Japanese animation trailers' },
  { id: 'action',   label: 'Action',        description: 'High-octane action trailers' },
  { id: 'horror',   label: 'Horror',        description: 'Scary movie & show trailers' },
  { id: 'comedy',   label: 'Comedy',        description: 'Laugh-out-loud trailers' },
  { id: 'scifi',    label: 'Sci-Fi',        description: 'Science fiction trailers' },
  { id: 'romance',  label: 'Romance',       description: 'Love story trailers' },
  { id: 'thriller', label: 'Thriller',      description: 'Edge-of-your-seat trailers' },
  { id: 'animation',label: 'Animation',     description: 'Animated movie & show trailers' },
  { id: 'upcoming', label: 'Coming Soon',   description: 'Upcoming releases' },
];

// ─── How many cards from the end triggers a pre-fetch ────────────────────────
const PREFETCH_THRESHOLD = 3;

// ─── Max time before auto-scroll fires if YouTube API doesn't send ended ─────
const AUTO_SCROLL_FALLBACK_MS = 3.5 * 60 * 1000;

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function TrailerSkeleton() {
  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent animate-pulse" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Clapperboard size={48} className="text-white/5" />
      </div>
      <div className="absolute bottom-0 left-0 right-16 p-4 pb-6 space-y-3">
        <div className="w-16 h-4 rounded-full bg-white/[0.07] animate-pulse" />
        <div className="w-3/4 h-6 rounded-xl bg-white/[0.07] animate-pulse" />
        <div className="w-1/2 h-3 rounded-lg bg-white/[0.05] animate-pulse" />
        <div className="flex gap-2 mt-1">
          {[1,2,3].map(i => <div key={i} className="w-14 h-4 rounded-full bg-white/[0.05] animate-pulse"/>)}
        </div>
        <div className="w-28 h-9 rounded-2xl bg-white/[0.07] animate-pulse mt-2" />
      </div>
      <div className="absolute right-3 bottom-36 flex flex-col gap-5">
        {[1,2,3,4,5].map(i => <div key={i} className="w-11 h-11 rounded-full bg-white/[0.07] animate-pulse"/>)}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Clapperboard size={56} className="text-white/10" />
      <div>
        <p className="text-white font-semibold text-lg">No trailers found</p>
        <p className="text-gray-500 text-sm mt-1">Try another category or refresh</p>
      </div>
      <motion.button onClick={onRetry}
        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(135deg,#FF2D2D,#FF4444)' }}
        whileTap={{ scale: 0.95 }}>
        <RefreshCw size={14} /> Retry
      </motion.button>
    </div>
  );
}

// ─── Category Header ──────────────────────────────────────────────────────────
function CategoryHeader({
  category,
  totalItems,
}: {
  category: TrailerCategory;
  totalItems: number;
}) {
  const config = CATEGORY_CONFIG.find(c => c.id === category);
  if (!config) return null;

  return (
    <motion.div
      key={category}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute top-16 left-4 right-4 z-30 pointer-events-none"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
          {config.label}
        </span>
        <span className="text-[10px] text-gray-600">·</span>
        <span className="text-[10px] text-gray-500">
          {totalItems} trailers
        </span>
      </div>
      <p className="text-xs text-gray-400">{config.description}</p>
    </motion.div>
  );
}

// ─── TrailersPage ─────────────────────────────────────────────────────────────
export default function TrailersPage() {
  const [searchParams]                = useSearchParams();
  const feedControls                  = useTrailerFeed();

  const [category,    setCategory]    = useState<TrailerCategory>('explore');
  const [items,       setItems]       = useState<TrailerItem[]>([]);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(false);
  const [hasMore,     setHasMore]     = useState(true);
  const [activeIdx,   setActiveIdx]   = useState(0);
  const [autoScroll,  setAutoScroll]  = useState(true);

  const containerRef       = useRef<HTMLDivElement>(null);
  const categoryRef        = useRef(category);
  const itemsRef           = useRef(items);
  const pageRef            = useRef(page);
  const hasMoreRef         = useRef(hasMore);
  const loadingMoreRef     = useRef(loadingMore);
  const loadingRef         = useRef(loading);
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollRef      = useRef(autoScroll);

  // Keep refs in sync
  categoryRef.current  = category;
  itemsRef.current     = items;
  pageRef.current      = page;
  hasMoreRef.current   = hasMore;
  loadingMoreRef.current = loadingMore;
  loadingRef.current   = loading;
  autoScrollRef.current = autoScroll;

  const deepContent = searchParams.get('content');

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadPage = useCallback(async (cat: TrailerCategory, pg: number, reset = false) => {
    if (loadingMoreRef.current && pg > 1) return;
    if (pg === 1) setLoading(true);
    else setLoadingMore(true);
    setError(false);
    try {
      const data = await fetchTrailers(cat, pg);
      if (reset || pg === 1) {
        setItems(data);
      } else {
        setItems(prev => {
          const ids = new Set(prev.map(i => i.id));
          return [...prev, ...data.filter(d => !ids.has(d.id))];
        });
      }
      setHasMore(data.length >= 8);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load on category change
  useEffect(() => {
    setPage(1);
    setActiveIdx(0);
    setHasMore(true);
    containerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    loadPage(category, 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // ActiveIdx-based infinite scroll
  useEffect(() => {
    const distFromEnd = itemsRef.current.length - 1 - activeIdx;
    if (
      distFromEnd <= PREFETCH_THRESHOLD &&
      hasMoreRef.current &&
      !loadingMoreRef.current &&
      !loadingRef.current &&
      itemsRef.current.length > 0
    ) {
      const next = pageRef.current + 1;
      setPage(next);
      loadPage(categoryRef.current, next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  // Track active card from scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handle = () => {
      const idx = Math.round(el.scrollTop / el.clientHeight);
      setActiveIdx(idx);
    };
    el.addEventListener('scroll', handle, { passive: true });
    return () => el.removeEventListener('scroll', handle);
  }, []);

  // Timer-based auto-scroll fallback
  const clearAutoScrollTimer = useCallback(() => {
    if (autoScrollTimerRef.current) {
      clearTimeout(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);

  const scrollToNext = useCallback(() => {
    if (!autoScrollRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const cardH   = el.clientHeight;
    const currIdx = Math.round(el.scrollTop / cardH);
    const nextIdx = currIdx + 1;
    if (nextIdx < itemsRef.current.length) {
      el.scrollTo({ top: nextIdx * cardH, behavior: 'smooth' });
    }
    clearAutoScrollTimer();
  }, [clearAutoScrollTimer]);

  useEffect(() => {
    clearAutoScrollTimer();
    if (!autoScroll || loading) return;
    autoScrollTimerRef.current = setTimeout(() => {
      scrollToNext();
    }, AUTO_SCROLL_FALLBACK_MS);
    return clearAutoScrollTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, autoScroll, loading]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleManualScroll = () => {
      clearAutoScrollTimer();
    };
    el.addEventListener('touchstart', handleManualScroll, { passive: true });
    return () => el.removeEventListener('touchstart', handleManualScroll);
  }, [clearAutoScrollTimer]);

  const handleCategoryChange = (cat: TrailerCategory) => {
    if (cat === category) return;
    clearAutoScrollTimer();
    setCategory(cat);
    setActiveIdx(0);
  };

  return (
    <div className="fixed inset-0 bg-black z-10 overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-start justify-between px-4 pt-3 pointer-events-none">
        <Link to="/" className="pointer-events-auto">
          <motion.div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/80"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}
            whileTap={{ scale: 0.92 }}>
            <Home size={13} /> Home
          </motion.div>
        </Link>

        <motion.button
          onClick={() => setAutoScroll(v => !v)}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
          style={{
            background:     autoScroll ? 'rgba(255,45,45,0.35)' : 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(12px)',
            border:         autoScroll ? '1px solid rgba(255,45,45,0.5)' : '1px solid rgba(255,255,255,0.1)',
            color:          autoScroll ? '#FF6B6B' : 'rgba(255,255,255,0.6)',
          }}
          whileTap={{ scale: 0.92 }}>
          {autoScroll ? 'Auto-Scroll ON' : 'Auto-Scroll OFF'}
        </motion.button>
      </div>

      {/* ── Category Header ─────────────────────────────────────────────── */}
      {!loading && items.length > 0 && (
        <CategoryHeader category={category} totalItems={items.length} />
      )}

      {/* ── Scroll container ────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="h-full overflow-y-auto snap-y snap-mandatory"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {loading && items.length === 0 ? (
          <div className="snap-start" style={{ height: '100dvh' }}>
            <TrailerSkeleton />
          </div>
        ) : error ? (
          <div className="snap-start" style={{ height: '100dvh' }}>
            <EmptyState onRetry={() => loadPage(category, 1, true)} />
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={`${item.id}-${idx}`}
              className="snap-start"
              style={{ height: '100dvh' }}
            >
              <TrailerCard
                item={item}
                isActive={idx === activeIdx}
                feedControls={feedControls}
                onEnded={scrollToNext}
              />
            </div>
          ))
        )}

        {/* Loading more */}
        {loadingMore && (
          <div className="snap-start" style={{ height: '100dvh' }}>
            <TrailerSkeleton />
          </div>
        )}

        {/* End of list */}
        {!hasMore && items.length > 0 && (
          <div className="snap-start flex items-center justify-center" style={{ height: '100dvh' }}>
            <div className="text-center">
              <Clapperboard size={32} className="text-white/10 mx-auto mb-3" />
              <p className="text-sm text-gray-500">You've seen all trailers</p>
              <p className="text-xs text-gray-600 mt-1">Check back later for more</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Category Navigation ─────────────────────────────────────────── */}
      <CategoryNav
        active={category}
        onChange={handleCategoryChange}
      />
    </div>
  );
}
