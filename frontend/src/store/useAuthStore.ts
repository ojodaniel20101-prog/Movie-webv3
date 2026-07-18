import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import {
  supabase,
  upsertUserProfile,
  setUserOffline,
  ADMIN_EMAILS,
  type UserProfile,
} from '@/lib/supabase';
import type { User } from '@/types';

interface AuthState {
  user:            User | null;
  profile:         UserProfile | null;
  isAuthenticated: boolean;
  isLoading:       boolean;
  isAdmin:         boolean;
  uploadProgress:  number;

  signInWithGoogle:   (redirectPath?: string) => Promise<void>;
  logout:             () => Promise<void>;
  updateUser:         (data: Partial<User>) => void;
  updateProfile:      (data: Partial<UserProfile>) => Promise<void>;
  uploadProfilePhoto: (file: File) => Promise<string>;
  initAuth:           () => () => void;
  refreshHeartbeat:   () => void;
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export const useAuthStore = create<AuthState>()((set, get) => ({
  user:            null,
  profile:         null,
  isAuthenticated: false,
  isLoading:       true,
  isAdmin:         false,
  uploadProgress:  0,

  // ─── Google OAuth (Supabase redirect flow) ────────────────────────────────
  signInWithGoogle: async (redirectPath) => {
    set({ isLoading: true });
    try {
      // Always redirect OAuth back to the already-allowlisted origin root —
      // the real destination (e.g. /watch/movie/123) rides along as a `next`
      // query param instead of changing the redirect URL itself, so this
      // never breaks regardless of what's configured in Supabase Auth's
      // redirect URL allowlist.
      const target = redirectPath && redirectPath !== '/'
        ? `${window.location.origin}/?next=${encodeURIComponent(redirectPath)}`
        : `${window.location.origin}/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: target,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      });
      if (error) throw error;
      // Page will redirect; loading state stays until redirect completes
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // ─── Sign Out ──────────────────────────────────────────────────────────────
  logout: async () => {
    const { user } = get();
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    if (user?.id) await Promise.resolve(setUserOffline(user.id)).catch(() => {});
    await supabase.auth.signOut();
    set({ user: null, profile: null, isAuthenticated: false, isAdmin: false });

    // Clear watchlist/history stores on logout
    const { useWatchlistStore } = await import('./useWatchlistStore');
    const { useHistoryStore }   = await import('./useHistoryStore');
    useWatchlistStore.getState().setUserId(null);
    useHistoryStore.getState().setUserId(null);
  },

  // ─── Patch local user object ──────────────────────────────────────────────
  updateUser: (data) => {
    const current = get().user;
    if (current) set({ user: { ...current, ...data } });
  },

  // ─── Update Supabase profile ───────────────────────────────────────────────
  updateProfile: async (data) => {
    const { user } = get();
    if (!user?.id) return;

    const { error } = await supabase
      .from('profiles')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (error) throw error;

    const updated = { ...(get().profile ?? {}), ...data } as UserProfile;
    set({
      profile: updated,
      user: {
        ...user,
        username: data.display_name  ?? user.username,
        avatar:   data.custom_photo_url !== undefined ? data.custom_photo_url : user.avatar,
      },
    });
  },

  // ─── Upload Profile Photo → Supabase Storage ──────────────────────────────
  uploadProfilePhoto: async (file: File) => {
    const { user } = get();
    if (!user?.id) throw new Error('Not authenticated');

    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${user.id}/avatar.${ext}`;           // fixed name = auto-overwrite

    set({ uploadProgress: 10 });
    const ticker = setInterval(() => {
      set(s => ({ uploadProgress: Math.min(s.uploadProgress + 12, 88) }));
    }, 250);

    try {
      // Remove previous avatar first (ignore error if none exists)
      await supabase.storage.from('profile-images').remove([path]).catch(() => {});

      const { error: upErr } = await supabase.storage
        .from('profile-images')
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });

      clearInterval(ticker);
      if (upErr) {
        console.error('[Zentrix] Storage upload error:', upErr);
        throw new Error(upErr.message);
      }

      // Bust browser cache by appending timestamp
      const { data: urlData } = supabase.storage
        .from('profile-images')
        .getPublicUrl(path);

      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      await get().updateProfile({ custom_photo_url: url });
      set({ uploadProgress: 100 });
      setTimeout(() => set({ uploadProgress: 0 }), 800);
      return url;
    } catch (err) {
      clearInterval(ticker);
      set({ uploadProgress: 0 });
      throw err;
    }
  },

  // ─── Heartbeat — keep lastSeen fresh ─────────────────────────────────────
  refreshHeartbeat: () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      const uid = get().user?.id;
      if (uid) {
        await Promise.resolve(
          supabase
            .from('profiles')
            .update({ is_online: true, last_seen: new Date().toISOString() })
            .eq('id', uid)
        ).catch(() => {});
      }
    }, 60_000);
  },

  // ─── Auth State Listener ──────────────────────────────────────────────────
  initAuth: () => {
    // Safety timeout: ensure loading always finishes even if Supabase hangs
    const loadingTimeout = setTimeout(() => {
      const state = get();
      if (state.isLoading) {
        console.warn('[Zentrix] Auth loading timed out — forcing isLoading false');
        set({ isLoading: false });
      }
    }, 5000);

    // Helper: process a session into auth state (used by both getSession and onAuthStateChange)
    const processSession = async (session: Session | null) => {
      if (!session?.user) return;
      const su = session.user;
      try {
        const profile = await upsertUserProfile(
          su.id,
          su.email ?? '',
          su.user_metadata?.full_name ?? su.user_metadata?.name ?? 'User',
          su.user_metadata?.avatar_url ?? su.user_metadata?.picture ?? null,
        );

        if (profile.is_banned) {
          await supabase.auth.signOut();
          set({ user: null, profile: null, isAuthenticated: false, isLoading: false, isAdmin: false });
          return;
        }

        const isAdmin = ADMIN_EMAILS.includes(su.email ?? '') || profile.role === 'admin';
        const user: User = {
          id:       su.id,
          email:    su.email ?? null,
          username: profile.display_name || 'User',
          avatar:   profile.custom_photo_url ?? profile.photo_url ?? null,
          isGuest:  false,
        };

        set({ user, profile, isAuthenticated: true, isAdmin });
        localStorage.removeItem('zentrix_guest_id');
        get().refreshHeartbeat();

        const [{ useWatchlistStore }, { useHistoryStore }] = await Promise.all([
          import('./useWatchlistStore'),
          import('./useHistoryStore'),
        ]);
        useWatchlistStore.getState().setUserId(su.id);
        useHistoryStore.getState().setUserId(su.id);

        set({ isLoading: false });
      } catch (err) {
        console.error('[Zentrix] upsertUserProfile failed:', err);
        const isAdminFallback = ADMIN_EMAILS.includes(su.email ?? '');
        set({
          user: {
            id:       su.id,
            email:    su.email ?? null,
            username: su.user_metadata?.full_name ?? su.user_metadata?.name ?? 'User',
            avatar:   su.user_metadata?.avatar_url ?? su.user_metadata?.picture ?? null,
            isGuest:  false,
          },
          isAuthenticated: true,
          isAdmin:         isAdminFallback,
        });
        const [{ useWatchlistStore: WS }, { useHistoryStore: HS }] = await Promise.all([
          import('./useWatchlistStore'),
          import('./useHistoryStore'),
        ]);
        WS.getState().setUserId(su.id);
        HS.getState().setUserId(su.id);
        set({ isLoading: false });
      }
    };

    // Handle initial session (e.g. after page refresh or OAuth redirect)
    // CRITICAL: Process existing session directly — don't rely solely on onAuthStateChange
    let sessionRestored = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        sessionRestored = true;
        processSession(session).then(() => {
          clearTimeout(loadingTimeout);
        });
      } else {
        clearTimeout(loadingTimeout);
        set({ isLoading: false });
      }
    }).catch((err) => {
      console.error('[Zentrix] getSession error:', err);
      clearTimeout(loadingTimeout);
      set({ isLoading: false });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        clearTimeout(loadingTimeout);
        // Skip if we already restored this session via getSession() above
        if (event === 'INITIAL_SESSION' && sessionRestored) return;
        if (session?.user) {
          const su = session.user;
          try {
            const profile = await upsertUserProfile(
              su.id,
              su.email ?? '',
              su.user_metadata?.full_name ?? su.user_metadata?.name ?? 'User',
              su.user_metadata?.avatar_url ?? su.user_metadata?.picture ?? null,
            );

            if (profile.is_banned) {
              await supabase.auth.signOut();
              set({ user: null, profile: null, isAuthenticated: false, isLoading: false, isAdmin: false });
              return;
            }

            const isAdmin = ADMIN_EMAILS.includes(su.email ?? '') || profile.role === 'admin';
            const user: User = {
              id:       su.id,
              email:    su.email ?? null,
              username: profile.display_name || 'User',
              avatar:   profile.custom_photo_url ?? profile.photo_url ?? null,
              isGuest:  false,
            };

            set({ user, profile, isAuthenticated: true, isAdmin });
        localStorage.removeItem('zentrix_guest_id');
            get().refreshHeartbeat();

            // Import stores and set userId BEFORE setting isLoading:false.
            // This guarantees userId is ready when the page first renders,
            // so any immediate add-to-watchlist/favorites/history works correctly.
            const [{ useWatchlistStore }, { useHistoryStore }] = await Promise.all([
              import('./useWatchlistStore'),
              import('./useHistoryStore'),
            ]);
            useWatchlistStore.getState().setUserId(su.id);
            useHistoryStore.getState().setUserId(su.id);

            // NOW reveal the app — userId is set, data loading is running in background
            set({ isLoading: false });
          } catch (err) {
            console.error('[Zentrix] upsertUserProfile failed:', err);
            // Fallback: profile fetch failed, only trust ADMIN_EMAILS
            const isAdminFallback = ADMIN_EMAILS.includes(su.email ?? '');
            set({
              user: {
                id:       su.id,
                email:    su.email ?? null,
                username: su.user_metadata?.full_name ?? su.user_metadata?.name ?? 'User',
                avatar:   su.user_metadata?.avatar_url ?? su.user_metadata?.picture ?? null,
                isGuest:  false,
              },
              isAuthenticated: true,
              isAdmin:         isAdminFallback,
            });
            // CRITICAL: call setUserId even on error so favorites/history saves work
            const [{ useWatchlistStore: WS }, { useHistoryStore: HS }] = await Promise.all([
              import('./useWatchlistStore'),
              import('./useHistoryStore'),
            ]);
            WS.getState().setUserId(su.id);
            HS.getState().setUserId(su.id);
            set({ isLoading: false });
          }
        } else {
          if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
          set({ user: null, profile: null, isAuthenticated: false, isLoading: false, isAdmin: false });
        }
      },
    );

    return () => {
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  },
}));
