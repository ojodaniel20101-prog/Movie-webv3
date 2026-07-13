import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bookmark, Heart, Clock, Trash2, Play,
  Star, Film, Tv, Sparkles, X, Search
} from 'lucide-react';
import { getPosterUrl, getBackdropUrl } from '@/services/tmdb';
import { useWatchlistStore } from '@/store/useWatchlistStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import type { ContentType, WatchlistItem, HistoryItem } from '@/types';

type ActiveTab = 'watchlist' | 'favorites' | 'history';

const typeIcon = (type: ContentType) => {
  if (type === 'movie') return <Film size={11} />;
  if (type === 'anime') return <Sparkles size={11} />;
  return <Tv size={11} />;
};

const typeBadgeClass = (type: ContentType) => {
  if (type === 'movie') return 'bg-accent-pink/20 text-pink-400 border border-accent-pink/20';
  if (type === 'anime') return 'bg-primary-500/20 text-primary-300 border border-primary-500/20';
  return 'bg-accent-teal/20 text-teal-400 border border-accent-teal/20';
};

function ContentListItem({
  item,
  onRemove,
}: {
  item: WatchlistItem;
  onRemove: () => void;
}) {
  const posterUrl = getPosterUrl(item.poster_path, 'w185');
  const detailPath =
    item.content_type === 'movie'
      ? `/details/movie/${item.content_id}`
      : item.content_type === 'anime'
      ? `/details/anime/${item.content_id}`
      : `/details/tv/${item.content_id}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, height: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-4 p-3 md:p-4 rounded-2xl bg-zx-s2 border border-white/[0.05] hover:border-white/10 transition-all group"
    >
      {/* Poster */}
      <Link to={detailPath} className="flex-shrink-0">
        <div className="w-14 md:w-16 aspect-[2/3] rounded-xl overflow-hidden bg-zx-s3">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film size={18} className="text-gray-700" />
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${typeBadgeClass(
              item.content_type
            )}`}
          >
            {typeIcon(item.content_type)}
            {item.content_type}
          </span>
          {item.vote_average > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-rating font-semibold">
              <Star size={10} fill="currentColor" />
              {item.vote_average.toFixed(1)}
            </span>
          )}
        </div>
        <Link to={detailPath}>
          <p className="font-semibold text-white text-sm md:text-base truncate hover:text-primary-300 transition-colors">
            {item.title}
          </p>
        </Link>
        {item.release_year && (
          <p className="text-xs text-gray-600 mt-0.5">{item.release_year}</p>
        )}
        {item.overview && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2 hidden md:block">
            {item.overview}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          to={
            item.content_type === 'movie'
              ? `/watch/movie/${item.content_id}`
              : item.content_type === 'anime'
              ? `/watch/anime/${item.content_id}?episode=1`
              : `/watch/tv/${item.content_id}?season=1&episode=1`
          }
        >
          <motion.div
            className="w-9 h-9 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center text-primary-400 hover:bg-primary-500/25 transition-all"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Play size={14} fill="currentColor" />
          </motion.div>
        </Link>
        <motion.button
          onClick={onRemove}
          className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/15 flex items-center justify-center text-red-500/60 hover:text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <X size={14} />
        </motion.button>
      </div>
    </motion.div>
  );
}

