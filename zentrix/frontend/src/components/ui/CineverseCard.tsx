import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { getPosterUrl } from '@/services/tmdb';
import type { ContentType } from '@/types';

export interface CineverseCardProps {
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

const PLATFORM_COLORS: Record<string, { bg: string; text: string }> = {
  Netflix:     { bg: 'rgba(229,9,20,0.9)',  text: '#fff' },
  'HBO Max':   { bg: 'rgba(0,37,165,0.9)',  text: '#fff' },
  'HBO':       { bg: 'rgba(0,37,165,0.9)',  text: '#fff' },
  'Disney+':   { bg: 'rgba(17,60,153,0.9)',  text: '#fff' },
  Hulu:        { bg: 'rgba(28,231,131,0.9)', text: '#000' },
  'Amazon Prime Video': { bg: 'rgba(0,168,225,0.9)', text: '#fff' },
  Prime:       { bg: 'rgba(0,168,225,0.9)', text: '#fff' },
  'Apple TV+': { bg: 'rgba(0,0,0,0.8)',     text: '#fff' },
  Paramount:   { bg: 'rgba(0,83,159,0.9)',   text: '#fff' },
  Peacock:     { bg: 'rgba(0,128,160,0.9)',  text: '#fff' },
  'BBC One':   { bg: 'rgba(000,0,0,0.8)',   text: '#fff' },
  'ITV1':      { bg: 'rgba(0,157,224,0.9)',  text: '#fff' },
  AMC:         { bg: 'rgba(3,154,221,0.9)',  text: '#fff' },
  'Cartoon Network': { bg: 'rgba(0,0,0,0.8)', text: '#fff' },
  Nickelodeon: { bg: 'rgba(255,165,0,0.9)',  text: '#000' },
  'TV Tokyo':  { bg: 'rgba(0,0,139,0.9)',    text: '#fff' },
  Crunchyroll: { bg: 'rgba(244,117,33,0.9)', text: '#fff' },
  Funimation:  { bg: 'rgba(96,43,143,0.9)',  text: '#fff' },
};

function getPlatformStyle(platform?: string) {
  if (!platform) return null;
  const match = PLATFORM_COLORS[platform];
  if (match) return match;
  // Try partial match
  for (const [key, val] of Object.entries(PLATFORM_COLORS)) {
    if (platform.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return null;
}

export default function CineverseCard({
  id, type, title, posterPath, backdropPath,
  rating = 0, releaseYear, platform, genre,
}: CineverseCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError]   = useState(false);

  const detailPath =
    type === 'anime' ? `/details/anime/${id}` :
    type === 'movie' ? `/details/movie/${id}` :
    `/details/tv/${id}`;

  const imageUrl = getPosterUrl(posterPath || backdropPath || null, 'w342');
  const platformStyle = getPlatformStyle(platform);

  return (
    <motion.div
      whileTap={{ scale: 0.96 }}
      className="flex-shrink-0"
      style={{ width: 140 }}
    >
      <Link to={detailPath} className="block group">
        {/* Card Container */}
        <div
          className="relative rounded-xl overflow-hidden"
          style={{
            width: 140,
            height: 210,
            background: 'var(--bg-s2)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          {/* Skeleton loader */}
          {!imgLoaded && !imgError && (
            <div className="absolute inset-0 skeleton" />
          )}

          {/* Poster Image */}
          {imageUrl && !imgError ? (
            <img
              src={imageUrl}
              alt={title}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'var(--bg-s3)' }}>
              <span className="text-2xs text-center text-white/40 px-2 leading-tight font-medium">
                {title}
              </span>
            </div>
          )}

          {/* Dark gradient overlay */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(2,2,8,0.6) 0%, transparent 40%, transparent 100%)' }} />

          {/* Year Badge - Top Left */}
          {releaseYear && (
            <div className="absolute top-2 left-2 z-10">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white"
                style={{
                  background: 'rgba(0,0,0,0.75)',
                  backdropFilter: 'blur(6px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}>
                {releaseYear}
              </span>
            </div>
          )}

          {/* Rating Badge - Top Right */}
          {rating > 0 && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5">
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-yellow-300 flex items-center gap-0.5"
                style={{
                  background: 'rgba(0,0,0,0.75)',
                  backdropFilter: 'blur(6px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}>
                <Star size={9} className="fill-yellow-400 text-yellow-400" />
                {rating.toFixed(1)}
              </span>
            </div>
          )}

          {/* Type Badge - Bottom Left */}
          <div className="absolute bottom-2 left-2 z-10">
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-white/80 flex items-center gap-1"
              style={{
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(6px)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <rect x="0.5" y="0.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="0.8"/>
                <path d="M2 2.5L4 4L2 5.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Movie
            </span>
          </div>

          {/* Platform Badge - on poster if available */}
          {platformStyle && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
                style={{
                  background: platformStyle.bg,
                  color: platformStyle.text,
                }}>
                {platform}
              </span>
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-[5]" />
        </div>

        {/* Title Below Card */}
        <div className="mt-2 px-0.5">
          <p className="text-xs font-semibold text-gray-300 truncate group-hover:text-white transition-colors duration-200 leading-tight">
            {title}
          </p>
          {genre && (
            <p className="text-[10px] text-gray-600 mt-0.5 truncate">{genre}</p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
