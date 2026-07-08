import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Channel } from '@/types/livetv';

// ─── Player slice ────────────────────────────────────────────────
interface PlayerSlice {
  channel:      Channel | null;
  isPlaying:    boolean;
  isMuted:      boolean;
  isFullscreen: boolean;
  isMini:       boolean;
  volume:       number;
}

const defaultPlayer: PlayerSlice = {
  channel:      null,
  isPlaying:    false,
  isMuted:      false,
  isFullscreen: false,
  isMini:       false,
  volume:       1,
};

interface LiveTvState {
  favourites:  string[];   // channel IDs
  recents:     Channel[];  // last 20 watched
  player:      PlayerSlice;
  // Live TV browse filters
  liveCountry: string;
  liveCat:     string;
  liveSort:    string;
}

interface LiveTvActions {
  toggleFav: (id: string) => void;
  isFav:     (id: string) => boolean;
  addRecent: (ch: Channel) => void;

  play:             (ch: Channel) => void;
  closePlayer:      () => void;
  togglePlay:       () => void;
  toggleMute:       () => void;
  setVolume:        (v: number) => void;
  toggleFullscreen: (v: boolean) => void;
  toggleMini:       (v: boolean) => void;

  setLiveCountry: (v: string) => void;
  setLiveCat:     (v: string) => void;
  setLiveSort:    (v: string) => void;
}

export const useLiveTvStore = create<LiveTvState & LiveTvActions>()(
  persist(
    (set, get) => ({
      favourites:  [],
      recents:     [],
      player:      defaultPlayer,
      liveCountry: 'all',
      liveCat:     'all',
      liveSort:    'name',

      toggleFav: (id) => set(s => ({
        favourites: s.favourites.includes(id)
          ? s.favourites.filter(f => f !== id)
          : [...s.favourites, id],
      })),
      isFav: (id) => get().favourites.includes(id),

      addRecent: (ch) => set(s => ({
        recents: [ch, ...s.recents.filter(r => r.id !== ch.id)].slice(0, 20),
      })),

      play: (ch) => {
        get().addRecent(ch);
        set(s => ({ player: { ...s.player, channel: ch, isPlaying: true, isMini: false } }));
      },
      closePlayer: () => set({ player: defaultPlayer }),

      togglePlay: () => set(s => ({ player: { ...s.player, isPlaying: !s.player.isPlaying } })),
      toggleMute: () => set(s => ({ player: { ...s.player, isMuted: !s.player.isMuted } })),
      setVolume:  (v) => set(s => ({ player: { ...s.player, volume: v } })),
      toggleFullscreen: (v) => set(s => ({ player: { ...s.player, isFullscreen: v } })),
      toggleMini:       (v) => set(s => ({ player: { ...s.player, isMini: v } })),

      setLiveCountry: (v) => set({ liveCountry: v }),
      setLiveCat:     (v) => set({ liveCat: v }),
      setLiveSort:    (v) => set({ liveSort: v }),
    }),
    {
      name: 'zentrix-livetv',
      // Only persist favourites/recents — not transient player/filter state
      partialize: (s) => ({ favourites: s.favourites, recents: s.recents }),
    }
  )
);
