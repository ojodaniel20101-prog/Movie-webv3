import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Link2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface ShareButtonProps {
  title: string;
  url: string;
  text?: string;
  size?: 'sm' | 'md';
  variant?: 'icon' | 'button';
}

export default function ShareButton({
  title,
  url,
  text,
  size = 'md',
  variant = 'icon',
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const shareText = text || `Check out ${title} on Zentrix`;

  const handleShare = useCallback(async () => {
    // Mobile: native Web Share API
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url,
        });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    // Desktop: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied!', {
        icon: <Check size={14} />,
        duration: 2000,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  }, [title, url, shareText]);

  const sizeClasses =
    size === 'sm'
      ? variant === 'icon'
        ? 'w-8 h-8'
        : 'h-7 px-3 text-xs gap-1.5'
      : variant === 'icon'
        ? 'w-10 h-10'
        : 'h-9 px-4 text-sm gap-2';

  const iconSize = size === 'sm' ? 14 : 16;

  if (variant === 'button') {
    return (
      <motion.button
        onClick={handleShare}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className={`inline-flex items-center justify-center rounded-xl transition-all ${sizeClasses}`}
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span
              key="check"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 90 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5 text-green-400"
            >
              <Check size={iconSize} />
              Copied
            </motion.span>
          ) : (
            <motion.span
              key="share"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5"
            >
              <Share2 size={iconSize} />
              Share
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    );
  }

  // Icon variant
  return (
    <motion.button
      onClick={handleShare}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      className={`inline-flex items-center justify-center rounded-xl transition-all ${sizeClasses}`}
      style={{
        background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
        color: copied ? '#10b981' : '#fff',
      }}
      title="Share"
      aria-label="Share"
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 90 }}
            transition={{ duration: 0.15 }}
          >
            <Check size={iconSize} />
          </motion.span>
        ) : (
          <motion.span
            key="share"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Share2 size={iconSize} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
