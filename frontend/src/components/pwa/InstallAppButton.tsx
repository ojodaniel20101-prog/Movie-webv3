import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share2, PlusSquare, CheckCircle2, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface InstallAppButtonProps {
  variant?: 'menu' | 'button' | 'row';
  className?: string;
  onClick?: () => void;
}

/**
 * Reusable Install App button
 *
 * variant 'menu'    — For dropdown menus (icon + label, hover bg)
 * variant 'button'  — Standalone button with icon
 * variant 'row'     — Full-width row (for profile/settings lists)
 */
export default function InstallAppButton({ variant = 'button', className = '', onClick }: InstallAppButtonProps) {
  const { canInstall, isInstalled, isStandalone, isIOS, install, resetDismissed } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  // Don't show if already installed/standalone
  if (isInstalled || isStandalone) {
    if (variant === 'row') {
      return (
        <div className={`flex items-center gap-3 px-4 py-3.5 opacity-50 ${className}`}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5">
            <CheckCircle2 size={14} className="text-emerald-400" />
          </div>
          <span className="flex-1 text-sm font-medium text-gray-400">App Installed</span>
          <CheckCircle2 size={14} className="text-emerald-500" />
        </div>
      );
    }
    return null;
  }

  const handleClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else if (canInstall) {
      await install();
    } else {
      // Browser doesn't support install — try to trigger the prompt by resetting dismissed state
      resetDismissed();
    }
    onClick?.();
  };

  const handleDismissIOS = () => {
    setShowIOSModal(false);
  };

  if (variant === 'menu') {
    return (
      <>
        <button
          onClick={handleClick}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/[0.06] transition-all duration-150 w-full text-left ${className}`}
        >
          <Download size={15} className="text-gray-500 flex-shrink-0" />
          Install App
        </button>

        {/* iOS Install Modal */}
        <IOSInstallModal show={showIOSModal} onClose={handleDismissIOS} />
      </>
    );
  }

  if (variant === 'row') {
    return (
      <>
        <button
          onClick={handleClick}
          className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors group border-t border-white/[0.04] text-left ${className}`}
        >
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5 group-hover:bg-white/10 transition-colors">
            <Smartphone size={14} className="text-primary-400" />
          </div>
          <span className="flex-1 text-sm font-medium text-gray-300 group-hover:text-white transition-colors">Install App</span>
          <Download size={14} className="text-gray-700 group-hover:text-gray-500 transition-colors" />
        </button>

        {/* iOS Install Modal */}
        <IOSInstallModal show={showIOSModal} onClose={handleDismissIOS} />
      </>
    );
  }

  // Default button variant
  return (
    <>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handleClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-primary-500/30 hover:border-primary-500/50 ${className}`}
        style={{
          background: 'linear-gradient(135deg, rgba(123,111,240,0.15), rgba(34,211,238,0.1))',
          color: '#a5b4fc',
        }}
      >
        <Download size={14} />
        Install App
      </motion.button>

      {/* iOS Install Modal */}
      <IOSInstallModal show={showIOSModal} onClose={handleDismissIOS} />
    </>
  );
}

/**
 * iOS Install Instructions Modal
 */
function IOSInstallModal({ show, onClose }: { show: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #0a0e27 0%, #050816 100%)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative p-6 pb-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full opacity-10 blur-3xl pointer-events-none"
                style={{ background: 'radial-gradient(circle, #7B6FF0, transparent 70%)' }}
              />
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #7B6FF0, #22D3EE)' }}>
                  <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
                    <rect width="36" height="36" rx="10" fill="white" fillOpacity="0.15"/>
                    <path d="M8 9h20L16 27h12" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-white/10 transition-colors"
                  aria-label="Close"
                >
                  <X size={18} style={{ color: '#8899AA' }} />
                </button>
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Install Zentrix</h3>
              <p className="text-sm" style={{ color: '#8899AA' }}>
                Add Zentrix to your Home Screen for quick access
              </p>
            </div>

            {/* Steps */}
            <div className="px-6 pb-6 space-y-3">
              {[
                { step: 1, text: 'Tap the', highlight: 'Share', icon: Share2, suffix: 'button in Safari' },
                { step: 2, text: 'Scroll down and tap', highlight: 'Add to Home Screen', icon: PlusSquare, suffix: '' },
                { step: 3, text: 'Tap', highlight: 'Add', icon: CheckCircle2, suffix: 'in the top right' },
              ].map(({ step, text, highlight, icon: Icon, suffix }) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: step * 0.1 }}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #7B6FF0, #22D3EE)' }}>
                    {step}
                  </span>
                  <p className="text-sm text-gray-300">
                    {text}{' '}
                    <span className="font-bold text-white inline-flex items-center gap-1">
                      <Icon size={12} />
                      {highlight}
                    </span>
                    {suffix ? ` ${suffix}` : ''}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onClose}
                className="w-full py-3 rounded-2xl text-sm font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, #7B6FF0, #22D3EE)',
                  boxShadow: '0 4px 20px rgba(123,111,240,0.3)',
                }}
              >
                Got it
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
