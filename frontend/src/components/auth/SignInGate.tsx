import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, LogIn, Users, Sparkles } from 'lucide-react';

interface Props {
  /** Shown in the heading, e.g. "watch this" / "watch Live TV" */
  context?: string;
}

/**
 * Blocking gate shown instead of the video player when the visitor isn't
 * signed in. Browsing (home/search/details) stays open to everyone; only
 * actual playback requires a Google account — this is what enforces that.
 */
export default function SignInGate({ context = 'start watching' }: Props) {
  const location = useLocation();
  const redirectTo = `/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full aspect-video rounded-2xl overflow-hidden flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, rgba(123,111,240,0.10), rgba(2,2,8,0.95))', border: '1px solid rgba(123,111,240,0.18)' }}
    >
      <div className="absolute inset-0 noise-overlay opacity-20" />
      <motion.div
        className="absolute w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(123,111,240,0.25), transparent 70%)' }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 flex flex-col items-center text-center px-6 py-10 max-w-sm">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(123,111,240,0.15)', border: '1px solid rgba(123,111,240,0.28)' }}>
          <Lock size={24} className="text-primary-300" />
        </div>

        <h3 className="font-display font-bold text-xl text-white mb-2">
          Sign in to {context}
        </h3>
        <p className="text-sm text-gray-400 leading-relaxed mb-6">
          Create a free account with Google to stream movies, anime, and live TV on Zentrix.
        </p>

        <Link to={redirectTo} className="btn-primary w-full justify-center gap-2 mb-3">
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" fillOpacity="0.85" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" fillOpacity="0.7" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" fillOpacity="0.55" />
          </svg>
          Continue with Google
        </Link>

        <div className="flex items-center gap-4 text-2xs text-gray-600">
          <span className="flex items-center gap-1"><Sparkles size={11} /> Free forever</span>
          <span className="flex items-center gap-1"><Users size={11} /> Takes 10 seconds</span>
        </div>
      </div>
    </motion.div>
  );
}
