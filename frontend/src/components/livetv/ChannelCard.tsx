import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Bookmark, BookmarkCheck } from 'lucide-react';
import { strHue, initials, logoUrls, qualityColor, countryFlag } from '@/lib/livetv';
import { liveCategoryIcon } from './categoryIcons';
import { useLiveTvStore } from '@/store/useLiveTvStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { Channel } from '@/types/livetv';

// ── Skeleton ─────────────────────────────────────────────────────
export function ChannelCardSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex-shrink-0 rounded-xl overflow-hidden" style={{ width: wide ? 220 : 168 }}>
      <div className="skeleton w-full aspect-video rounded-t-xl" />
      <div className="p-2.5 space-y-1.5 bg-zx-s2 rounded-b-xl">
        <div className="skeleton h-3 w-4/5 rounded-full" />
        <div className="skeleton h-2.5 w-1/2 rounded-full" />
      </div>
    </div>
  );
}

// ── Logo with fallback chain ──────────────────────────────────────
function ChannelLogo({ channel, hue }: { channel: Channel; hue: number }) {
  const [src, setSrc]       = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const idxRef  = useRef(0);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    setSrc(null); setLoaded(false); idxRef.current = 0;
    urlsRef.current = logoUrls(channel.logo, channel.tvgId);
    tryNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  function tryNext() {
    const url = urlsRef.current[idxRef.current++];
    if (!url) return; // fall back to initials
    const img = new Image();
    img.onload  = () => { setSrc(img.src); setLoaded(true); };
    img.onerror = tryNext;
    img.src     = url;
  }

  const inits = initials(channel.name);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse at 35% 35%, hsl(${hue},55%,18%) 0%, hsl(${hue},35%,7%) 75%)`,
      }} />
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: `repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 20px),
                         repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 20px)`,
      }} />
      <span
        className={`relative z-10 font-display font-extrabold tracking-tight select-none transition-opacity duration-300 ${loaded ? 'opacity-0' : 'opacity-100'}`}
        style={{ fontSize: 'clamp(1.1rem,3.5vw,1.6rem)', color: `hsl(${hue},55%,62%)`, textShadow: `0 2px 16px hsl(${hue},60%,8%)` }}
      >
        {inits}
      </span>
      {src && (
        <motion.img
          src={src}
          alt={channel.name}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="absolute inset-[14%] w-[72%] h-[72%] object-contain z-20 drop-shadow-lg"
          loading="lazy"
        />
      )}
    </div>
  );
}

// ── Main ChannelCard ──────────────────────────────────────────────
interface Props {
  channel: Channel;
  size?: 'compact' | 'full';
}

export default function ChannelCard({ channel, size = 'compact' }: Props) {
  const play           = useLiveTvStore(s => s.play);
  const toggleFav      = useLiveTvStore(s => s.toggleFav);
  const isFav          = useLiveTvStore(s => s.isFav(channel.id));
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const navigate        = useNavigate();
  const location         = useLocation();
  const hue       = strHue(channel.name);
  const isCompact = size === 'compact';
  const CatIcon   = liveCategoryIcon(channel.category);
  const qc        = channel.quality ? qualityColor(channel.quality) : null;

  const handleOpen = () => {
    if (!isAuthenticated) {
      navigate(`/auth?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    play(channel);
  };

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={handleOpen}
      className="group relative rounded-xl overflow-hidden cursor-pointer flex-shrink-0 select-none content-card"
      style={{ width: isCompact ? 168 : '100%' }}
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-video overflow-hidden">
        <ChannelLogo channel={channel} hue={hue} />

        {/* Quality badge */}
        {qc && (
          <span
            className="absolute top-2 right-2 z-30 text-2xs font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: qc.bg, color: qc.text }}
          >
            {channel.quality.toUpperCase()}
          </span>
        )}

        {/* Category icon chip */}
        {channel.category && channel.category !== 'general' && (
          <span
            className="absolute bottom-2 left-2 z-30 w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(2,2,8,0.65)', backdropFilter: 'blur(4px)' }}
          >
            <CatIcon size={12} className="text-primary-300" />
          </span>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ background: 'rgba(2,2,8,0.45)' }}>
          <motion.div
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(123,111,240,0.88)', boxShadow: '0 0 20px rgba(123,111,240,0.5)' }}
            whileHover={{ scale: 1.1 }}
          >
            <Play size={17} className="text-white ml-0.5" fill="white" />
          </motion.div>
        </div>

        {/* LIVE badge */}
        <div className="absolute top-2 left-2 z-30 flex items-center gap-1 px-1.5 py-[3px] rounded-md text-2xs font-black tracking-widest"
          style={{ background: 'rgba(255,59,48,0.92)', color: 'white' }}>
          <span className="w-[5px] h-[5px] rounded-full bg-white animate-pulse" />
          LIVE
        </div>

        {/* Favourite star */}
        <button
          onClick={e => { e.stopPropagation(); toggleFav(channel.id); }}
          aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
          className={`absolute top-9 right-2 z-30 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 ${
            isFav ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{
            background: isFav ? 'rgba(123,111,240,0.9)' : 'rgba(2,2,8,0.6)',
            backdropFilter: 'blur(6px)',
            border: `1px solid ${isFav ? 'rgba(123,111,240,0.4)' : 'rgba(255,255,255,0.12)'}`,
          }}
        >
          {isFav ? <BookmarkCheck size={13} className="text-white" /> : <Bookmark size={13} className="text-white" />}
        </button>
      </div>

      {/* Card body */}
      <div className="px-2.5 pt-2 pb-2.5 space-y-1 bg-zx-s2">
        <p className={`font-medium text-white leading-snug line-clamp-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
          {channel.name}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {channel.country && (
            <span className="text-2xs leading-none">{countryFlag(channel.country)}</span>
          )}
          {channel.platform && (
            <span className="text-2xs font-medium text-gray-600 bg-white/[0.05] px-1.5 py-0.5 rounded-full truncate max-w-[80px]">
              {channel.platform}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
