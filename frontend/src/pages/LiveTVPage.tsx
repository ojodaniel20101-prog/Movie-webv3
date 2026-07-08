import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, SlidersHorizontal, X, Star, Radio, Globe2 } from 'lucide-react';
import { liveTvApi } from '@/services/iptv';
import { useLiveTvStore } from '@/store/useLiveTvStore';
import { fmtChannelCount } from '@/lib/livetv';
import { liveCategoryIcon } from '@/components/livetv/categoryIcons';
import ChannelGrid from '@/components/livetv/ChannelGrid';
import ChannelRow from '@/components/livetv/ChannelRow';

const LIMIT = 60;

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function LiveTVPage() {
  const [offset, setOffset]           = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery]             = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const debQuery  = useDebounce(query, 300);

  const liveCat        = useLiveTvStore(s => s.liveCat);
  const liveCountry    = useLiveTvStore(s => s.liveCountry);
  const liveSort        = useLiveTvStore(s => s.liveSort);
  const setLiveCat      = useLiveTvStore(s => s.setLiveCat);
  const setLiveCountry  = useLiveTvStore(s => s.setLiveCountry);
  const setLiveSort      = useLiveTvStore(s => s.setLiveSort);
  const favourites       = useLiveTvStore(s => s.favourites);

  useEffect(() => { setOffset(0); }, [liveCat, liveCountry, liveSort, debQuery]);

  const isSearching = debQuery.trim().length > 0;

  const { data, isLoading } = useQuery({
    queryKey: ['live-channels', liveCat, liveCountry, liveSort, offset, debQuery],
    queryFn:  () => liveTvApi.channels({
      q: isSearching ? debQuery.trim() : undefined,
      category: liveCat, country: liveCountry, sort: liveSort,
      limit: LIMIT, offset,
    }),
    placeholderData: prev => prev,
  });

  const { data: categories } = useQuery({
    queryKey: ['live-categories'],
    queryFn:  liveTvApi.categories,
    staleTime: Infinity,
  });

  const { data: countries } = useQuery({
    queryKey: ['live-countries'],
    queryFn:  liveTvApi.countries,
    staleTime: Infinity,
  });

  // Favourite channels preview row (only fetched when favourites exist)
  const { data: favData } = useQuery({
    queryKey: ['live-favs-preview', favourites],
    queryFn:  () => liveTvApi.channels({ limit: 200 }),
    enabled:  favourites.length > 0 && offset === 0 && !isSearching,
    staleTime: 60_000,
  });
  const favChannels = (favData?.items ?? []).filter(ch => favourites.includes(ch.id));

  const hasActiveFilter = liveCat !== 'all' || liveCountry !== 'all';

  const clearSearch = useCallback(() => { setQuery(''); searchRef.current?.focus(); }, []);

  return (
    <div className="min-h-dvh pt-20 pb-safe">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="px-4 md:px-6 lg:px-8 mb-5">
        <div className="flex items-center gap-2.5 mb-1">
          <Radio size={20} className="text-primary-400" />
          <h1 className="font-display font-black text-2xl text-white">Live TV</h1>
        </div>
        <p className="text-sm text-gray-600">
          {isLoading ? 'Loading…' : `${data?.total?.toLocaleString() ?? 0} channels worldwide`}
        </p>
      </div>

      {/* ── Search bar ───────────────────────────────────────── */}
      <div className="px-4 md:px-6 lg:px-8 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search 15,000+ channels…"
            className="input-field pl-10 pr-10"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button onClick={clearSearch} aria-label="Clear search" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Category tabs + filter toggle ───────────────────── */}
      {!isSearching && (
        <div className="mb-2">
          <div className="flex items-center gap-2 px-4 md:px-6 lg:px-8 mb-3">
            <div className="scroll-row flex-1">
              {(categories ?? []).map(cat => {
                const Icon = liveCategoryIcon(cat.icon);
                const active = liveCat === cat.id;
                return (
                  <motion.button
                    key={cat.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setLiveCat(cat.id)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      active
                        ? 'bg-primary-500/20 border-primary-500/30 text-primary-300'
                        : 'bg-zx-s2 border-white/[0.07] text-gray-400 hover:text-white hover:border-white/15'
                    }`}
                  >
                    <Icon size={14} className="flex-shrink-0" />
                    {cat.label}
                  </motion.button>
                );
              })}
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              aria-label="Toggle country filter"
              className="btn-icon flex-shrink-0"
              style={(showFilters || hasActiveFilter) ? { background: 'rgba(123,111,240,0.18)', border: '1px solid rgba(123,111,240,0.3)', color: 'var(--primary-light)' } : {}}
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>

          {/* Country filter (collapsible) */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="px-4 md:px-6 lg:px-8 pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-gray-600 text-xs font-semibold uppercase tracking-wider">Country</span>
                    {liveCountry !== 'all' && (
                      <button onClick={() => setLiveCountry('all')} className="text-primary-400 text-xs flex items-center gap-0.5 hover:text-primary-300">
                        <X size={11} /> Clear
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto scroll-row pb-1">
                    <button
                      onClick={() => setLiveCountry('all')}
                      className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                        liveCountry === 'all' ? 'bg-primary-500/20 border-primary-500/30 text-primary-300' : 'bg-zx-s2 border-white/[0.07] text-gray-500 hover:text-white'
                      }`}
                    >
                      <Globe2 size={12} /> All
                    </button>
                    {countries?.slice(0, 50).map(c => (
                      <button
                        key={c.code}
                        onClick={() => setLiveCountry(c.code.toLowerCase())}
                        className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border font-medium transition-all whitespace-nowrap ${
                          liveCountry === c.code.toLowerCase() ? 'bg-primary-500/20 border-primary-500/30 text-primary-300' : 'bg-zx-s2 border-white/[0.07] text-gray-500 hover:text-white'
                        }`}
                      >
                        {c.flag} {c.code} <span className="text-gray-700 ml-1">{fmtChannelCount(c.count)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Favourites row ───────────────────────────────────── */}
      {!isSearching && offset === 0 && favChannels.length > 0 && (
        <ChannelRow title="My Favourites" icon={<Star size={16} className="fill-current" />} channels={favChannels} />
      )}

      {/* ── Sort control ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 mb-3">
        <p className="text-xs text-gray-600">
          {isSearching
            ? (isLoading ? 'Searching…' : `${data?.total?.toLocaleString() ?? 0} results for "${debQuery}"`)
            : '\u00A0'}
        </p>
        <select
          value={liveSort}
          onChange={e => setLiveSort(e.target.value)}
          className="text-xs text-gray-400 bg-zx-s2 border border-white/[0.07] rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
        >
          <option value="name">A–Z</option>
          <option value="quality">Quality</option>
        </select>
      </div>

      {/* ── Channel grid ─────────────────────────────────────── */}
      <div className="px-4 md:px-6 lg:px-8">
        <ChannelGrid
          channels={data?.items ?? []}
          loading={isLoading}
          total={data?.total ?? 0}
          offset={offset}
          limit={LIMIT}
          onPage={setOffset}
        />
      </div>
    </div>
  );
}
