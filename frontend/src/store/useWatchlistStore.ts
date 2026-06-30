import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { WatchlistItem, ContentType } from '@/types';
import toast from 'react-hot-toast';

interface WatchlistState {
  items:     WatchlistItem[];
  favorites: WatchlistItem[];
  isLoaded:  boolean;
  userId:    string | null;

  setUserId: (id: string | null) => Promise<void>;

  addToWatchlist:      (item: Omit<WatchlistItem, 'id' | 'added_at'>) => Promise<void>;
  removeFromWatchlist: (contentId: string, contentType: ContentType) => Promise<void>;
  isInWatchlist:       (contentId: string, contentType: ContentType) => boolean;

  addToFavorites:      (item: Omit<WatchlistItem, 'id' | 'added_at'>) => Promise<void>;
  removeFromFavorites: (contentId: string, contentType: ContentType) => Promise<void>;
  isInFavorites:       (contentId: string, contentType: ContentType) => boolean;
}

const mapRow = (row: Record<string, unknown>): WatchlistItem => ({
  id:           row.id as string,
  content_id:   row.content_id as string,
  content_type: row.content_type as ContentType,
  title:        row.title as string,
  poster_path:  row.poster_path as string | null,
  backdrop_path:row.backdrop_path as string | null,
  overview:     row.overview as string,
  vote_average: row.vote_average as number,
  release_year: row.release_year as string,
  added_at:     row.added_at as string,
});

// Stable ID — not timestamp-based so upsert works correctly across reloads
const stableId  = (prefix: string, type: string, cid: string) => `${prefix}_${type}_${cid}`;

export const useWatchlistStore = create<WatchlistState>()((set, get) => ({
  items:     [],
  favorites: [],
  isLoaded:  false,
  userId:    null,

  // ── Called by authStore on login/logout ──────────────────────────────────
  setUserId: async (id) => {
    if (!id) {
      set({ items: [], favorites: [], isLoaded: false, userId: null });
      return;
    }
    set({ userId: id });
    const [wRes, fRes] = await Promise.all([
      supabase.from('watchlist').select('*').eq('user_id', id).order('added_at', { ascending: false }),
      supabase.from('favorites').select('*').eq('user_id', id).order('added_at', { ascending: false }),
    ]);
    set({
      items:    (wRes.data ?? []).map(mapRow),
      favorites:(fRes.data ?? []).map(mapRow),
      isLoaded: true,
    });
  },

  // ── Watchlist ─────────────────────────────────────────────────────────────
  addToWatchlist: async (itemData) => {
    if (get().isInWatchlist(itemData.content_id, itemData.content_type)) return;
    const userId = get().userId;
    const item: WatchlistItem = {
      ...itemData,
      id:       stableId('wl', itemData.content_type, itemData.content_id),
      added_at: new Date().toISOString(),
    };
    set(s => ({ items: [item, ...s.items] }));
    toast.success('Added to watchlist');

    if (!userId) { console.warn('[Zentrix] addToWatchlist: userId null'); return; }

    const { error } = await supabase.from('watchlist').upsert({
      id: item.id, user_id: userId,
      content_id:   itemData.content_id,   content_type: itemData.content_type,
      title:        itemData.title,        poster_path:  itemData.poster_path  ?? null,
      backdrop_path:itemData.backdrop_path ?? null, overview: itemData.overview ?? '',
      vote_average: itemData.vote_average  ?? 0,   release_year: itemData.release_year ?? '',
      added_at:     item.added_at,
    }, { onConflict: 'id' });

    if (error) {
      console.error('[Zentrix] watchlist upsert error:', error);
      toast.error('Could not save to watchlist');
    } else {
      Promise.resolve(
        supabase.from('profiles').update({ watchlist_count: get().items.length }).eq('id', userId)
      ).then(() => {}).catch(() => {});
    }
  },

  removeFromWatchlist: async (contentId, contentType) => {
    const userId = get().userId;
    set(s => ({ items: s.items.filter(i => !(i.content_id === contentId && i.content_type === contentType)) }));
    toast.success('Removed from watchlist');
    if (userId) {
      Promise.resolve(
        supabase.from('watchlist').delete()
          .eq('user_id', userId).eq('content_id', contentId).eq('content_type', contentType)
      ).then(() => {}).catch(err => console.error('[Zentrix] watchlist delete:', err));
    }
  },

  isInWatchlist: (contentId, contentType) =>
    get().items.some(i => i.content_id === contentId && i.content_type === contentType),

  // ── Favorites ─────────────────────────────────────────────────────────────
  addToFavorites: async (itemData) => {
    if (get().isInFavorites(itemData.content_id, itemData.content_type)) return;
    const userId = get().userId;
    const item: WatchlistItem = {
      ...itemData,
      id:       stableId('fav', itemData.content_type, itemData.content_id),
      added_at: new Date().toISOString(),
    };
    set(s => ({ favorites: [item, ...s.favorites] }));
    toast.success('Added to favorites');

    if (!userId) { console.warn('[Zentrix] addToFavorites: userId null'); return; }

    const { error } = await supabase.from('favorites').upsert({
      id: item.id, user_id: userId,
      content_id:   itemData.content_id,   content_type: itemData.content_type,
      title:        itemData.title,        poster_path:  itemData.poster_path  ?? null,
      backdrop_path:itemData.backdrop_path ?? null, overview: itemData.overview ?? '',
      vote_average: itemData.vote_average  ?? 0,   release_year: itemData.release_year ?? '',
      added_at:     item.added_at,
    }, { onConflict: 'id' });

    if (error) {
      console.error('[Zentrix] favorites upsert error:', error);
      toast.error('Could not save to favorites');
    }
  },

  removeFromFavorites: async (contentId, contentType) => {
    const userId = get().userId;
    set(s => ({ favorites: s.favorites.filter(i => !(i.content_id === contentId && i.content_type === contentType)) }));
    toast.success('Removed from favorites');
    if (userId) {
      Promise.resolve(
        supabase.from('favorites').delete()
          .eq('user_id', userId).eq('content_id', contentId).eq('content_type', contentType)
      ).then(() => {}).catch(err => console.error('[Zentrix] favorites delete:', err));
    }
  },

  isInFavorites: (contentId, contentType) =>
    get().favorites.some(i => i.content_id === contentId && i.content_type === contentType),
}));
