import { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Heart, Bookmark, Share2, MessageCircle, Play, Star, ChevronDown, ChevronUp } from 'lucide-react';
import YouTubeEmbed   from './YouTubeEmbed';
import ShareSheet     from './ShareSheet';
import CommentDrawer  from './CommentDrawer';
import type { TrailerItem }       from '@/services/trailers';
import type { TrailerFeedControls } from '@/hooks/useTrailerFeed';
import { useTrailerStore, formatLikeCount, type Reaction } from '@/store/useTrailerStore';
import { useAuthStore } from '@/store/useAuthStore';

const REACTIONS: { id: Reaction; emoji: string; label: string }[] = [
  { id: 'love',         emoji: '❤️', label: 'Love'         },
  { id: 'hype',         emoji: '🔥', label: 'Hype'         },
  { id: 'scary',        emoji: '😱', label: 'Scary'        },
  { id: 'funny',        emoji: '😂', label: 'Funny'        },
  { id: 'mind_blowing', emoji: '🤯', label: 'Mind-Blowing' },
];

function ContentBadge({ type, badge }: { type: string; badge?: string }) {
  const colors: Record<string, string> = {
    movie: 'rgba(123,111,240,0.85)',
    tv:    'rgba(14,165,233,0.85)',
    anime: 'rgba(236,72,153,0.85)',
  };
  const labels: Record<string, string> = { movie: 'Movie', tv: 'TV Show', anime: 'Anime' };
  return (
    <div className="flex items-center gap-1.5">
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
        style={{ background: colors[type] ?? 'rgba(255,255,255,0.2)' }}>
        {labels[type] ?? type}
      </span>
      {badge && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: 'rgba(245,158,11,0.75)' }}>
          {badge}
        </span>
      )}
    </div>
  );
}

interface Props {
  item:         TrailerItem;
  isActive:     boolean;
  feedControls: TrailerFeedControls;
  onEnded?:     () => void; // ← NEW: propagated from TrailersPage for auto-scroll
}

