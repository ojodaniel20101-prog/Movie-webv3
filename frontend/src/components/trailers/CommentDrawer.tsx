import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Heart, Flag, Trash2, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import toast from 'react-hot-toast';

interface Profile {
  id:               string;
  display_name:     string;
  photo_url:        string | null;
  custom_photo_url: string | null;
}

interface Comment {
  id:           string;
  user_id:      string;
  content_id:   string;
  content_type: string;
  text:         string;
  parent_id:    string | null;
  like_count:   number;
  is_reported:  boolean;
  created_at:   string;
  profile?:     Profile;
}

interface Props {
  isOpen:       boolean;
  onClose:      () => void;
  contentId:    number;
  contentType:  'movie' | 'tv' | 'anime';
  title:        string;
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function Avatar({ profile, size = 32 }: { profile?: Profile; size?: number }) {
  const name = profile?.display_name || 'U';
  const url  = profile?.custom_photo_url || profile?.photo_url;
  return url ? (
    <img src={url} alt={name} className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-xs"
      style={{ width: size, height: size, background: 'linear-gradient(135deg,#7B6FF0,#22D3EE)' }}>
      {name[0].toUpperCase()}
    </div>
  );
}

// ─── Profile cache to avoid re-fetching ──────────────────────────────────────
const profileCache = new Map<string, Profile>();

async function getProfiles(userIds: string[]): Promise<Map<string, Profile>> {
  const missing = userIds.filter((id) => !profileCache.has(id));
  if (missing.length) {
    const { data } = await supabase
      .from('profiles')
      .select('id,display_name,photo_url,custom_photo_url')
      .in('id', missing);
    (data || []).forEach((p: Profile) => profileCache.set(p.id, p));
  }
  const map = new Map<string, Profile>();
  userIds.forEach((id) => { const p = profileCache.get(id); if (p) map.set(id, p); });
  return map;
}

export default function CommentDrawer({ isOpen, onClose, contentId, contentType, title }: Props) {
  const { user, isAuthenticated } = useAuthStore();
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [text,      setText]      = useState('');
  const [sending,   setSending]   = useState(false);
  const [replyTo,   setReplyTo]   = useState<Comment | null>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const cid         = String(contentId);

  // ── Attach profiles to raw comment rows ──────────────────────────────────
  const attachProfiles = async (rows: Comment[]): Promise<Comment[]> => {
    const ids     = [...new Set(rows.map((r) => r.user_id))];
    const profMap = await getProfiles(ids);
    return rows.map((r) => ({ ...r, profile: profMap.get(r.user_id) }));
  };

  // ── Load comments ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);

    supabase
      .from('trailer_comments')
      .select('id,user_id,content_id,content_type,text,parent_id,like_count,is_reported,created_at')
      .eq('content_id', cid)
      .eq('content_type', contentType)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) { console.error('[Comments] load error', error); setLoading(false); return; }
        const withProfiles = await attachProfiles((data as Comment[]) || []);
        setComments(withProfiles);
        setLoading(false);
      });

    // ── Realtime subscription ────────────────────────────────────────────
    const channel = supabase
      .channel(`tc_${cid}_${contentType}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'trailer_comments',
        filter: `content_id=eq.${cid}`,
      }, async (payload) => {
        const newRow = payload.new as Comment;
        const profMap = await getProfiles([newRow.user_id]);
        const withProfile = { ...newRow, profile: profMap.get(newRow.user_id) };
        setComments((prev) =>
          prev.some((c) => c.id === newRow.id) ? prev : [withProfile, ...prev]
        );
      })
      .on('postgres_changes', {
        event:  'DELETE',
        schema: 'public',
        table:  'trailer_comments',
        filter: `content_id=eq.${cid}`,
      }, (payload) => {
        setComments((prev) => prev.filter((c) => c.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [isOpen, cid, contentType]);

  // ── Send comment ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!text.trim() || !user || sending) return;
    setSending(true);
    const { error } = await supabase.from('trailer_comments').insert({
      user_id:      user.id,
      content_id:   cid,
      content_type: contentType,
      text:         text.trim(),
      parent_id:    replyTo?.id ?? null,
    });
    if (error) {
      console.error('[Comments] insert error', error);
      toast.error('Could not post comment');
    } else {
      setText('');
      setReplyTo(null);
    }
    setSending(false);
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase
      .from('trailer_comments').delete().eq('id', commentId);
    if (!error) toast.success('Comment deleted');
  };

  const handleReport = async (commentId: string) => {
    await supabase.from('trailer_comments').update({ is_reported: true }).eq('id', commentId);
    toast.success('Comment reported');
  };

  const handleLikeComment = async (comment: Comment) => {
    const newCount = comment.like_count + 1;
    await supabase.from('trailer_comments').update({ like_count: newCount }).eq('id', comment.id);
    setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, like_count: newCount } : c));
  };

  void title; // used in parent — suppress lint

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} />

          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col"
            style={{ background: 'rgba(10,10,18,0.98)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(24px)', maxHeight: '82vh' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 280 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-primary-400" />
                <p className="text-white font-semibold text-sm">Comments</p>
                <span className="text-xs text-gray-500">({comments.length})</span>
              </div>
              <button onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center">
                <X size={13} className="text-gray-400" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 rounded-full border-2 border-primary-500/40 border-t-primary-500 animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-12">
                  <MessageCircle size={36} className="text-white/10 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No comments yet</p>
                  <p className="text-gray-600 text-xs mt-1">Be the first!</p>
                </div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar profile={c.profile} size={30} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-white text-xs font-semibold truncate">
                          {c.profile?.display_name || 'User'}
                        </span>
                        <span className="text-gray-600 text-[10px]">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed break-words">{c.text}</p>
                      <div className="flex items-center gap-4 mt-1.5">
                        <button onClick={() => handleLikeComment(c)}
                          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-pink-400 transition-colors">
                          <Heart size={11} />
                          {c.like_count > 0 && c.like_count}
                        </button>
                        {isAuthenticated && (
                          <button onClick={() => { setReplyTo(c); inputRef.current?.focus(); }}
                            className="text-[11px] text-gray-500 hover:text-primary-400 transition-colors">
                            Reply
                          </button>
                        )}
                        {user?.id === c.user_id && (
                          <button onClick={() => handleDelete(c.id)}
                            className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-red-400 transition-colors">
                            <Trash2 size={11} />
                          </button>
                        )}
                        {isAuthenticated && user?.id !== c.user_id && !c.is_reported && (
                          <button onClick={() => handleReport(c.id)}
                            className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-amber-400 transition-colors">
                            <Flag size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="px-4 pt-3 pb-8 border-t border-white/[0.06]">
              {replyTo && (
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl bg-primary-500/10 border border-primary-500/20">
                  <span className="text-xs text-primary-300 flex-1 truncate">
                    Replying to {replyTo.profile?.display_name || 'User'}
                  </span>
                  <button onClick={() => setReplyTo(null)}><X size={12} className="text-gray-500" /></button>
                </div>
              )}
              {isAuthenticated ? (
                <div className="flex items-end gap-2">
                  <Avatar size={30} />
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={text}
                      onChange={(e) => setText(e.target.value.slice(0, 500))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      placeholder="Add a comment…"
                      rows={1}
                      className="w-full resize-none px-4 py-2.5 pr-11 rounded-2xl text-sm text-white placeholder-gray-600 outline-none"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', maxHeight: 120 }}
                    />
                    <motion.button onClick={handleSend} disabled={!text.trim() || sending}
                      className="absolute right-2 bottom-2 w-7 h-7 rounded-xl flex items-center justify-center disabled:opacity-30"
                      style={{ background: 'linear-gradient(135deg,#7B6FF0,#22D3EE)' }}
                      whileTap={{ scale: 0.88 }}>
                      {sending
                        ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                        : <Send size={12} className="text-white" />}
                    </motion.button>
                  </div>
                </div>
              ) : (
                <a href="/auth"
                  className="block w-full py-3 rounded-2xl text-center text-sm font-semibold text-white/70"
                  style={{ background: 'rgba(123,111,240,0.15)', border: '1px solid rgba(123,111,240,0.25)' }}>
                  Sign in to comment
                </a>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
