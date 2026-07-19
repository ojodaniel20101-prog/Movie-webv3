import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Bookmark, BookmarkCheck, Star } from 'lucide-react';
import { getPosterUrl, getBackdropUrl } from '@/services/tmdb';
import { useWatchlistStore } from '@/store/useWatchlistStore';
import type { ContentType } from '@/types';

interface ContentCardProps {
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
  wide?: boolean;
  rank?: number;
}

export default function ContentCard({
  id, type, title, posterPath, backdropPath,
  overview = '', rating = 0, releaseYear, episodeCount,
  format, accentColor, wide = false, rank,
}: ContentCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlistStore();

  const contentId = String(id);
  const inWatchlist = isInWatchlist(contentId, type);

  const detailPath =
    type === 'anime' ? `/details/anime/${id}` :
    type === 'movie' ? `/details/movie/${id}` :
    `/details/tv/${id}`;

  const imageUrl = wide
    ? (getBackdropUrl(backdropPath || null, 'w780') || getPosterUrl(posterPath || null, 'w500'))
    : getPosterUrl(posterPath || null, 'w342');

  const badgeClass: Record<ContentType, string> = {
    movie: 'badge-movie',
    tv:    'badge-tv',
    anime: 'badge-anime',
  };
  const typeLabel = format || (type === 'movie' ? 'Movie' : type === 'tv' ? 'TV' : 'Anime');

  const handleWatchlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inWatchlist) {
      removeFromWatchlist(contentId, type);
    } else {
      addToWatchlist({
        content_id: contentId,
        content_type: type,
        title,
        poster_path: posterPath || null,
        backdrop_path: backdropPath || null,
        overview,
        vote_average: rating,
        release_year: releaseYear || '',
      });
    }
  };

  const cardW = wide ? 180 : 110;
  const cardH = wide ? 108 : 165;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="flex-shrink-0"
      style={{ width: cardW }}
    >
      <Link to={detailPath} className="block group">
        <div
          className="content-card"
          style={{ width: cardW, height: cardH }}
        >
          {/* ── Image ── */}
          {!imgLoaded && !imgError && (
            <div className="absolute inset-0 skeleton" />
          )}

          {imageUrl && !imgError ? (
            <img
              src={imageUrl}
              alt={title}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ background: accentColor ? `${accentColor}18` : 'rgba(123,111,240,0.08)' }}>
              <span className="font-display font-bold text-2xs text-center text-white/40 px-2 leading-tight">
                {title}
              </span>
            </div>
          )}

          {/* ── Gradient overlay ── */}
          <div className="absolute inset-0 bg-gradient-card opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* ── Top badges ── */}
          {rank && rank <= 10 && (
            <div className="absolute top-2 left-2">
              <span className="text-2xs font-black text-white/70 leading-none"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                #{rank}
              </span>
            </div>
          )}
          {rating > 0 && (
            <div className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}>
              <Star size={8} className="text-yellow-400 fill-yellow-400" />
              <span className="text-2xs font-bold text-white">{rating.toFixed(1)}</span>
            </div>
          )}

          {/* ── Watchlist btn ── */}
          <motion.button
            onClick={handleWatchlistToggle}
            className="absolute top-1.5 right-1.5 w-8 h-8 rounded-lg flex items-center justify-center
                       opacity-0 group-hover:opacity-100 transition-all duration-200 z-20"
            style={{
              background: inWatchlist
                ? 'rgba(123,111,240,0.9)'
                : 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${inWatchlist ? 'rgba(123,111,240,0.4)' : 'rgba(255,255,255,0.15)'}`,
            }}
            whileTap={{ scale: 0.88 }}
            aria-label={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {inWatchlist
              ? <BookmarkCheck size={13} className="text-white" />
              : <Bookmark size={13} className="text-white" />
            }
          </motion.button>

          {/* ── Play hover overlay ── */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
            <motion.div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(123,111,240,0.88)', boxShadow: '0 0 20px rgba(123,111,240,0.5)' }}
              whileHover={{ scale: 1.1 }}
            >
              <Play size={16} className="text-white ml-0.5" fill="white" />
            </motion.div>
          </div>

          {/* ── Bottom gradient ── */}
          <div className="absolute bottom-0 inset-x-0 h-16"
            style={{ background: 'linear-gradient(to top, rgba(2,2,8,0.95), transparent)' }} />
        </div>

        {/* ── Title below card ── */}
        <div className="mt-1.5 px-0.5">
          <p className="text-xs font-semibold text-white/90 truncate leading-tight">
            {title}
          </p>
          {releaseYear && (
            <p className="text-2xs text-gray-500 mt-0.5">{releaseYear}</p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

/* ── Continue Watching card ──────────────────────────────── */
interface ContinueWatchingCardProps {
  id: number | string;
  type: ContentType;
  title: string;
  posterPath?: string | null;
  progress: number;
  episodeInfo?: string;
}

export function ContinueWatchingCard({
  id, type, title, posterPath, progress, episodeInfo,
}: ContinueWatchingCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const detailPath = type === 'anime' ? `/details/anime/${id}` : type === 'movie' ? `/details/movie/${id}` : `/details/tv/${id}`;
  const imageUrl = getBackdropUrl(posterPath || null, 'w780') || getPosterUrl(posterPath || null, 'w342');

  return (
    <Link to={detailPath} className="block group flex-shrink-0" style={{ width: 130 }}>
      <div className="relative rounded-xl overflow-hidden cursor-pointer"
        style={{ width: 130, height: 78 }}>
        {!imgLoaded && <div className="absolute inset-0 skeleton" />}
        {imageUrl && (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'} group-hover:scale-105`}
          />
        )}
        <div className="absolute inset-0 bg-gradient-card opacity-60" />

        {/* Play icon */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(123,111,240,0.9)' }}>
            <Play size={14} fill="white" className="text-white ml-0.5" />
          </div>
        </div>

        {/* Episode info */}
        {episodeInfo && (
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-2xs font-bold"
            style={{ background: 'rgba(2,2,8,0.75)', backdropFilter: 'blur(6px)', color: 'rgba(255,255,255,0.8)' }}>
            {episodeInfo}
          </div>
        )}

        {/* Progress bar */}
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(progress, 100)}%`,
              background: 'linear-gradient(90deg, #7B6FF0, #22D3EE)',
            }}
          />
        </div>
      </div>
      <p className="mt-1.5 text-xs font-medium text-gray-300 truncate group-hover:text-white transition-colors duration-200 px-0.5">
        {title}
      </p>
    </Link>
  );
}
