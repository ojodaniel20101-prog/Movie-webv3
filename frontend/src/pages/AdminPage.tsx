import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, MessageCircle, Ban, CheckCircle,
  Shield, ChevronLeft, Loader2, Search, XCircle, UserCheck,
  Clock, AlertCircle, TrendingUp, Radio,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  email: string;
  display_name: string;
  photo_url: string | null;
  role: 'user' | 'admin';
  is_banned: boolean;
  ban_reason: string | null;
  is_online: boolean;
  last_seen: string;
  created_at: string;
  watchlist_count: number;
  watched_count: number;
}

interface SupportChat {
  id: string;
  user_id: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  topic: string;
  subject: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_admin: number;
  created_at: string;
  profiles?: { display_name: string; email: string } | null;
}

type Tab = 'overview' | 'users' | 'tickets' | 'guests';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string | null) {
  if (!iso) return '—';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  open:        { label: 'Open',        color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',  icon: AlertCircle },
  in_progress: { label: 'In Progress', color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20',  icon: Clock },
  resolved:    { label: 'Resolved',    color: 'text-primary-400', bg: 'bg-primary-500/10 border-primary-500/20', icon: CheckCircle },
  closed:      { label: 'Closed',      color: 'text-gray-400',   bg: 'bg-white/5 border-white/10',          icon: XCircle },
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const navigate = useNavigate();
  const { user, isAdmin, isLoading: authLoading } = useAuthStore();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<Profile[]>([]);
  const [tickets, setTickets] = useState<SupportChat[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [guestsOnline, setGuestsOnline] = useState(0);
  const [guests, setGuests] = useState<any[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/', { replace: true });
      toast.error('Access denied');
    }
  }, [authLoading, isAdmin, navigate]);

  // Fetch users
  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers();
    fetchTickets();
    const fetchGuests = () => {
      fetch('/api/admin/guests-online')
        .then(r => r.json())
        .then(d => { setGuestsOnline(d.count || 0); setGuests(d.guests || []); })
        .catch(() => {});
    };
    fetchGuests();
    const guestInterval = setInterval(fetchGuests, 30000);
    return () => clearInterval(guestInterval);
  }, [isAdmin]);

  async function fetchUsers() {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load users');
      console.error(error);
    } else {
      setUsers(data || []);
    }
    setLoadingUsers(false);
  }

  async function fetchTickets() {
    setLoadingTickets(true);
    const { data, error } = await supabase
      .from('support_chats')
      .select('*, profiles:user_id (display_name, email)')
      .order('updated_at', { ascending: false });

    if (error) {
      toast.error('Failed to load tickets');
      console.error(error);
    } else {
      setTickets(data || []);
    }
    setLoadingTickets(false);
  }

  async function toggleBan(userId: string, currentlyBanned: boolean) {
    setActionInProgress(userId);
    const { error } = await supabase
      .from('profiles')
      .update({
        is_banned: !currentlyBanned,
        ban_reason: !currentlyBanned ? 'Banned by admin' : null,
        banned_at: !currentlyBanned ? new Date().toISOString() : null,
      })
      .eq('id', userId);

    if (error) {
      toast.error('Failed to update user');
      console.error(error);
    } else {
      toast.success(currentlyBanned ? 'User unbanned' : 'User banned');
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, is_banned: !currentlyBanned, ban_reason: !currentlyBanned ? 'Banned by admin' : null } : u
      ));
    }
    setActionInProgress(null);
  }

  async function updateTicketStatus(ticketId: string, status: string) {
    setActionInProgress(ticketId);
    const { error } = await supabase
      .from('support_chats')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', ticketId);

    if (error) {
      toast.error('Failed to update ticket');
      console.error(error);
    } else {
      toast.success('Ticket updated');
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: status as SupportChat['status'] } : t));
    }
    setActionInProgress(null);
  }

  // ─── Derived data ──────────────────────────────────────────────────────────
  const totalUsers = users.length;
  const isReallyOnline = (u: any) => u.is_online && new Date().getTime() - new Date(u.last_seen).getTime() < 60000;
  const onlineUsers = users.filter(isReallyOnline).length;
  const [filterOnline, setFilterOnline] = useState(false);
  const displayedUsers = filterOnline ? users.filter(isReallyOnline) : users;
  const bannedUsers = users.filter(u => u.is_banned).length;
  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const adminUsers = users.filter(u => u.role === 'admin').length;

  const filteredUsers = users.filter(u =>
    u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 size={32} className="text-primary-400 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-dvh pb-20" style={{ background: 'var(--bg)' }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 border-b border-white/[0.06]" style={{ background: 'rgba(6,6,15,0.85)', backdropFilter: 'var(--blur)' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/profile" className="p-2 rounded-xl hover:bg-white/5 transition-colors">
            <ChevronLeft size={20} className="text-gray-400" />
          </Link>
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-amber-400" />
            <h1 className="font-display font-bold text-lg text-white">Admin Dashboard</h1>
          </div>
          <span className="ml-auto text-xs px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 font-medium">
            {user?.email}
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ── Tab Navigation ──────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {([
            { key: 'overview', label: 'Overview', icon: LayoutDashboard },
            { key: 'users', label: 'Users', icon: Users },
            { key: 'tickets', label: 'Support Tickets', icon: MessageCircle },
                { key: 'guests', label: 'Guests', icon: Radio },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === key
                  ? 'bg-primary-500/15 border border-primary-500/30 text-primary-400'
                  : 'bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:bg-white/[0.06] hover:text-gray-300'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ═══════════════════════════════════════════════════════════════════
              OVERVIEW TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Total Users', value: totalUsers, icon: Users, color: 'text-primary-400', bg: 'bg-primary-500/10' },
                  { label: 'Online Now', value: onlineUsers, icon: Radio, color: 'text-green-400', bg: 'bg-green-500/10', onClick: () => { setFilterOnline(f => !f); setActiveTab('users'); } },
                  { label: 'Admins', value: adminUsers, icon: Shield, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                  { label: 'Banned', value: bannedUsers, icon: Ban, color: 'text-red-400', bg: 'bg-red-500/10' },
                  { label: 'Open Tickets', value: openTickets, icon: MessageCircle, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                  { label: 'Guests Online', value: guestsOnline, icon: Radio, color: 'text-blue-400', bg: 'bg-blue-500/10', onClick: () => setActiveTab('guests') },
                ].map(({ label, value, icon: Icon, color, bg, onClick }) => (
                  <div key={label} onClick={onClick} className={`rounded-2xl p-4 border border-white/[0.07] ${onClick ? 'cursor-pointer hover:border-green-400/40 transition-colors' : ''}`} style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(16px)' }}>
                    <Icon size={18} className={`${color} mb-2`} />
                    <p className="font-display font-black text-2xl text-white">{value}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>

              {/* Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Latest Users */}
                <div className="rounded-2xl border border-white/[0.07] p-5" style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(16px)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display font-bold text-white flex items-center gap-2">
                      <Users size={16} className="text-primary-400" /> Latest Users
                    </h2>
                    <button onClick={() => setActiveTab('users')} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">View all</button>
                  </div>
                  <div className="space-y-2">
                    {users.slice(0, 5).map(u => (
                      <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] transition-colors">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500/30 to-primary-600/10 flex items-center justify-center text-xs font-bold text-primary-400 border border-primary-500/20">
                          {u.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{u.display_name}</p>
                          <p className="text-xs text-gray-500 truncate">{u.email}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${u.is_online && new Date().getTime() - new Date(u.last_seen).getTime() < 60000 ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-gray-500'}`}>
                          {u.is_online && new Date().getTime() - new Date(u.last_seen).getTime() < 60000 ? 'Online' : timeAgo(u.last_seen)}
                        </span>
                      </div>
                    ))}
                    {users.length === 0 && !loadingUsers && (
                      <p className="text-sm text-gray-500 text-center py-4">No users found</p>
                    )}
                  </div>
                </div>

                {/* Latest Tickets */}
                <div className="rounded-2xl border border-white/[0.07] p-5" style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(16px)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display font-bold text-white flex items-center gap-2">
                      <MessageCircle size={16} className="text-cyan-400" /> Latest Tickets
                    </h2>
                    <button onClick={() => setActiveTab('tickets')} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">View all</button>
                  </div>
                  <div className="space-y-2">
                    {tickets.slice(0, 5).map(t => {
                      const meta = STATUS_META[t.status] || STATUS_META.closed;
                      const StatusIcon = meta.icon;
                      return (
                        <div key={t.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] transition-colors">
                          <div className={`p-1.5 rounded-lg ${meta.bg}`}>
                            <StatusIcon size={14} className={meta.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{t.subject}</p>
                            <p className="text-xs text-gray-500">{t.profiles?.display_name || 'Unknown'}</p>
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>{meta.label}</span>
                        </div>
                      );
                    })}
                    {tickets.length === 0 && !loadingTickets && (
                      <p className="text-sm text-gray-500 text-center py-4">No tickets found</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              USERS TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              {/* Search */}
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500/50 transition-colors"
                />
              </div>

              {/* Users Table */}
              <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(16px)' }}>
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="text-primary-400 animate-spin" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users size={32} className="text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No users found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">User</th>
                          <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                          <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Role</th>
                          <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden md:table-cell">Joined</th>
                          <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden lg:table-cell">Activity</th>
                          <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map(u => (
                          <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {u.photo_url ? (
                                  <img src={u.photo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-white/10" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500/30 to-primary-600/10 flex items-center justify-center text-xs font-bold text-primary-400 border border-primary-500/20">
                                    {u.display_name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <p className="text-white font-medium">{u.display_name}</p>
                                  <p className="text-xs text-gray-500">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${u.is_online ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-gray-500'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${u.is_online && new Date().getTime() - new Date(u.last_seen).getTime() < 60000 ? 'bg-green-400' : 'bg-gray-600'}`} />
                                {u.is_online && new Date().getTime() - new Date(u.last_seen).getTime() < 60000 ? 'Online' : 'Offline'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-white/5 text-gray-400'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{formatDate(u.created_at)}</td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <div className="text-xs text-gray-500">
                                <span className="text-gray-400">{u.watched_count}</span> watched · <span className="text-gray-400">{u.watchlist_count}</span> saved
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => toggleBan(u.id, u.is_banned)}
                                disabled={actionInProgress === u.id}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                  u.is_banned
                                    ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20'
                                    : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                } disabled:opacity-50`}
                              >
                                {actionInProgress === u.id ? <Loader2 size={12} className="animate-spin" /> :
                                  u.is_banned ? <><UserCheck size={12} /> Unban</> : <><Ban size={12} /> Ban</>
                                }
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}


          {/* GUESTS TAB */}
          {activeTab === 'guests' && (
            <motion.div key="guests" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <p className="text-xs text-gray-500 px-1">{guests.length} guest{guests.length !== 1 ? 's' : ''} online now</p>
              {guests.length === 0 && (
                <div className="text-center py-12 text-gray-500 text-sm">No guests online right now</div>
              )}
              {guests.map((g: any) => (
                <div key={g.id} onClick={() => setSelectedGuest(selectedGuest?.id === g.id ? null : g)}
                  className="rounded-2xl p-4 border border-white/[0.07] cursor-pointer hover:border-blue-400/40 transition-colors"
                  style={{ background: 'rgba(10,12,24,0.8)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-bold">G</div>
                      <div>
                        <p className="text-sm text-white font-medium">{g.id}</p>
                        <p className="text-xs text-gray-500">{g.device || 'unknown'} · on {g.page}</p>
                      </div>
                    </div>
                    <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">● Online</span>
                  </div>
                  {selectedGuest?.id === g.id && g.activities && g.activities.length > 0 && (
                    <div className="mt-3 border-t border-white/[0.07] pt-3 space-y-2">
                      <p className="text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wider">Session Timeline</p>
                      {g.activities.filter((a: any) => a.type === 'page_enter').slice(-10).reverse().map((a: any, i: number) => {
                        const pageNames: Record<string, { name: string; emoji: string }> = {
                          '/': { name: 'Home', emoji: '🏠' },
                          '/sports': { name: 'Sports', emoji: '⚽' },
                          '/live': { name: 'Live TV', emoji: '📺' },
                          '/anime': { name: 'Anime', emoji: '🍥' },
                          '/search': { name: 'Search', emoji: '🔍' },
                          '/trailers': { name: 'Trailers', emoji: '🎞' },
                          '/watchlist': { name: 'Watchlist', emoji: '📋' },
                          '/profile': { name: 'Profile', emoji: '👤' },
                          '/wrestling': { name: 'Wrestling', emoji: '🤼' },
                        };
                        const leave = g.activities.find((la: any) => la.type === 'page_leave' && la.page === a.page);
                        const info = pageNames[a.page] || { name: a.page.replace('/', '').replace('-', ' ') || 'Home', emoji: '📄' };
                        return (
                          <div key={i} className="flex items-center gap-3 text-xs bg-white/[0.03] rounded-xl px-3 py-2">
                            <span className="text-lg">{info.emoji}</span>
                            <div className="flex-1">
                              <p className="text-white font-medium">{info.name}</p>
                              {leave?.timeSpent && <p className="text-gray-500">{leave.timeSpent < 60 ? `${leave.timeSpent}s` : `${Math.floor(leave.timeSpent/60)}m ${leave.timeSpent%60}s`}</p>}
                            </div>
                            {i === 0 && <span className="text-green-400 text-[10px] font-semibold">NOW</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              TICKETS TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'tickets' && (
            <motion.div
              key="tickets"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(16px)' }}>
                {loadingTickets ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="text-primary-400 animate-spin" />
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageCircle size={32} className="text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No support tickets found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Subject</th>
                          <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">User</th>
                          <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                          <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden md:table-cell">Last Update</th>
                          <th className="text-left text-xs text-gray-500 font-medium px-4 py-3 hidden lg:table-cell">Unread</th>
                          <th className="text-right text-xs text-gray-500 font-medium px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tickets.map(t => {
                          const meta = STATUS_META[t.status] || STATUS_META.closed;
                          const StatusIcon = meta.icon;
                          return (
                            <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-3">
                                <div>
                                  <p className="text-white font-medium">{t.subject}</p>
                                  <span className="text-xs text-gray-500 capitalize">{t.topic}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-400">{t.profiles?.display_name || 'Unknown'}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                                  <StatusIcon size={12} /> {meta.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{timeAgo(t.last_message_at || t.updated_at)}</td>
                              <td className="px-4 py-3 hidden lg:table-cell">
                                {t.unread_admin > 0 ? (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 text-xs font-medium">
                                    {t.unread_admin}
                                  </span>
                                ) : (
                                  <span className="text-gray-600">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {t.status === 'open' && (
                                    <button
                                      onClick={() => updateTicketStatus(t.id, 'in_progress')}
                                      disabled={actionInProgress === t.id}
                                      className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 text-xs transition-all disabled:opacity-50"
                                    >
                                      {actionInProgress === t.id ? <Loader2 size={12} className="animate-spin" /> : 'Start'}
                                    </button>
                                  )}
                                  {(t.status === 'open' || t.status === 'in_progress') && (
                                    <button
                                      onClick={() => updateTicketStatus(t.id, 'resolved')}
                                      disabled={actionInProgress === t.id}
                                      className="px-2 py-1 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 text-xs transition-all disabled:opacity-50"
                                    >
                                      Resolve
                                    </button>
                                  )}
                                  {t.status === 'resolved' && (
                                    <button
                                      onClick={() => updateTicketStatus(t.id, 'closed')}
                                      disabled={actionInProgress === t.id}
                                      className="px-2 py-1 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 text-xs transition-all disabled:opacity-50"
                                    >
                                      Close
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
