import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ChevronRight, X } from 'lucide-react';
import AdBlockGuideModal from './AdBlockGuideModal';

const DISMISS_KEY = 'zentrix_adblock_banner_dismissed';

export default function AdBlockBanner() {
  const [dismissed, setDismissed] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  // Read localStorage only after mount (avoids SSR/hydration mismatch concerns)
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <>
      <AnimatePresence>
        {!dismissed && (
          <motion.button
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12, transition: { duration: 0.15 } }}
            onClick={() => setShowGuide(true)}
            className="relative w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left overflow-hidden mb-3"
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(123,111,240,0.10))',
              border: '1px solid rgba(245,158,11,0.28)',
            }}
          >
            {/* Pulsing glow ring to catch the eye */}
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              animate={{
                boxShadow: [
                  '0 0 0px rgba(245,158,11,0.0)',
                  '0 0 18px rgba(245,158,11,0.35)',
                  '0 0 0px rgba(245,158,11,0.0)',
                ],
              }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />

            <motion.div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative z-10"
              style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.3)' }}
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ShieldCheck size={17} className="text-amber-400" />
            </motion.div>

            <div className="flex-1 min-w-0 relative z-10">
              <p className="text-sm font-semibold text-amber-200 leading-tight">
                Get the ad-free experience
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-tight">
                Tap for a quick, one-time setup — no more ads or popups
              </p>
            </div>

            <ChevronRight size={16} className="text-amber-400/70 flex-shrink-0 relative z-10" />

            <button
              onClick={handleDismiss}
              aria-label="Dismiss"
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 relative z-10 hover:bg-white/10 transition-colors"
            >
              <X size={12} className="text-gray-500" />
            </button>
          </motion.button>
        )}
      </AnimatePresence>

      <AdBlockGuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} />
    </>
  );
}
