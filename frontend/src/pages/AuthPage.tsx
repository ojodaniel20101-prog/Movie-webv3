import { useState } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Shield, Star, ArrowLeft, Loader2, Film, Tv, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import toast from 'react-hot-toast';

const features = [
  { icon: Film,    title: 'Movies & TV',      desc: 'Millions of titles from every genre' },
  { icon: Tv,      title: 'Anime Library',    desc: 'Complete series with sub & dub' },
  { icon: Star,    title: 'Watchlist & Favs', desc: 'Synced across all your devices'  },
  { icon: Zap,     title: 'Continue Watching',desc: 'Pick up right where you left off' },
];

export default function AuthPage() {
  const { isAuthenticated, signInWithGoogle } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const location = useLocation();

  const redirectParam = new URLSearchParams(location.search).get('redirect');
  const redirectPath  = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/';

  if (isAuthenticated) return <Navigate to={redirectPath} replace />;

  const handleGoogleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await signInWithGoogle(redirectPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      toast.error(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row aurora-bg" style={{ background: 'var(--bg)' }}>
      {/* ── Left panel — branding ──────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 py-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-25"
            style={{ background: 'radial-gradient(circle, #7B6FF0, transparent)', filter: 'blur(80px)' }}
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute bottom-1/4 right-0 w-72 h-72 rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #22D3EE, transparent)', filter: 'blur(60px)' }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          />
        </div>

        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7B6FF0, #22D3EE)' }}>
              <Zap size={20} className="text-white" />
            </div>
            <span className="font-display font-black text-2xl text-white tracking-tight">
              Zen<span className="text-gradient">trix</span>
            </span>
          </div>

          <h1 className="font-display font-black text-5xl text-white leading-[1.08] mb-5" style={{ letterSpacing: '-0.03em' }}>
            Your universe.<br />
            <span className="text-gradient">Always with you.</span>
          </h1>
          <p className="text-gray-400 text-lg leading-relaxed mb-12 max-w-md">
            Sign in once. Your watchlist, favorites, and progress follow you everywhere — powered by Supabase.
          </p>

          <div className="grid grid-cols-1 gap-3">
            {features.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
                className="glass-card flex items-center gap-4 p-4"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(123,111,240,0.2), rgba(34,211,238,0.2))' }}>
                  <Icon size={18} className="text-primary-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Right panel — sign in ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 relative">
        <div className="flex lg:hidden items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7B6FF0, #22D3EE)' }}>
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-display font-black text-xl text-white">
            Zen<span className="text-gradient">trix</span>
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <div className="rounded-3xl p-8" style={{ background: 'rgba(10,10,20,0.85)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(28px)', boxShadow: 'var(--shadow-xl)' }}>
            <div className="mb-8">
              <h2 className="font-display font-black text-2xl text-white mb-2">Welcome back</h2>
              <p className="text-sm text-gray-500">Sign in to access your personalized experience.</p>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl font-semibold text-sm relative overflow-hidden transition-all duration-200"
              style={{
                background: loading ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: loading ? 'rgba(255,255,255,0.4)' : 'white',
                minHeight: 52,
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin text-primary-400" />
                  <span>Redirecting to Google…</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-xs text-gray-700">secure & private</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Shield, text: 'No passwords stored' },
                { icon: Sparkles, text: 'Instant account setup' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <Icon size={12} className="text-primary-400 flex-shrink-0" />
                  <span className="text-xs text-gray-500">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <Link to="/" className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-600 hover:text-gray-400 transition-colors duration-200">
            <ArrowLeft size={14} />
            Back to browsing
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