function HistoryListItem({
  item,
  onRemove,
}: {
  item: HistoryItem;
  onRemove: () => void;
}) {
  const posterUrl =
    getBackdropUrl(item.backdrop_path, 'w300') ||
    getPosterUrl(item.poster_path, 'w185');
  const progress =
    item.duration_seconds > 0
      ? Math.min((item.progress_seconds / item.duration_seconds) * 100, 100)
      : 0;
  const watchPath =
    item.content_type === 'movie'
      ? `/watch/movie/${item.content_id}`
      : item.content_type === 'anime'
      ? `/watch/anime/${item.content_id}?episode=${item.episode_number || 1}`
      : `/watch/tv/${item.content_id}?season=${item.season_number || 1}&episode=${
          item.episode_number || 1
        }`;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h}h ago`;
    if (d < 7) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-4 p-3 md:p-4 rounded-2xl bg-zx-s2 border border-white/[0.05] hover:border-white/10 transition-all group"
    >
      {/* Thumbnail */}
      <Link to={watchPath} className="flex-shrink-0">
        <div className="relative w-24 md:w-32 aspect-video rounded-xl overflow-hidden bg-zx-s3">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Play size={18} className="text-gray-700" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Play size={18} fill="white" className="text-white" />
          </div>
          {/* Progress bar */}
          {progress > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
              <div
                className="h-full bg-primary-400 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${typeBadgeClass(
              item.content_type
            )}`}
          >
            {typeIcon(item.content_type)}
            {item.content_type}
          </span>
          <span className="text-xs text-gray-600">{timeAgo(item.watched_at)}</span>
        </div>
        <p className="font-semibold text-white text-sm md:text-base truncate">
          {item.title}
        </p>
        {item.season_number && (
          <p className="text-xs text-gray-500 mt-0.5">
            S{item.season_number} E{item.episode_number}
            {item.episode_title ? ` · ${item.episode_title}` : ''}
          </p>
        )}
        {progress > 0 && (
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1 bg-white/10 rounded-full max-w-[120px]">
              <div
                className="h-full bg-primary-400 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-600">{Math.round(progress)}%</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link to={watchPath}>
          <motion.div
            className="w-9 h-9 rounded-xl bg-primary-500/15 border border-primary-500/25 flex items-center justify-center text-primary-400 hover:bg-primary-500/25 transition-all"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Play size={14} fill="currentColor" />
          </motion.div>
        </Link>
        <motion.button
          onClick={onRemove}
          className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/15 flex items-center justify-center text-red-500/60 hover:text-red-400 hover:bg-red-500/20 transition-all"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <X size={14} />
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('watchlist');
  const [searchFilter, setSearchFilter] = useState('');

  const { items: watchlistItems, favorites, removeFromWatchlist, removeFromFavorites } =
    useWatchlistStore();
  const { items: historyItems, removeFromHistory, clearHistory } = useHistoryStore();

  const tabs = [
    { key: 'watchlist' as ActiveTab, label: 'Watchlist', icon: Bookmark, count: watchlistItems.length },
    { key: 'favorites' as ActiveTab, label: 'Favorites', icon: Heart, count: favorites.length },
    { key: 'history' as ActiveTab, label: 'History', icon: Clock, count: historyItems.length },
  ];

  const filterItems = <T extends { title: string }>(items: T[]) =>
    searchFilter
      ? items.filter((i) => i.title.toLowerCase().includes(searchFilter.toLowerCase()))
      : items;

  const filteredWatchlist = filterItems(watchlistItems);
  const filteredFavorites = filterItems(favorites);
  const filteredHistory = filterItems(historyItems);

  const currentItems =
    activeTab === 'watchlist'
      ? filteredWatchlist
      : activeTab === 'favorites'
      ? filteredFavorites
      : filteredHistory;

  const isEmpty = currentItems.length === 0;

  return (
    <div className="min-h-screen pt-20 pb-safe">
      <div className="max-w-screen-lg mx-auto px-4 md:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display font-black text-3xl md:text-4xl text-white mb-1">
            My Library
          </h1>
          <p className="text-gray-500 text-sm">Your saved content and watch history</p>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scroll-row">
          {tabs.map(({ key, label, icon: Icon, count }) => (
            <motion.button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                activeTab === key
                  ? 'bg-primary-500/20 border-primary-500/30 text-primary-300'
                  : 'bg-zx-s2 border-white/[0.07] text-gray-400 hover:text-white hover:border-white/15'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Icon size={15} />
              {label}
              {count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-xs font-bold min-w-[20px] text-center ${
                    activeTab === key
                      ? 'bg-primary-500/30 text-primary-200'
                      : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {count}
                </span>
              )}
            </motion.button>
          ))}
        </div>

        {/* Search filter */}
        {currentItems.length > 3 && (
          <div className="relative mb-5">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none"
            />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={`Filter ${activeTab}...`}
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-zx-s2 border border-white/[0.07] text-sm text-white placeholder-gray-700 outline-none focus:border-primary-500/40 transition-all"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* Clear history button */}
        {activeTab === 'history' && historyItems.length > 0 && (
          <div className="flex justify-end mb-4">
            <motion.button
              onClick={clearHistory}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/15 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Trash2 size={13} />
              Clear history
            </motion.button>
          </div>
        )}

        {/* Content */}
        <AnimatePresence mode="wait">
          {isEmpty ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-24"
            >
              <div className="w-24 h-24 rounded-3xl bg-zx-s2 border border-white/[0.05] flex items-center justify-center mx-auto mb-6">
                {activeTab === 'watchlist' ? (
                  <Bookmark size={36} className="text-gray-700" />
                ) : activeTab === 'favorites' ? (
                  <Heart size={36} className="text-gray-700" />
                ) : (
                  <Clock size={36} className="text-gray-700" />
                )}
              </div>
              <p className="font-display font-bold text-xl text-white mb-2">
                {activeTab === 'watchlist'
                  ? 'Your watchlist is empty'
                  : activeTab === 'favorites'
                  ? 'No favorites yet'
                  : searchFilter
                  ? 'No results found'
                  : 'No watch history'}
              </p>
              <p className="text-gray-500 text-sm mb-6">
                {activeTab === 'history'
                  ? 'Start watching to track your progress'
                  : 'Browse content and save what you want to watch'}
              </p>
              <Link to="/" className="btn-primary inline-flex text-sm py-2.5 px-6">
                <Play size={15} />
                Browse Content
              </Link>
            </motion.div>
          ) : (
            <motion.div
              key={`list-${activeTab}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <AnimatePresence>
                {activeTab === 'history'
                  ? (filteredHistory as HistoryItem[]).map((item) => (
                      <HistoryListItem
                        key={item.id}
                        item={item}
                        onRemove={() =>
                          removeFromHistory(item.content_id, item.content_type)
                        }
                      />
                    ))
                  : (activeTab === 'watchlist' ? filteredWatchlist : filteredFavorites).map(
                      (item) => (
                        <ContentListItem
                          key={item.id}
                          item={item}
                          onRemove={() =>
                            activeTab === 'watchlist'
                              ? removeFromWatchlist(item.content_id, item.content_type)
                              : removeFromFavorites(item.content_id, item.content_type)
                          }
                        />
                      )
                    )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
