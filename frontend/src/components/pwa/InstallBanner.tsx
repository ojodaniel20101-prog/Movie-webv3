import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, PlusSquare, Sparkles } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/**
 * PWA Install Banner - Floating Card Style (AxisLabs-inspired)
 *
 * Shows as a floating card in the bottom-right corner with:
 * - App icon + title + PWA badge
 * - Expandable description section
 * - "Maybe Later" and "Install Now" buttons
 * - iOS: Shows manual instructions (Share → Add to Home Screen)
 */
export default function InstallBanner() {
  const { canInstall, isInstalled, isStandalone, isDismissed, isIOS, install, dismiss } = usePWAInstall();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-4 right-4 z-[9999] w-[340px] max-w-[calc(100vw-2rem)]"
          style={{
            filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.4))',
          }}
        >
          {/* Card */}
          <div
            className="rounded-2xl border border-white/[0.08] overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
            }}
          >
            {/* Header - always visible */}
            <div className="p-4">
              <div className="flex items-start gap-3">
                {/* App Icon */}
                <div
                  className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #7B6FF0 0%, #22D3EE 100%)',
                  }}
                >
                  <span className="text-white font-black text-sm tracking-tight">Z</span>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-bold text-white truncate">
                      Install Zentrix App
                    </p>
                    <span
                      className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider"
                      style={{
                        background: 'rgba(123,111,240,0.2)',
                        color: '#A69BFF',
                        border: '1px solid rgba(123,111,240,0.3)',
                      }}
                    >
                      PWA
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {isIOS
                      ? 'Add to Home Screen for quick access'
                      : 'Fast, immersive, buffer-free streaming'}
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={handleDismiss}
                  className="flex-shrink-0 p-1 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                  aria-label="Dismiss install banner"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Expandable content */}
            <AnimatePresence>
              {!showIOSInstructions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  {/* Expandable description */}
                  <div className="px-4 pb-3">
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors mb-2"
                    >
                      <Sparkles size={12} />
                      <span className="font-semibold uppercase tracking-wider">Ultimate View Experience</span>
                      <motion.span
                        animate={{ rotate: expanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        ▼
                      </motion.span>
                    </button>

                    <AnimatePresence>
                      {expanded && (
                        <motion.p
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs text-gray-500 leading-relaxed overflow-hidden"
                        >
                          Install Zentrix as an application directly on your device.
                          Enjoy quick launcher access and smooth standalone cinematic players!
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Buttons */}
                  <div className="px-4 pb-4 flex items-center gap-2.5">
                    <button
                      onClick={handleDismiss}
                      className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        color: '#9CA3AF',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      Maybe Later
                    </button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleInstall}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-100 transition-colors"
                    >
                      {isIOS ? (
                        <>
                          <Share2 size={13} />
                          How to Install
                        </>
                      ) : (
                        <>
                          <Download size={13} />
                          Install Now
                        </>
                      )}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* iOS Install Instructions */}
            <AnimatePresence>
              {showIOSInstructions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4">
                    <p className="text-sm font-bold text-white mb-3">
                      Install Zentrix on your iPhone
                    </p>
                    <ol className="space-y-2.5 text-xs text-gray-400 mb-4">
                      <li className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: 'rgba(123,111,240,0.15)', color: '#A69BFF' }}>
                          1
                        </span>
                        Tap the <Share2 size={11} className="inline mx-0.5 text-gray-300" /> <strong className="text-gray-300">Share</strong> button in Safari
                      </li>
                      <li className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: 'rgba(123,111,240,0.15)', color: '#A69BFF' }}>
                          2
                        </span>
                        Scroll down and tap <strong className="text-gray-300">Add to Home Screen</strong>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: 'rgba(123,111,240,0.15)', color: '#A69BFF' }}>
                          3
                        </span>
                        Tap <strong className="text-gray-300">Add</strong> in the top right
                      </li>
                    </ol>
                    <div className="flex items-center gap-2.5">
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setShowIOSInstructions(false)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-100 transition-colors"
                      >
                        <PlusSquare size={13} />
                        Got it
                      </motion.button>
                      <button
                        onClick={handleDismiss}
                        className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          color: '#9CA3AF',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        Don&apos;t show again
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
