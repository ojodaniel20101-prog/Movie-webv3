import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Shield, ShieldCheck, ExternalLink, MousePointerClick,
  ListChecks, LayoutGrid, MoreVertical, Settings2, BadgeCheck,
  ChevronLeft, ChevronRight, type LucideIcon,
} from 'lucide-react';

interface Props {
  isOpen:  boolean;
  onClose: () => void;
}

const UBLOCKDNS_URL = 'https://ublockdns.com/';

interface Step {
  icon:        LucideIcon;
  title:       string;
  description: React.ReactNode;
  cta?:        { label: string; href: string };
}

const STEPS: Step[] = [
  {
    icon: ExternalLink,
    title: 'Open uBlockDNS',
    description: (
      <>
        Head over to uBlockDNS, then tap the <strong className="text-white">red "Get Started"</strong> button on the homepage.
      </>
    ),
    cta: { label: 'Open uBlockDNS.com', href: UBLOCKDNS_URL },
  },
  {
    icon: ListChecks,
    title: 'Create your profile',
    description: (
      <>
        Follow the steps on the next page, then tap <strong className="text-white">"Continue to Dashboard"</strong> when you're done.
      </>
    ),
  },
  {
    icon: LayoutGrid,
    title: 'Choose your browser',
    description: (
      <>
        From the platform list, select <strong className="text-white">Chrome</strong>.
      </>
    ),
  },
  {
    icon: MoreVertical,
    title: 'Set Chrome\u2019s DNS',
    description: (
      <>
        In Chrome, tap the <strong className="text-white">⋮ menu</strong> (top-right corner) → <strong className="text-white">Privacy and security</strong>, then follow the steps shown on the uBlockDNS page to finish setup there.
      </>
    ),
  },
  {
    icon: BadgeCheck,
    title: 'Verify connection',
    description: (
      <>
        Back on the uBlockDNS dashboard, tap <strong className="text-white">"Verify Connection"</strong>. Once it turns green, you're done!
      </>
    ),
  },
];

export default function AdBlockGuideModal({ isOpen, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  // Reset to step 1 each time the guide is (re)opened
  useEffect(() => {
    if (isOpen) { setStep(0); setDone(false); }
  }, [isOpen]);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const handleNext = () => {
    if (isLast) setDone(true);
    else setStep(s => s + 1);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-toast bg-black/65 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed bottom-0 left-0 right-0 z-toast rounded-t-3xl overflow-hidden sm:max-w-md sm:mx-auto sm:rounded-3xl sm:bottom-8 sm:left-1/2 sm:-translate-x-1/2"
            style={{ background: 'rgba(12,12,20,0.98)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'var(--shadow-xl)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 pt-3 pb-8 sm:pt-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)' }}>
                    <Shield size={17} className="text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white font-display font-bold text-base leading-tight">Ad-Free Setup</p>
                    <p className="text-gray-500 text-xs mt-0.5">One-time · works across your whole device</p>
                  </div>
                </div>
                <button onClick={onClose} aria-label="Close guide" className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                  <X size={15} className="text-gray-400" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {!done ? (
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {/* Step indicator dots */}
                    <div className="flex items-center gap-1.5 mb-5">
                      {STEPS.map((_, i) => (
                        <div
                          key={i}
                          className="h-1.5 rounded-full transition-all duration-300"
                          style={{
                            width: i === step ? 28 : 8,
                            background: i <= step
                              ? 'linear-gradient(90deg, #7B6FF0, #22D3EE)'
                              : 'rgba(255,255,255,0.1)',
                          }}
                        />
                      ))}
                    </div>

                    <div className="flex items-start gap-3 mb-6">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(123,111,240,0.12)', border: '1px solid rgba(123,111,240,0.22)' }}>
                        <current.icon size={20} className="text-primary-300" />
                      </div>
                      <div className="flex-1 min-w-0 pt-1">
                        <p className="text-2xs font-bold uppercase tracking-widest text-primary-400 mb-1">
                          Step {step + 1} of {STEPS.length}
                        </p>
                        <h3 className="font-display font-bold text-lg text-white leading-tight mb-1.5">
                          {current.title}
                        </h3>
                        <p className="text-sm text-gray-400 leading-relaxed">
                          {current.description}
                        </p>
                      </div>
                    </div>

                    {current.cta && (
                      <a
                        href={current.cta.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary w-full justify-center gap-2 mb-3 text-sm"
                      >
                        <ExternalLink size={15} />
                        {current.cta.label}
                      </a>
                    )}

                    {/* Nav buttons */}
                    <div className="flex items-center gap-2 mt-2">
                      {step > 0 && (
                        <button
                          onClick={() => setStep(s => s - 1)}
                          className="btn-secondary flex-shrink-0 !px-3.5 gap-1.5 text-sm"
                        >
                          <ChevronLeft size={15} />
                          Back
                        </button>
                      )}
                      <button
                        onClick={handleNext}
                        className="btn-primary flex-1 justify-center gap-1.5 text-sm"
                      >
                        {isLast ? "I've done this" : 'Next'}
                        {!isLast && <ChevronRight size={15} />}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                    className="flex flex-col items-center text-center py-4"
                  >
                    <motion.div
                      animate={{ boxShadow: ['0 0 0px rgba(16,185,129,0.4)', '0 0 28px rgba(16,185,129,0.5)', '0 0 0px rgba(16,185,129,0.4)'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                      style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
                    >
                      <ShieldCheck size={30} className="text-emerald-400" />
                    </motion.div>
                    <h3 className="font-display font-bold text-xl text-white mb-1.5">You're all set!</h3>
                    <p className="text-sm text-gray-400 leading-relaxed max-w-xs mb-6">
                      Ads and trackers are now blocked across your entire device — enjoy the cleanest streaming experience.
                    </p>
                    <button onClick={onClose} className="btn-primary w-full justify-center text-sm">
                      <MousePointerClick size={15} className="mr-1.5" />
                      Done
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <p className="text-2xs text-gray-700 text-center mt-5 flex items-center justify-center gap-1">
                <Settings2 size={10} />
                uBlockDNS is an independent third-party service, not affiliated with Zentrix
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