function TrailerCard({ item, isActive, feedControls, onEnded }: Props) {
  const { user, isAuthenticated } = useAuthStore();
  const {
    likes, liked, saved, reactions,
    fetchSocialState, toggleLike, toggleSave, setReaction, recordView,
  } = useTrailerStore();

  const [shareOpen,   setShareOpen]   = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [reactOpen,   setReactOpen]   = useState(false);
  const [expanded,    setExpanded]    = useState(false);

  const key       = item.id;
  const likeCount = likes[key] ?? 0;
  const isLiked   = liked[key] ?? false;
  const isSaved   = saved[key] ?? false;
  const myReact   = reactions[key] ?? null;

  // ── FIX: fetch social state on mount AND when userId changes (auth loads later) ──
  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const uid = user?.id;
    if (uid !== prevUserIdRef.current) {
      prevUserIdRef.current = uid;
      fetchSocialState(String(item.contentId), item.contentType, uid);
    } else if (!prevUserIdRef.current) {
      // First render, no user yet — fetch anon count anyway
      fetchSocialState(String(item.contentId), item.contentType, undefined);
    }
  }, [user?.id, item.contentId, item.contentType, fetchSocialState]);

  // ── Record view on first activation ──────────────────────────────────────
  const viewedRef = useRef(false);
  useEffect(() => {
    if (isActive && !viewedRef.current) {
      viewedRef.current = true;
      recordView(item, user?.id);
    }
  }, [isActive, item, user?.id, recordView]);

  const requireAuth = (fn: () => void) => {
    if (!isAuthenticated) { window.location.href = '/auth'; return; }
    fn();
  };

  const watchHref = `/details/${item.contentType}/${item.contentId}`;

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-black">

      {/* YouTube embed */}
      <YouTubeEmbed
        youtubeKey={item.youtubeKey}
        trailerId={item.id}
        posterPath={item.backdropPath || item.posterPath}
        registerIframe={feedControls.registerIframe}
        priority={isActive}
        onEnded={isActive ? onEnded : undefined}
      />

      {/* Gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 h-[60%]"
          style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.94) 0%,rgba(0,0,0,0.5) 50%,transparent 100%)' }} />
        <div className="absolute top-0 left-0 right-0 h-28"
          style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 100%)' }} />
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────────── */}
      <div className="absolute right-3 bottom-36 z-20 flex flex-col items-center gap-5">

        {/* Like */}
        <motion.button onClick={() => requireAuth(() => toggleLike(item, user!.id))}
          className="flex flex-col items-center gap-1" whileTap={{ scale: 0.8 }}>
          <motion.div
            animate={isLiked ? { scale: [1, 1.35, 1] } : { scale: 1 }}
            transition={{ duration: 0.3 }}
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{
              background:    isLiked ? 'rgba(236,72,153,0.25)' : 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(8px)',
              border:        '1px solid rgba(255,255,255,0.1)',
            }}>
            <Heart size={22} className={`transition-colors ${isLiked ? 'text-pink-500 fill-pink-500' : 'text-white'}`} />
          </motion.div>
          <span className="text-white text-[10px] font-semibold leading-none min-h-[12px]">
            {isLiked
              ? (formatLikeCount(likeCount) ?? '❤️')
              : (formatLikeCount(likeCount) ?? '')}
          </span>
        </motion.button>

        {/* Save */}
        <motion.button onClick={() => requireAuth(() => toggleSave(item, user!.id))}
          className="flex flex-col items-center gap-1" whileTap={{ scale: 0.8 }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{
              background:    isSaved ? 'rgba(123,111,240,0.3)' : 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(8px)',
              border:        '1px solid rgba(255,255,255,0.1)',
            }}>
            <Bookmark size={20}
              className={`transition-colors ${isSaved ? 'text-primary-400 fill-primary-400' : 'text-white'}`} />
          </div>
          <span className="text-white text-[10px] font-semibold leading-none min-h-[12px]">
            {isSaved ? 'Saved' : ''}
          </span>
        </motion.button>

        {/* Comments */}
        <motion.button onClick={() => setCommentOpen(true)}
          className="flex flex-col items-center gap-1" whileTap={{ scale: 0.8 }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <MessageCircle size={20} className="text-white" />
          </div>
        </motion.button>

        {/* Share */}
        <motion.button onClick={() => setShareOpen(true)}
          className="flex flex-col items-center gap-1" whileTap={{ scale: 0.8 }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Share2 size={18} className="text-white" />
          </div>
        </motion.button>

        {/* Reaction */}
        <div className="relative flex flex-col items-center gap-1">
          <motion.button onClick={() => setReactOpen((v) => !v)}
            className="flex flex-col items-center gap-1" whileTap={{ scale: 0.8 }}>
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-lg"
              style={{
                background:    myReact ? 'rgba(123,111,240,0.3)' : 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(8px)',
                border:        `1px solid ${myReact ? 'rgba(123,111,240,0.5)' : 'rgba(255,255,255,0.1)'}`,
              }}>
              {myReact ? REACTIONS.find((r) => r.id === myReact)?.emoji ?? '😊' : '😊'}
            </div>
          </motion.button>

          <AnimatePresence>
            {reactOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                className="absolute bottom-14 right-0 flex flex-col gap-2 p-2 rounded-2xl z-50"
                style={{ background: 'rgba(12,12,22,0.96)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(16px)' }}>
                {REACTIONS.map((r) => (
                  <motion.button key={r.id}
                    onClick={() => requireAuth(() => { setReaction(item, user!.id, r.id); setReactOpen(false); })}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${myReact === r.id ? 'ring-2 ring-primary-500' : ''}`}
                    style={{ background: myReact === r.id ? 'rgba(123,111,240,0.25)' : 'rgba(255,255,255,0.05)' }}
                    whileTap={{ scale: 0.85 }} title={r.label}>
                    {r.emoji}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Bottom info ───────────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-16 z-20 p-4 pb-6">
        <ContentBadge type={item.contentType} badge={item.badge} />

        <h2 className="text-white font-bold text-xl mt-2 leading-tight line-clamp-2">{item.title}</h2>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {item.releaseYear && <span className="text-gray-400 text-xs">{item.releaseYear}</span>}
          {item.rating > 0 && (
            <span className="flex items-center gap-1 text-amber-400 text-xs font-semibold">
              <Star size={11} className="fill-amber-400" />
              {item.rating.toFixed(1)}
            </span>
          )}
          {item.runtime && (
            <span className="text-gray-500 text-xs">
              {item.contentType === 'tv'
                ? `${item.runtime}m / ep`
                : `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m`}
            </span>
          )}
        </div>

        {item.genres.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {item.genres.slice(0, 3).map((g) => (
              <span key={g} className="px-2 py-0.5 rounded-full text-[10px] text-gray-300 font-medium"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {g}
              </span>
            ))}
          </div>
        )}

        {item.overview && (
          <div className="mt-2">
            <p className={`text-gray-400 text-xs leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
              {item.overview}
            </p>
            {item.overview.length > 90 && (
              <button onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-0.5 text-primary-400 text-[11px] mt-0.5">
                {expanded ? <><ChevronUp size={11}/> less</> : <><ChevronDown size={11}/> more</>}
              </button>
            )}
          </div>
        )}

        <Link to={watchHref}>
          <motion.div
            className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg shadow-primary-500/20"
            style={{ background: 'linear-gradient(135deg,#7B6FF0,#22D3EE)' }}
            whileTap={{ scale: 0.95 }}>
            <Play size={14} className="fill-white" /> Watch Now
          </motion.div>
        </Link>
      </div>

      <ShareSheet isOpen={shareOpen} onClose={() => setShareOpen(false)}
        title={item.title} contentType={item.contentType} contentId={item.contentId} />
      <CommentDrawer isOpen={commentOpen} onClose={() => setCommentOpen(false)}
        contentId={item.contentId} contentType={item.contentType} title={item.title} />
    </div>
  );
}

export default memo(TrailerCard);
