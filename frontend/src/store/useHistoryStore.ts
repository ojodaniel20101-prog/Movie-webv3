import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { HistoryItem, ContentType } from '@/types';
import toast from 'react-hot-toast';

interface HistoryState {
  items:    HistoryItem[];
  isLoaded: boolean;
  userId:   string | null;

  setUserId:         (id: string | null) => Promise<void>;
  updateHistory:     (item: Omit<HistoryItem, 'id' | 'watched_at'>) => Promise<void>;
  addToHistory:      (item: Omit<HistoryItem, 'id' | 'watched_at'>) => Promise<void>;
  updateProgress:    (contentId: string, contentType: string, progressSeconds: number, durationSeconds: number) => Promise<void>;
  removeFromHistory: (contentId: string, contentType: string) => Promise<void>;
  clearHistory:      () => Promise<void>;
  getProgress:       (contentId: string, contentType: string) => HistoryItem | null;
  clearAll:          () => void;
}

const mapRow = (row: Record<string, unknown>): HistoryItem => ({
  id:               row.id as string,
  content_id:       row.content_id as string,
  content_type:     row.content_type as ContentType,
  title:            row.title as string,
  poster_path:      row.poster_path as string | null,
  backdrop_path:    row.backdrop_path as string | null,
  season_number:    row.season_number as number | null,
  episode_number:   row.episode_number as number | null,
  episode_title:    row.episode_title as string | null,
  progress_seconds: row.progress_seconds as number,
  duration_seconds: row.duration_seconds as number,
  watched_at:       row.watched_at as string,
});

// Stable ID derived from natural key — lets upsert work on conflict
const histId = (userId: string, type: string, cid: string) => `hist_${userId}_${type}_${cid}`;

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  items:    [],
  isLoaded: false,
  userId:   null,

  setUserId: async (id) => {
    if (!id) { set({ items: [], isLoaded: false, userId: null }); return; }
    set({ userId: id });
    const { data } = await supabase
      .from('watch_history').select('*').eq('user_id', id)
      .order('watched_at', { ascending: false }).limit(200);
    set({ items: (data ?? []).map(mapRow), isLoaded: true });
  },

  // ── Core upsert — handles both new and re-watched content ────────────────
  updateHistory: async (itemData) => {
    const userId    = get().userId;
    const watchedAt = new Date().toISOString();
    const dateStr   = watchedAt.split('T')[0];

    // Optimistic update in local state
    const existing = get().items.find(
      i => i.content_id === itemData.content_id && i.content_type === itemData.content_type,
    );
    if (existing) {
      set(s => ({
        items: s.items.map(i =>
          i.content_id === itemData.content_id && i.content_type === itemData.content_type
            ? { ...i, ...itemData, watched_at: watchedAt } : i,
        ),
      }));
    } else {
      const item: HistoryItem = { ...itemData, id: userId ? histId(userId, itemData.content_type, itemData.content_id) : `hist_local_${Date.now()}`, watched_at: watchedAt };
      set(s => ({ items: [item, ...s.items].slice(0, 200) }));
    }

    if (!userId) { console.warn('[Zentrix] updateHistory: userId null'); return; }

    const stableItemId = histId(userId, itemData.content_type, itemData.content_id);

    // Upsert with stable ID — safe even if content was watched before
    const { error } = await supabase.from('watch_history').upsert({
      id: stableItemId, user_id: userId,
      content_id:       itemData.content_id,
      content_type:     itemData.content_type,
      title:            itemData.title,
      poster_path:      itemData.poster_path      ?? null,
      backdrop_path:    itemData.backdrop_path     ?? null,
      season_number:    itemData.season_number     ?? null,
      episode_number:   itemData.episode_number    ?? null,
      episode_title:    itemData.episode_title     ?? null,
      progress_seconds: itemData.progress_seconds  ?? 0,
      duration_seconds: itemData.duration_seconds  ?? 0,
      watched_at:       watchedAt,
    }, { onConflict: 'id' });

    if (error) {
      console.error('[Zentrix] watch_history upsert error:', error);
      toast.error('Could not save watch progress');
    } else {
      // Log analytics event (fire and forget)
      Promise.resolve(supabase.from('watch_events').insert({
        user_id: userId, content_id: itemData.content_id,
        content_type: itemData.content_type, title: itemData.title,
        watched_at: watchedAt, date: dateStr,
      })).then(() => {}).catch(() => {});
      // Sync profile counter
      Promise.resolve(
        supabase.from('profiles').update({ watched_count: get().items.length }).eq('id', userId)
      ).then(() => {}).catch(() => {});
    }
  },

  addToHistory: async (item) => get().updateHistory(item),

  updateProgress: async (contentId, contentType, progressSeconds, durationSeconds) => {
    const { userId } = get();
    const watchedAt  = new Date().toISOString();
    set(s => ({
      items: s.items.map(i =>
        i.content_id === contentId && i.content_type === contentType
          ? { ...i, progress_seconds: progressSeconds, duration_seconds: durationSeconds, watched_at: watchedAt } : i,
      ),
    }));
    if (userId) {
      Promise.resolve(
        supabase.from('watch_history')
          .update({ progress_seconds: progressSeconds, duration_seconds: durationSeconds, watched_at: watchedAt })
          .eq('user_id', userId).eq('content_id', contentId).eq('content_type', contentType)
      ).then(() => {}).catch(err => console.error('[Zentrix] updateProgress:', err));
    }
  },

  removeFromHistory: async (contentId, contentType) => {
    const { userId } = get();
    set(s => ({ items: s.items.filter(i => !(i.content_id === contentId && i.content_type === contentType)) }));
    if (userId) {
      Promise.resolve(
        supabase.from('watch_history').delete()
          .eq('user_id', userId).eq('content_id', contentId).eq('content_type', contentType)
      ).then(() => {}).catch(err => console.error('[Zentrix] removeHistory:', err));
    }
  },

  clearHistory: async () => {
    const { userId } = get();
    set({ items: [] });
    if (userId) {
      Promise.resolve(
        supabase.from('watch_history').delete().eq('user_id', userId)
      ).then(() => {}).catch(err => console.error('[Zentrix] clearHistory:', err));
    }
  },

  getProgress: (contentId, contentType) =>
    get().items.find(i => i.content_id === contentId && i.content_type === contentType) ?? null,

  clearAll: () => set({ items: [], isLoaded: false, userId: null }),
}));
