import { motion } from 'framer-motion';
import { ChevronUp, Volume2, VolumeX, X } from 'lucide-react';
import { useLiveTvStore } from '@/store/useLiveTvStore';
import { strHue, initials, countryFlag } from '@/lib/livetv';

export default function LiveMiniPlayer() {
  const { channel, isMuted } = useLiveTvStore(s => s.player);
  const { closePlayer, toggleMini, toggleMute } = useLiveTvStore();

  if (!channel) return null;

  const hue   = strHue(channel.name);
  const inits = initials(channel.name);

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0,   opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="fixed inset-x-0 z-live-player px-3"
      style={{ bottom: 'calc(var(--bottom-nav-h) + var(--safe-bottom) + 8px)' }}
    >
      <div
        className="flex items-center gap-3 px-3 py-2.5 max-w-lg mx-auto rounded-2xl"
        style={{ background: 'rgba(8,8,18,0.92)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'var(--shadow-xl)' }}
      >
        <button
          onClick={() => toggleMini(false)}
          aria-label="Expand player"
          className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center font-display font-extrabold text-sm cursor-pointer"
          style={{ background: `hsl(${hue},50%,16%)`, color: `hsl(${hue},55%,62%)` }}
        >
          {inits}
        </button>

        <button className="flex-1 min-w-0 text-left" onClick={() => toggleMini(false)}>
          <p className="font-medium text-white text-sm truncate leading-tight">{channel.name}</p>
          <p className="text-gray-500 text-xs flex items-center gap-1 mt-0.5">
            <span className="w-[5px] h-[5px] rounded-full inline-block animate-pulse" style={{ background: '#FF3B30' }} />
            LIVE · {channel.country && countryFlag(channel.country)}&nbsp;{channel.country}
          </p>
        </button>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'} className="btn-icon !w-8 !h-8 !min-w-8" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <button onClick={() => toggleMini(false)} aria-label="Expand player" className="btn-icon !w-8 !h-8 !min-w-8" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <ChevronUp size={14} />
          </button>
          <button onClick={closePlayer} aria-label="Close player" className="btn-icon !w-8 !h-8 !min-w-8" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
