import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clapperboard, RefreshCw, Home, ChevronDown } from 'lucide-react';

import CategoryNav        from '@/components/trailers/CategoryNav';
import TrailerCard        from '@/components/trailers/TrailerCard';
import { useTrailerFeed } from '@/hooks/useTrailerFeed';
import { fetchTrailers, type TrailerItem, type TrailerCategory } from '@/services/trailers';

// ─── How many cards from the end triggers a pre-fetch ────────────────────────
const PREFETCH_THRESHOLD = 3;

// ─── Max time before auto-scroll fires if YouTube API doesn't send ended ─────
// 3.5 min covers 99% of trailers. User can always scroll manually.
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
        style={{ background: 'linear-gradient(135deg,#7B6FF0,#22D3EE)' }}
        whileTap={{ scale: 0.95 }}>
        <RefreshCw size={14} /> Retry
      </motion.button>
    </div>
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
    if (loadingMoreRef.current && pg > 1) return; // debounce
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
      // Still has more if we got a full page back
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

  // ── FIX 2: activeIdx-based infinite scroll ────────────────────────────────
  // The scroll-snap container means the sentinel div is unreachable via snapping.
  // Instead we watch activeIdx and pre-fetch when nearing the end of the list.
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

  // ── Track active card from scroll position ────────────────────────────────
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

  // ── FIX 1 (fallback): Timer-based auto-scroll ─────────────────────────────
  // When the YouTube API fires the ended event → scrollToNext() is called immediately.
  // When the YouTube API stays silent (unreliable on some devices) →
  //   this timer fires after AUTO_SCROLL_FALLBACK_MS and scrolls anyway.
  // The timer is reset every time the active card changes.
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

  // Start/reset the fallback timer whenever the active card changes
  useEffect(() => {
    clearAutoScrollTimer();
    if (!autoScroll || loading) return;
    autoScrollTimerRef.current = setTimeout(() => {
      scrollToNext();
    }, AUTO_SCROLL_FALLBACK_MS);
    return clearAutoScrollTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, autoScroll, loading]);

  // Cancel timer when user manually scrolls
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleManualScroll = () => {
      // If user initiated scroll (touch), cancel the pending timer
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
            background:     autoScroll ? 'rgba(123,111,240,0.35)' : 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(12px)',
            border:         autoScroll ? '1px solid rgba(123,111,240,0.5)' : '1px solid rgba(255,255,255,0.1)',
            color:          autoScroll ? '#c4b5fd' : 'rgba(255,255,255,0.6)',
          }}
          whileTap={{ scale: 0.92 }}>
          <ChevronDown size={13} className={autoScroll ? 'text-primary-300' : 'text-white/50'} />
          {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
        </motion.button>
      </div>

      {/* ── Category nav ─────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none">
        <div className="pointer-events-auto">
          <CategoryNav active={category} onChange={handleCategoryChange} />
        </div>
      </div>

      {/* ── Feed ─────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="w-screen h-full overflow-y-scroll scrollbar-hide"
        style={{
          scrollSnapType:          'y mandatory',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior:      'contain',
          scrollbarWidth:          'none',        // Firefox
          msOverflowStyle:         'none',        // IE/Edge
        }}
      >
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="skeletons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {[0,1,2].map(i => (
                <div key={i} className="w-screen flex-shrink-0"
                  style={{ height: '100dvh', scrollSnapAlign: 'start' }}>
                  <TrailerSkeleton />
                </div>
              ))}
            </motion.div>
          ) : error || items.length === 0 ? (
            <div key="empty" className="w-screen flex-shrink-0 flex items-center justify-center"
              style={{ height: '100dvh' }}>
              <EmptyState onRetry={() => loadPage(category, 1, true)} />
            </div>
          ) : (
            <motion.div key={`feed-${category}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              {items.map((item, idx) => (
                <div key={item.id} className="w-screen flex-shrink-0 relative overflow-hidden"
                  style={{ height: '100dvh', scrollSnapAlign: 'start' }}>
                  <TrailerCard
                    item={item}
                    isActive={idx === activeIdx}
                    feedControls={feedControls}
                    onEnded={idx === activeIdx ? scrollToNext : undefined}
                  />
                </div>
              ))}

              {/* Loading more — must be a full snap card so it's reachable */}
              {loadingMore && (
                <div className="w-screen flex-shrink-0 flex items-center justify-center"
                  style={{ height: '100dvh', scrollSnapAlign: 'start' }}>
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin" />
                    <p className="text-gray-500 text-sm">Loading more trailers…</p>
                  </div>
                </div>
              )}

              {/* End of feed — full snap card + explore more button */}
              {!hasMore && !loadingMore && items.length > 0 && (
                <div className="w-screen flex-shrink-0 flex items-center justify-center"
                  style={{ height: '100dvh', scrollSnapAlign: 'start' }}>
                  <div className="text-center px-8">
                    <Clapperboard size={40} className="text-white/10 mx-auto mb-4" />
                    <p className="text-white font-semibold">You've seen it all!</p>
                    <p className="text-gray-600 text-sm mt-1 mb-5">Switch category for more trailers</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {(['trending','movies','anime','horror','action'] as TrailerCategory[]).map(cat => (
                        <button key={cat} onClick={() => handleCategoryChange(cat)}
                          className="px-4 py-2 rounded-full text-xs font-semibold text-white/70 capitalize transition-all hover:text-white"
                          style={{ background: 'rgba(123,111,240,0.2)', border: '1px solid rgba(123,111,240,0.3)' }}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {deepContent && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs text-white/80"
          style={{ background: 'rgba(123,111,240,0.3)', border: '1px solid rgba(123,111,240,0.4)', backdropFilter: 'blur(12px)' }}>
          Showing linked trailer
        </div>
      )}
    </div>
  );
}
