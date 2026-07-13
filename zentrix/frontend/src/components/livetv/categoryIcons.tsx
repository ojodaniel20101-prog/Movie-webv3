import {
  Globe2, Newspaper, Trophy, Clapperboard, Baby, Music,
  Microscope, Drama, ChefHat, Church, Tv2, type LucideIcon,
} from 'lucide-react';

/** Category id (from backend) → Lucide icon. Kept separate from the
 *  backend response on purpose — the API returns stable string ids,
 *  the frontend owns the actual icon rendering (no emoji anywhere). */
export const LIVE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  all:           Globe2,
  news:          Newspaper,
  sports:        Trophy,
  movies:        Clapperboard,
  kids:          Baby,
  music:         Music,
  documentary:   Microscope,
  entertainment: Drama,
  lifestyle:     ChefHat,
  religious:     Church,
  general:       Tv2,
};

export function liveCategoryIcon(id: string): LucideIcon {
  return LIVE_CATEGORY_ICONS[id] ?? Tv2;
}
