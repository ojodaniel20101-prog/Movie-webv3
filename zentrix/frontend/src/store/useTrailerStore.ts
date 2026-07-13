import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { TrailerItem } from '@/services/trailers';

export type Reaction = 'love' | 'hype' | 'scary' | 'funny' | 'mind_blowing';

interface TrailerState {
  likes:      Record<string, number>;
  liked:      Record<string, boolean>;
  saved:      Record<string, boolean>;
  reactions:  Record<string, Reaction | null>;
  // Track which keys have been fetched so we don't double-fetch
  fetched:    Record<string, boolean>;

  fetchSocialState:  (contentId: string, contentType: string, userId?: string) => Promise<void>;
  toggleLike:        (item: TrailerItem, userId: string) => Promise<void>;
  toggleSave:        (item: TrailerItem, userId: string) => Promise<void>;
  setReaction:       (item: TrailerItem, userId: string, reaction: Reaction) => Promise<void>;
  recordView:        (item: TrailerItem, userId?: string, watchPct?: number) => Promise<void>;
}

export function formatLikeCount(n: number): string | null {
  if (n < 1000) return null;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace('.0', '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
}

export const useTrailerStore = create<TrailerState>()((set, get) => ({
  likes:     {},
  liked:     {},
  saved:     {},
  reactions: {},
  fetched:   {},

  fetchSocialState: async (contentId, contentType, userId) => {
    // Key must always match item.id format: "movie-123"
    const key       = `${contentType}-${contentId}`;
    // Use a userId-aware fetch key so we re-fetch when user logs in
    const fetchKey  = `${key}:${userId ?? 'anon'}`;
    if (get().fetched[fetchKey]) return;

    // Mark as fetched immediately to prevent duplicate calls
    set({ fetched: { ...get().fetched, [fetchKey]: true } });

    try {
      // ── 1. Like count — always readable (anon) ────────────────────────
      const { count } = await supabase
        .from('trailer_likes')
        .select('*', { count: 'exact', head: true })
        .eq('content_id', contentId)
        .eq('content_type', contentType);

      const updates: Partial<TrailerState> = {
        likes: { ...get().likes, [key]: count ?? 0 },
      };

      // ── 2. User-specific state ─────────────────────────────────────────
      if (userId) {
        const [likeRes, saveRes, reactRes] = await Promise.allSettled([
          supabase
            .from('trailer_likes')
            .select('id')
            .eq('content_id', contentId)
            .eq('content_type', contentType)
            .eq('user_id', userId)
            .maybeSingle(),
          supabase
            .from('trailer_saves')
            .select('id')
            .eq('content_id', contentId)
            .eq('content_type', contentType)
            .eq('user_id', userId)
            .maybeSingle(),
          supabase
            .from('trailer_reactions')
            .select('reaction')
            .eq('content_id', contentId)
            .eq('content_type', contentType)
            .eq('user_id', userId)
            .maybeSingle(),
        ]);

        updates.liked = {
          ...get().liked,
          [key]: likeRes.status === 'fulfilled' && !!likeRes.value.data,
        };
        updates.saved = {
          ...get().saved,
          [key]: saveRes.status === 'fulfilled' && !!saveRes.value.data,
        };
        updates.reactions = {
          ...get().reactions,
          [key]: reactRes.status === 'fulfilled'
            ? ((reactRes.value.data?.reaction as Reaction) ?? null)
            : null,
        };
      }

      set(updates as Partial<TrailerState>);
    } catch (err) {
      // Un-mark so it can retry next time
      const f = { ...get().fetched };
      delete f[fetchKey];
      set({ fetched: f });
      console.warn('[TrailerStore] fetchSocialState error', err);
    }
  },

  toggleLike: async (item, userId) => {
    const key      = item.id;
    const wasLiked = get().liked[key] ?? false;
    const oldCount = get().likes[key] ?? 0;
    const cid      = String(item.contentId);

    // Optimistic
    set({
      liked: { ...get().liked, [key]: !wasLiked },
      likes: { ...get().likes, [key]: wasLiked ? Math.max(0, oldCount - 1) : oldCount + 1 },
    });

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from('trailer_likes')
          .delete()
          .eq('user_id', userId)
          .eq('content_id', cid)
          .eq('content_type', item.contentType);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('trailer_likes')
          .insert({ user_id: userId, content_id: cid, content_type: item.contentType });
        if (error) throw error;
      }
      // Invalidate fetch cache so next visit re-reads true DB state
      const fetchKey = `${key}:${userId}`;
      const f = { ...get().fetched };
      delete f[fetchKey];
      set({ fetched: f });
    } catch (err) {
      console.error('[TrailerStore] toggleLike error', err);
      set({
        liked: { ...get().liked, [key]: wasLiked },
        likes: { ...get().likes, [key]: oldCount },
      });
    }
  },

  toggleSave: async (item, userId) => {
    const key      = item.id;
    const wasSaved = get().saved[key] ?? false;
    const cid      = String(item.contentId);

    set({ saved: { ...get().saved, [key]: !wasSaved } });

    try {
      if (wasSaved) {
        const { error } = await supabase
          .from('trailer_saves')
          .delete()
          .eq('user_id', userId)
          .eq('content_id', cid)
          .eq('content_type', item.contentType);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('trailer_saves')
          .insert({
            user_id:       userId,
            content_id:    cid,
            content_type:  item.contentType,
            youtube_key:   item.youtubeKey,
            title:         item.title,
            poster_path:   item.posterPath,
            backdrop_path: item.backdropPath,
            overview:      item.overview,
            release_year:  item.releaseYear,
            rating:        item.rating,
          });
        if (error) throw error;
      }
      // Invalidate fetch cache
      const fetchKey = `${key}:${userId}`;
      const f = { ...get().fetched };
      delete f[fetchKey];
      set({ fetched: f });
    } catch (err) {
      console.error('[TrailerStore] toggleSave error', err);
      set({ saved: { ...get().saved, [key]: wasSaved } });
    }
  },

  setReaction: async (item, userId, reaction) => {
    const key      = item.id;
    const old      = get().reactions[key];
    const isToggle = old === reaction;
    const cid      = String(item.contentId);

    set({ reactions: { ...get().reactions, [key]: isToggle ? null : reaction } });

    try {
      if (isToggle) {
        await supabase
          .from('trailer_reactions')
          .delete()
          .eq('user_id', userId)
          .eq('content_id', cid)
          .eq('content_type', item.contentType);
      } else {
        await supabase
          .from('trailer_reactions')
          .upsert(
            { user_id: userId, content_id: cid, content_type: item.contentType, reaction },
            { onConflict: 'user_id,content_id,content_type' }
          );
      }
      const fetchKey = `${key}:${userId}`;
      const f = { ...get().fetched };
      delete f[fetchKey];
      set({ fetched: f });
    } catch (err) {
      console.error('[TrailerStore] setReaction error', err);
      set({ reactions: { ...get().reactions, [key]: old } });
    }
  },

  recordView: async (item, userId, watchPct = 0) => {
    try {
      let sid = sessionStorage.getItem('_zentrix_sid');
      if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem('_zentrix_sid', sid); }
      await supabase.from('trailer_views').insert({
        user_id:      userId ?? null,
        session_id:   !userId ? sid : null,
        content_id:   String(item.contentId),
        content_type: item.contentType,
        youtube_key:  item.youtubeKey,
        watch_pct:    watchPct,
      });
    } catch { /* non-critical */ }
  },
}));
