import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/**
 * PWA Install Banner
 *
 * Shows automatically on first visit to prompt users to install the app.
 * - Android/Chrome: Uses beforeinstallprompt to show native install dialog
 * - iOS Safari: Shows manual instructions (Share → Add to Home Screen)
 * - Already installed or dismissed: Hidden
 */
export default function InstallBanner() {
  const { canInstall, isInstalled, isStandalone, isDismissed, isIOS, install, dismiss } = usePWAInstall();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  // Don't show if already installed, in standalone mode, or dismissed
  const shouldShow = !isInstalled && !isStandalone && !isDismissed;

  // Auto-show banner after a short delay on first visit
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (shouldShow) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      setShowIOSInstructions(false);
    }
  }, [shouldShow]);

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
    } else if (canInstall) {
      await install();
    }
  };

  const handleDismiss = () => {
    setShowIOSInstructions(false);
    setVisible(false);
    dismiss();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -60, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -60, height: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #7B6FF0 0%, #22D3EE 100%)',
            boxShadow: '0 4px 24px rgba(123,111,240,0.3)',
          }}
        >
          {!showIOSInstructions ? (
            <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3">
              {/* App Icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
                <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                  <rect width="36" height="36" rx="10" fill="rgba(255,255,255,0.9)"/>
                  <path d="M8 9h20L16 27h12" stroke="#7B6FF0" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  Install Zentrix for the best experience
                </p>
                <p className="text-xs text-white/70">
                  {isIOS
                    ? 'Add to your Home Screen for quick access'
                    : 'Launch faster with offline support'}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleInstall}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white/20 hover:bg-white/30 text-white transition-colors border border-white/20"
                >
                  {isIOS ? (
                    <>
                      <Share2 size={13} />
                      How to Install
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      Install
                    </>
                  )}
                </motion.button>
                <button
                  onClick={handleDismiss}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                  aria-label="Dismiss install banner"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : (
            /* iOS Install Instructions */
            <div className="max-w-screen-2xl mx-auto px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-white mb-2">
                    Install Zentrix on your iPhone
                  </p>
                  <ol className="space-y-2 text-xs text-white/80">
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">1</span>
                      Tap the <Share2 size={12} className="inline mx-0.5" /> <strong className="text-white">Share</strong> button in Safari
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">2</span>
                      Scroll down and tap <strong className="text-white">Add to Home Screen</strong>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">3</span>
                      Tap <strong className="text-white">Add</strong> in the top right
                    </li>
                  </ol>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowIOSInstructions(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/20 hover:bg-white/30 text-white transition-colors"
                  >
                    <PlusSquare size={13} />
                    Got it
                  </motion.button>
                  <button
                    onClick={handleDismiss}
                    className="text-xs text-white/50 hover:text-white/80 transition-colors text-center"
                  >
                    Don&apos;t show again
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
