import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  MessageCircle, Plus, Send, ChevronLeft, ArrowLeft,
  Bug, Lightbulb, Star, AlertCircle, HelpCircle, Layers,
  Check, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type ChatStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type ChatTopic  = 'bug' | 'recommendation' | 'suggestion' | 'issue' | 'general' | 'other';

interface SupportChat {
  id:              string;
  user_id:         string;
  status:          ChatStatus;
  topic:           ChatTopic;
  subject:         string;
  last_message:    string | null;
  last_message_at: string | null;
  unread_admin:    number;
  unread_user:     number;
  created_at:      string;
  updated_at:      string;
}

interface SupportMessage {
  id:          string;
  chat_id:     string;
  sender_id:   string;
  sender_role: 'user' | 'admin';
  content:     string;
  created_at:  string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const TOPIC_META: Record<ChatTopic, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  bug:            { label: 'Bug Report',     icon: Bug,         color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
  recommendation: { label: 'Recommendation', icon: Star,        color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  suggestion:     { label: 'Suggestion',     icon: Lightbulb,   color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20' },
  issue:          { label: 'Issue',          icon: AlertCircle, color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20' },
  general:        { label: 'General',        icon: HelpCircle,  color: 'text-primary-400', bg: 'bg-primary-500/10 border-primary-500/20' },
  other:          { label: 'Other',          icon: Layers,      color: 'text-gray-400',    bg: 'bg-white/5 border-white/10' },
};

const STATUS_META: Record<ChatStatus, { label: string; color: string }> = {
  open:        { label: 'Open',        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  in_progress: { label: 'In Progress', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  resolved:    { label: 'Resolved',    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  closed:      { label: 'Closed',      color: 'text-gray-500 bg-white/5 border-white/10' },
};

function fmtTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)    return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── New Chat Form ─────────────────────────────────────────────────────────────
function NewChatForm({ onCreated }: { onCreated: (chat: SupportChat) => void }) {
  const { user } = useAuthStore();
  const [topic,   setTopic]   = useState<ChatTopic>('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user?.id || !subject.trim() || !message.trim()) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      // Create chat
      const { data: chat, error: chatErr } = await supabase
        .from('support_chats')
        .insert({
          user_id:         user.id,
          topic,
          subject:         subject.trim(),
          last_message:    message.trim(),
          last_message_at: now,
          unread_admin:    1,
          unread_user:     0,
        })
        .select()
        .single();
      if (chatErr) throw chatErr;

      // Create first message
      const { error: msgErr } = await supabase
        .from('support_messages')
        .insert({
          chat_id:     chat.id,
          sender_id:   user.id,
          sender_role: 'user',
          content:     message.trim(),
        });
      if (msgErr) throw msgErr;

      onCreated(chat as SupportChat);
      toast.success('Support request created!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to create chat');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/[0.08] p-6"
      style={{ background: 'rgba(10,12,24,0.9)' }}
    >
      <div className="flex items-center gap-2 mb-5">
        <MessageCircle size={18} className="text-primary-400" />
        <h2 className="font-display font-bold text-white text-lg">New Support Request</h2>
      </div>

      {/* Topic selector */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Topic</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.keys(TOPIC_META) as ChatTopic[]).map(t => {
            const meta = TOPIC_META[t];
            const Icon = meta.icon;
            return (
              <button key={t} onClick={() => setTopic(t)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  topic === t ? `${meta.bg} ${meta.color}` : 'border-white/[0.06] text-gray-500 hover:border-white/10 hover:text-gray-300'
                }`}
              >
                <Icon size={14} className="flex-shrink-0" />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Subject</p>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Brief description of your issue…"
          maxLength={120}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500/40 transition-colors"
        />
      </div>

      {/* Message */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Message</p>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Describe your issue, suggestion, or recommendation in detail…"
          rows={4}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500/40 transition-colors resize-none"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !subject.trim() || !message.trim()}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-500 hover:bg-primary-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        {loading ? 'Sending…' : 'Send Request'}
      </button>
    </motion.div>
  );
}

// ─── Chat Thread ──────────────────────────────────────────────────────────────
function ChatThread({ chat, currentUserId, adminAvatar, onBack }:
  { chat: SupportChat; currentUserId: string; adminAvatar?: string | null; onBack: () => void }
) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text,     setText]     = useState('');
  const [sending,  setSending]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topicMeta = TOPIC_META[chat.topic];
  const TopicIcon = topicMeta.icon;

  // Load messages
  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('chat_id', chat.id)
      .order('created_at', { ascending: true });
    if (data) setMessages(data as SupportMessage[]);

    // Mark user messages as read
    await supabase.from('support_chats')
      .update({ unread_user: 0, updated_at: new Date().toISOString() })
      .eq('id', chat.id);
  }, [chat.id]);

  useEffect(() => {
    loadMessages();
    const channel = supabase.channel(`chat-${chat.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `chat_id=eq.${chat.id}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === (payload.new as SupportMessage).id)) return prev;
          return [...prev, payload.new as SupportMessage];
        });
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chat.id, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!text.trim() || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('support_messages').insert({
        chat_id:     chat.id,
        sender_id:   currentUserId,
        sender_role: 'user',
        content,
      });
      if (error) throw error;
      // Update chat last_message + unread_admin
      await supabase.from('support_chats').update({
        last_message:    content,
        last_message_at: now,
        unread_admin:    chat.unread_admin + 1,
        updated_at:      now,
      }).eq('id', chat.id);
    } catch (e: any) {
      setText(content);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const statusMeta = STATUS_META[chat.status];
  const isClosed   = chat.status === 'closed' || chat.status === 'resolved';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
        <button onClick={onBack}
          aria-label="Back to chat list"
          className="p-2 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-all md:hidden"
        >
          <ChevronLeft size={16} />
        </button>
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border ${topicMeta.bg}`}>
          <TopicIcon size={14} className={topicMeta.color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{chat.subject || 'Support Request'}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${statusMeta.color}`}>
              {statusMeta.label}
            </span>
            <span className={`text-[10px] font-medium ${topicMeta.color}`}>{topicMeta.label}</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle size={28} className="text-gray-700 mx-auto mb-2" />
            <p className="text-xs text-gray-600">No messages yet</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe   = msg.sender_role === 'user';
          const isNext = messages[i + 1]?.sender_role === msg.sender_role;
          return (
            <motion.div key={msg.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              {/* Admin avatar */}
              {!isMe && (
                <div className={`flex-shrink-0 w-7 h-7 rounded-full overflow-hidden ${isNext ? 'invisible' : ''}`}
                  style={{ background: 'linear-gradient(135deg,#7B6FF0,#22D3EE)' }}>
                  {adminAvatar
                    ? <img src={adminAvatar} alt="Admin" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">A</div>
                  }
                </div>
              )}

              <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                {!isMe && !isNext && (
                  <span className="text-[10px] text-gray-600 ml-1">Support Team</span>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? 'bg-primary-500 text-white rounded-br-md'
                    : 'border border-white/[0.08] text-gray-200 rounded-bl-md'
                }`} style={!isMe ? { background: 'rgba(255,255,255,0.04)' } : {}}>
                  {msg.content}
                </div>
                <span className="text-[10px] text-gray-700 px-1">{fmtTime(msg.created_at)}</span>
              </div>
            </motion.div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isClosed ? (
        <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <Check size={13} className="text-gray-600" />
            <p className="text-xs text-gray-600">
              This conversation is {chat.status}. Start a new request if you need further help.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.06]">
          <div className="flex gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type your message…"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500/40 transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={!text.trim() || sending}
              aria-label="Send message"
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-primary-500 hover:bg-primary-400 disabled:opacity-40 transition-all"
            >
              {sending ? <Loader2 size={14} className="animate-spin text-white" /> : <Send size={14} className="text-white" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chat List Item ────────────────────────────────────────────────────────────
function ChatListItem({ chat, isActive, onClick }: {
  chat: SupportChat; isActive: boolean; onClick: () => void;
}) {
  const topicMeta  = TOPIC_META[chat.topic];
  const statusMeta = STATUS_META[chat.status];
  const TopicIcon  = topicMeta.icon;
  const hasUnread  = chat.unread_user > 0;

  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-3.5 rounded-xl transition-all flex gap-3 items-start ${
        isActive ? 'bg-primary-500/10 border border-primary-500/20' : 'hover:bg-white/[0.03] border border-transparent'
      }`}
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border ${topicMeta.bg}`}>
        <TopicIcon size={15} className={topicMeta.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-300'}`}>
            {chat.subject || 'Support Request'}
          </p>
          {chat.last_message_at && (
            <span className="text-[10px] text-gray-600 flex-shrink-0">{fmtTime(chat.last_message_at)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${statusMeta.color}`}>
            {statusMeta.label}
          </span>
        </div>
        {chat.last_message && (
          <p className="text-xs text-gray-600 truncate mt-1">{chat.last_message}</p>
        )}
      </div>
      {hasUnread && (
        <span className="flex-shrink-0 mt-1 w-4 h-4 rounded-full bg-primary-500 flex items-center justify-center text-[9px] font-bold text-white">
          {chat.unread_user}
        </span>
      )}
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SupportChatPage() {
  const { user, profile, isAuthenticated } = useAuthStore();
  const [chats,      setChats]      = useState<SupportChat[]>([]);
  const [activeChat, setActiveChat] = useState<SupportChat | null>(null);
  const [showNew,    setShowNew]    = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');

  const loadChats = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('support_chats')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (data) setChats(data as SupportChat[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    loadChats();
    const channel = supabase.channel('my-support-chats')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'support_chats',
        filter: `user_id=eq.${user.id}`,
      }, loadChats)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, loadChats]);

  const handleChatCreated = (chat: SupportChat) => {
    setChats(prev => [chat, ...prev]);
    setActiveChat(chat);
    setShowNew(false);
    setMobileView('thread');
  };

  const handleSelectChat = (chat: SupportChat) => {
    setActiveChat(chat);
    setShowNew(false);
    setMobileView('thread');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center mx-auto mb-6">
            <MessageCircle size={32} className="text-primary-400" />
          </div>
          <h2 className="font-display font-bold text-2xl text-white mb-3">Sign in to access support</h2>
          <p className="text-gray-500 text-sm mb-8">Report issues and chat with the Zentrix support team.</p>
          <Link to="/auth" className="btn-primary inline-flex items-center gap-2 py-3 px-8 text-sm">Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pt-20 pb-safe">
      {/* Page header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div className="flex items-center gap-3">
          <Link to="/profile" className="p-2 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-all">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="font-display font-bold text-xl text-white">Support</h1>
            <p className="text-xs text-gray-500">Chat with the Zentrix team about issues, bugs, or suggestions</p>
          </div>
        </div>
        <button
          onClick={() => { setShowNew(true); setActiveChat(null); setMobileView('thread'); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-400 hover:bg-primary-500/20 text-sm font-medium transition-all"
        >
          <Plus size={15} /> New Request
        </button>
      </motion.div>

      {/* Layout */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex gap-4 h-[68vh] min-h-[480px]"
      >
        {/* ── Left: Chat list ── */}
        <div className={`
          flex-shrink-0 w-full md:w-64 lg:w-72 flex flex-col
          rounded-2xl border border-white/[0.07] overflow-hidden
          ${mobileView === 'thread' ? 'hidden md:flex' : 'flex'}
        `} style={{ background: 'rgba(10,12,24,0.85)' }}>
          <div className="px-3 py-3 border-b border-white/[0.06]">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Your Requests {chats.length > 0 && <span className="text-gray-600">({chats.length})</span>}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={18} className="animate-spin text-primary-400" />
              </div>
            ) : chats.length === 0 ? (
              <div className="text-center py-10 px-4">
                <MessageCircle size={24} className="text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-600 leading-relaxed">
                  No requests yet. Create one to get help from the team.
                </p>
              </div>
            ) : (
              chats.map(chat => (
                <ChatListItem
                  key={chat.id}
                  chat={chat}
                  isActive={activeChat?.id === chat.id && !showNew}
                  onClick={() => handleSelectChat(chat)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right: Thread / New form ── */}
        <div className={`
          flex-1 rounded-2xl border border-white/[0.07] overflow-hidden flex flex-col
          ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}
        `} style={{ background: 'rgba(10,12,24,0.85)' }}>
          {showNew ? (
            <div className="flex-1 overflow-y-auto p-4">
              <button onClick={() => { setShowNew(false); setMobileView('list'); }}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-4 md:hidden"
              >
                <ChevronLeft size={14} /> Back
              </button>
              <NewChatForm onCreated={handleChatCreated} />
            </div>
          ) : activeChat ? (
            <ChatThread
              key={activeChat.id}
              chat={activeChat}
              currentUserId={user!.id}
              adminAvatar={null}
              onBack={() => setMobileView('list')}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
                <MessageCircle size={26} className="text-primary-400" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Select a conversation</p>
                <p className="text-gray-600 text-sm">Or start a new support request</p>
              </div>
              <button
                onClick={() => { setShowNew(true); setMobileView('thread'); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-400 text-sm font-medium hover:bg-primary-500/20 transition-all"
              >
                <Plus size={14} /> New Request
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
