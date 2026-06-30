import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface Props {
  isOpen:      boolean;
  onClose:     () => void;
  title:       string;
  contentType: string;
  contentId:   number;
}

/* ── Minimal brand glyphs (inline SVG, not emoji) ─────────────────── */
function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.6.1-.2.3-.7.9-.9 1-.2.2-.4.2-.6.1-1.7-.8-2.8-1.5-3.9-3.3-.3-.5.3-.5.8-1.6.1-.2 0-.4-.1-.5-.1-.1-.5-1.2-.7-1.7-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9 1-.9 2.3 0 1.4 1 2.7 1.1 2.9.1.2 1.9 3 4.7 4.1 2.3.9 2.8.7 3.3.7.5-.1 1.7-.7 1.9-1.4.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3zM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.7 1.5 5.2L2 22l4.9-1.3c1.5.8 3.2 1.3 5.1 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/>
    </svg>
  );
}
function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.6 6.8-1.6 7.5c-.1.5-.4.7-.8.4l-2.3-1.7-1.1 1c-.1.1-.2.2-.5.2l.2-2.5 4.6-4.1c.2-.2 0-.3-.2-.1L9.5 13l-2.4-.7c-.5-.2-.5-.5.1-.8l9.4-3.6c.4-.2.8.1.6.9z"/>
    </svg>
  );
}
function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.5.3v2.7h-1.4c-1.2 0-1.6.8-1.6 1.6V12h2.9l-.5 2.9h-2.4v7c4.8-.8 8.4-4.9 8.4-9.9z"/>
    </svg>
  );
}

export default function ShareSheet({ isOpen, onClose, title, contentType, contentId }: Props) {
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/trailers?content=${contentType}:${contentId}`;
  const text = `Watch the ${title} trailer on Zentrix`;

  const platforms = [
    {
      name:  'WhatsApp',
      icon:  WhatsAppIcon,
      color: '#25D366',
      href:  `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    },
    {
      name:  'Telegram',
      icon:  TelegramIcon,
      color: '#229ED9',
      href:  `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    },
    {
      name:  'X (Twitter)',
      icon:  null,
      glyph: '𝕏',
      color: '#FFFFFF',
      href:  `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    },
    {
      name:  'Facebook',
      icon:  FacebookIcon,
      color: '#1877F2',
      href:  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
  ];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy');
    }
  };

  // Try native share first on mobile
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        onClose();
        return;
      } catch { /* user cancelled */ }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden"
            style={{ background: 'rgba(14,14,22,0.97)', border: '1px solid rgba(255,255,255,0.08)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 pt-2 pb-8">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-white font-semibold text-base">Share Trailer</p>
                  <p className="text-gray-500 text-xs mt-0.5 truncate max-w-[220px]">{title}</p>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center">
                  <X size={15} className="text-gray-400" />
                </button>
              </div>

              {/* Platform grid */}
              <div className="grid grid-cols-4 gap-3 mb-5">
                {platforms.map((p) => (
                  <a
                    key={p.name}
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onClose}
                    className="flex flex-col items-center gap-2"
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-90"
                      style={{ background: `${p.color}22`, border: `1px solid ${p.color}33`, color: p.color }}
                    >
                      {p.icon ? <p.icon size={22} /> : <span className="text-2xl font-bold">{p.glyph}</span>}
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium text-center leading-tight">
                      {p.name.split(' ')[0]}
                    </span>
                  </a>
                ))}
              </div>

              {/* Copy link row */}
              <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="flex-1 text-xs text-gray-400 truncate font-mono">{url}</p>
                <motion.button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                  style={{ background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(123,111,240,0.2)', color: copied ? '#10b981' : '#a78bfa' }}
                  whileTap={{ scale: 0.94 }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </motion.button>
              </div>

              {/* Native share (mobile) */}
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <motion.button
                  onClick={handleNativeShare}
                  className="w-full mt-3 py-3 rounded-2xl text-sm font-semibold text-white/80"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                  whileTap={{ scale: 0.97 }}
                >
                  More options…
                </motion.button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
