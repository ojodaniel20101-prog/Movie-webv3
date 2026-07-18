import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';

import Layout from '@/components/layout/Layout';
import { useAuthStore } from '@/store/useAuthStore';
import { setUserOnline, setUserOffline } from '@/lib/supabase';
import { useLiveTvStore } from '@/store/useLiveTvStore';
import { useLivePreconnect } from '@/hooks/useLivePreconnect';
import { useGuestTracking } from '@/hooks/useGuestTracking';


// Lazy pages
const HomePage                  = lazy(() => import('@/pages/HomePage'));
const SearchPage                = lazy(() => import('@/pages/SearchPage'));
const DetailsPage               = lazy(() => import('@/pages/DetailsPage'));
const WatchPage                 = lazy(() => import('@/pages/WatchPage'));
const WatchlistPage             = lazy(() => import('@/pages/WatchlistPage'));
const ProfilePage               = lazy(() => import('@/pages/ProfilePage'));
const AuthPage                  = lazy(() => import('@/pages/AuthPage'));
const BrowsePage                = lazy(() => import('@/pages/BrowsePage'));
const AdminPage                 = lazy(() => import('@/pages/AdminPage'));
const TrailersPage              = lazy(() => import('@/pages/TrailersPage'));
const SupportChatPage           = lazy(() => import('@/pages/SupportChatPage'));
const LiveTVPage                = lazy(() => import('@/pages/LiveTVPage'));
const AnimePage                 = lazy(() => import('@/pages/AnimePage'));
const SportsPage                = lazy(() => import('@/pages/SportsPage'));
const WrestlingPage             = lazy(() => import('@/pages/WrestlingPage'));
const NotificationSettingsPage  = lazy(() => import('@/pages/NotificationSettingsPage'));

// Lazy components — hls.js is ~150KB+ and only needed once a channel
// is actually playing, so this must NOT be in the eager/main bundle.
const EnhancedLivePlayer = lazy(() => import('@/components/livetv/EnhancedLivePlayer'));
const LiveMiniPlayer  = lazy(() => import('@/components/livetv/LiveMiniPlayer'));

function PageLoader() {
  return (
    <div
      className="min-h-dvh flex items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      <div className="flex flex-col items-center gap-5">
        {/* Logo with glow */}
        <motion.div
          className="relative"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg viewBox="0 0 48 48" className="w-14 h-14">
            <defs>
              <linearGradient id="loader-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#7B6FF0" />
                <stop offset="100%" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
            <rect width="48" height="48" rx="14" fill="url(#loader-g)" />
            <path d="M11 13h26L23 35h17" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <motion.div
            className="absolute inset-0 rounded-2xl"
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ boxShadow: '0 0 40px rgba(123,111,240,0.6), 0 0 80px rgba(34,211,238,0.2)' }}
          />
        </motion.div>

        {/* Dot loader */}
        <div className="flex items-center gap-1.5">
          {[0, 0.15, 0.3].map((delay) => (
            <motion.div
              key={delay}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--primary)' }}
              animate={{ opacity: [0, 1, 0], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 0.9, delay, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoutes() {
  const { isLoading, isAuthenticated } = useAuthStore();
  useGuestTracking();
  const location = useLocation();
  const navigate  = useNavigate();
  const firstRun = useRef(true);

  // If the user navigates to a different page while the full-screen
  // Live TV player is open, shrink it to the mini player instead of
  // leaving a full-screen video blocking the page underneath. Skips
  // the very first run so opening the player doesn't immediately
  // minify itself on mount.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const { channel, isMini } = useLiveTvStore.getState().player;
    if (channel && !isMini) useLiveTvStore.getState().toggleMini(true);
  }, [location.pathname]);

  // After Google OAuth completes, Supabase always lands back on "/" —
  // the real intended destination (e.g. /watch/movie/123, set by
  // signInWithGoogle(redirectPath)) rides along as a ?next= param.
  // Once auth finishes, hop over there and clean the URL up.
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    if (next && next.startsWith('/')) {
      navigate(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated]);

  // Safety timeout: never block app more than 3s waiting for Supabase
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setAuthTimedOut(true); }, 3000);
    return () => clearTimeout(t);
  }, []);

  if (isLoading && !authTimedOut && location.pathname !== '/admin') return <PageLoader />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/auth"    element={<AuthPage />} />
        <Route path="/admin"   element={<AdminPage />} />
        <Route path="/trailers" element={<TrailersPage />} />
        <Route path="/trail"   element={<Navigate to="/trailers" replace />} />
        <Route
          path="/watch/:type/:id"
          element={<Layout fullscreen><WatchPage /></Layout>}
        />
        <Route
          path="/*"
          element={
            <Layout>
              <Routes>
                <Route path="/"                    element={<HomePage />} />
                <Route path="/search"              element={<SearchPage />} />
                <Route path="/live"                element={<LiveTVPage />} />
                <Route path="/details/:type/:id"   element={<DetailsPage />} />
                <Route path="/browse/:category"    element={<BrowsePage />} />
                <Route path="/watchlist"           element={<WatchlistPage />} />
                <Route path="/favorites"           element={<Navigate to="/watchlist" replace />} />
                <Route path="/history"             element={<Navigate to="/watchlist" replace />} />
                <Route path="/profile"             element={<ProfilePage />} />
                <Route path="/notifications"       element={<NotificationSettingsPage />} />
                <Route path="/support"             element={<SupportChatPage />} />
                <Route path="/anime"               element={<AnimePage />} />
                <Route path="/sports"              element={<SportsPage />} />
                <Route path="/wrestling"           element={<WrestlingPage />} />
                <Route path="*"                    element={<NotFoundPage />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </Suspense>
  );
}

