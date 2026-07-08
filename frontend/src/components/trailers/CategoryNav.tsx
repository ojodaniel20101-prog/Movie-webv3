import { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Globe, Flame, Clapperboard, Tv, Sparkles, Rocket, Zap, Ghost,
  Laugh, Palette, Baby, Satellite, Heart, Eye, type LucideIcon,
} from 'lucide-react';
import type { TrailerCategory } from '@/services/trailers';

interface Category {
  id:    TrailerCategory;
  label: string;
  icon:  LucideIcon;
}

export const TRAILER_CATEGORIES: Category[] = [
  { id: 'explore',   label: 'Explore',    icon: Globe },
  { id: 'trending',  label: 'Trending',   icon: Flame },
  { id: 'movies',    label: 'Movies',     icon: Clapperboard },
  { id: 'tv',        label: 'TV Shows',   icon: Tv },
  { id: 'anime',     label: 'Anime',      icon: Sparkles },
  { id: 'upcoming',  label: 'Upcoming',   icon: Rocket },
  { id: 'action',    label: 'Action',     icon: Zap },
  { id: 'horror',    label: 'Horror',     icon: Ghost },
  { id: 'comedy',    label: 'Comedy',     icon: Laugh },
  { id: 'animation', label: 'Animation',  icon: Palette },
  { id: 'kids',      label: 'Kids',       icon: Baby },
  { id: 'scifi',     label: 'Sci-Fi',     icon: Satellite },
  { id: 'romance',   label: 'Romance',    icon: Heart },
  { id: 'thriller',  label: 'Thriller',   icon: Eye },
];

interface Props {
  active:   TrailerCategory;
  onChange: (cat: TrailerCategory) => void;
}

export default function CategoryNav({ active, onChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleClick = (cat: TrailerCategory) => {
    onChange(cat);
    // Scroll selected pill into view
    const el = scrollRef.current?.querySelector(`[data-cat="${cat}"]`) as HTMLElement;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  return (
    <div
      className="absolute top-0 left-0 right-0 z-40 pt-16 pb-2"
      style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)' }}
    >
      <div
        ref={scrollRef}
        className="flex items-center gap-2 px-4 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {TRAILER_CATEGORIES.map((cat) => {
          const isActive = active === cat.id;
          return (
            <motion.button
              key={cat.id}
              data-cat={cat.id}
              onClick={() => handleClick(cat.id)}
              whileTap={{ scale: 0.92 }}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? 'text-white shadow-lg shadow-primary-500/30'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
              style={
                isActive
                  ? { background: 'linear-gradient(135deg,#7B6FF0,#22D3EE)', border: '1px solid rgba(123,111,240,0.5)' }
                  : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              <cat.icon size={13} className="flex-shrink-0" />
              {cat.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