function AppInner() {
  const { initAuth } = useAuthStore();
  const liveChannel  = useLiveTvStore(s => s.player.channel);
  const liveIsMini   = useLiveTvStore(s => s.player.isMini);

  // Background pre-warm all Live TV stream connections so clicking a
  // channel plays instantly instead of showing a spinner.
  useLivePreconnect();


  useEffect(() => {
    const unsubscribe = initAuth();
    return () => unsubscribe();
  }, []);

  // Heartbeat — ping every 30s to keep is_online accurate
  useEffect(() => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    const uid = user.id;
    setUserOnline(uid);
    const interval = setInterval(() => setUserOnline(uid), 30000);
    const handleOffline = () => setUserOffline(uid);
    window.addEventListener('beforeunload', handleOffline);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') setUserOffline(uid);
      else setUserOnline(uid);
    });
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleOffline);
      setUserOffline(uid);
    };
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes />

      {/* Live TV global player overlay — full-screen or mini, like a
          portal, independent of routing so channel-switching never
          interrupts navigation elsewhere in the app. Lazy-loaded since
          hls.js is only needed once a channel is actually playing.

          IMPORTANT: this swap is intentionally NOT wrapped in
          AnimatePresence. AnimatePresence keeps an exiting child
          mounted in the real DOM until its exit-transition's
          completion callback fires — and on throttled/backgrounded
          tabs (common on Android when switching apps) that callback
          can simply never fire, leaving the full-screen video stuck
          on screen forever even though the state is already correct.
          Plain conditional rendering unmounts the instant the state
          changes, no animation completion required. */}
      <Suspense fallback={null}>
        {liveChannel && !liveIsMini && <EnhancedLivePlayer key="live-player" />}
        {liveChannel && liveIsMini && <LiveMiniPlayer key="live-mini" />}
      </Suspense>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(10,10,22,0.96)',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(20px)',
            borderRadius: '14px',
            fontSize: '13px',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
          success: {
            iconTheme: { primary: '#00D97E', secondary: 'rgba(10,10,22,0.96)' },
          },
          error: {
            iconTheme: { primary: '#FF4757', secondary: 'rgba(10,10,22,0.96)' },
          },
        }}
      />
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center text-center px-4 pt-20">
      <div>
        <motion.p
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          className="font-display font-black text-9xl md:text-[10rem] select-none"
          style={{
            color: 'transparent',
            WebkitTextStroke: '1px rgba(255,255,255,0.07)',
            letterSpacing: '-0.05em',
          }}
        >
          404
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <h1 className="font-display font-bold text-2xl text-white mb-3">Page not found</h1>
          <p className="text-gray-500 text-sm mb-8">The page you're looking for doesn't exist or was moved.</p>
          <a href="/" className="btn-primary inline-flex text-sm">Back to Home</a>
        </motion.div>
      </div>
    </div>
  );
}
