import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import {
  LogOut, Bookmark, Heart, Clock,
  ChevronRight, Shield, Bell, Info,
  Edit2, Check, Film, Tv, Sparkles, MapPin,
  Camera, X, Upload, LayoutDashboard,
  User as UserIcon, FileText, Lock, MessageCircle,
  Loader2, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { checkDisplayNameAvailable } from '@/lib/supabase';
import { useWatchlistStore } from '@/store/useWatchlistStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import toast from 'react-hot-toast';

function formatDate(val: string | null | undefined): string {
  if (!val) return 'Unknown';
  try { return new Date(val).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return 'Unknown'; }
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const {
    user, profile, isAuthenticated, isAdmin,
    logout, updateProfile, uploadProfilePhoto, uploadProgress,
  } = useAuthStore();
  const { items: watchlist, favorites } = useWatchlistStore();
  const { items: history }              = useHistoryStore();

  const [editingName,  setEditingName]  = useState(false);
  const [editingBio,   setEditingBio]   = useState(false);
  const [editingLoc,   setEditingLoc]   = useState(false);
  const [newName,      setNewName]      = useState(user?.username ?? '');
  const [nameStatus,   setNameStatus]   = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [newBio,       setNewBio]       = useState(profile?.bio ?? '');
  const [newLocation,  setNewLocation]  = useState(profile?.location ?? '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogout = async () => { await logout(); navigate('/'); };

  // Debounced real-time availability check while the user types a new name.
  // Skips the check entirely if it's unchanged from their current name.
  useEffect(() => {
    if (!editingName) return;
    const trimmed = newName.trim();

    if (trimmed.length < 2) { setNameStatus(trimmed.length === 0 ? 'idle' : 'invalid'); return; }
    if (trimmed.toLowerCase() === (user?.username ?? '').toLowerCase()) { setNameStatus('idle'); return; }

    setNameStatus('checking');
    const t = setTimeout(async () => {
      try {
        const available = await checkDisplayNameAvailable(trimmed, user?.id ?? '');
        setNameStatus(available ? 'available' : 'taken');
      } catch {
        setNameStatus('idle'); // fail open — the save itself still double-checks
      }
    }, 450);

    return () => clearTimeout(t);
  }, [newName, editingName, user?.username, user?.id]);

  const handleSaveName = async () => {
    const trimmed = newName.trim();
    if (trimmed.length < 2) { toast.error('Name must be at least 2 characters'); return; }
    if (nameStatus === 'taken') { toast.error('That name is already taken — choose another'); return; }
    if (nameStatus === 'checking') return; // let the in-flight check finish first

    try {
      await updateProfile({ display_name: trimmed });
      toast.success('Name updated!');
      setEditingName(false);
      setNameStatus('idle');
    } catch (err: unknown) {
      // Safety net in case of a race (someone else grabbed the name between
      // the live-check and the save) — the DB's unique constraint is the
      // real source of truth, this is just a friendly message for it.
      const code = (err as { code?: string })?.code;
      if (code === '23505') {
        setNameStatus('taken');
        toast.error('That name is already taken — choose another');
      } else {
        toast.error('Could not update name — try again');
      }
    }
  };

  const handleSaveBio = async () => {
    await updateProfile({ bio: newBio });
    toast.success('Bio saved!');
    setEditingBio(false);
  };

  const handleSaveLocation = async () => {
    await updateProfile({ location: newLocation });
    toast.success('Location saved!');
    setEditingLoc(false);
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Max file size is 5 MB'); return; }
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);
    setUploading(true);
    try {
      await uploadProfilePhoto(file);
      toast.success('Profile photo updated!');
    } catch {
      toast.error('Upload failed. Try again.');
      setPhotoPreview(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  }, [uploadProfilePhoto]);

  const avatarSrc = photoPreview ?? user?.avatar ?? null;

  // Watch history genre breakdown
  const watchBreakdown = {
    movies: history.filter(h => h.content_type === 'movie').length,
    tv:     history.filter(h => h.content_type === 'tv').length,
    anime:  history.filter(h => h.content_type === 'anime').length,
  };

  const stats = [
    { label: 'Watchlist', value: watchlist.length, icon: Bookmark, href: '/watchlist', color: 'text-primary-400'  },
    { label: 'Favorites', value: favorites.length, icon: Heart,    href: '/watchlist', color: 'text-accent-pink'  },
    { label: 'Watched',   value: history.length,   icon: Clock,    href: '/watchlist', color: 'text-accent-teal'  },
  ];

  const menuSections = [
    {
      title: 'Account',
      items: [
        { icon: UserIcon,  label: 'Edit Display Name',  action: () => setEditingName(true)     },
        { icon: FileText,  label: 'Edit Bio',           action: () => setEditingBio(true)      },
        { icon: MapPin,    label: 'Set Location',       action: () => setEditingLoc(true)      },
        { icon: Bell,      label: 'Notifications',      action: () => toast('Coming soon — notifications') },
        { icon: Lock,      label: 'Privacy',            action: () => toast('Coming soon — privacy controls') },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: MessageCircle, label: 'Chat Support',    action: () => navigate('/support'),                                     isCta: true },
        { icon: Info,          label: 'About Zentrix',   action: () => toast('Zentrix v2.0 — Powered by Supabase')                       },
      ],
    },
  ];

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center mx-auto mb-6">
            <UserIcon size={32} className="text-primary-400" />
          </div>
          <h2 className="font-display font-bold text-2xl text-white mb-3">Sign in to view your profile</h2>
          <p className="text-gray-500 text-sm mb-8">Your watchlist, favorites, and watch history are all saved to your account.</p>
          <Link to="/auth" className="btn-primary inline-flex items-center gap-2 py-3 px-8 text-sm">
            Sign In with Google
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-20 pb-safe">
      {/* ── Profile Header ─────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-6 border border-white/[0.07] mb-5"
        style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/5 flex items-center justify-center">
              {avatarSrc ? (
                <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-black text-white">{user?.username?.[0]?.toUpperCase() ?? '?'}</span>
              )}
              {(uploading || uploadProgress > 0) && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                  <Upload size={14} className="text-white animate-bounce" />
                  {uploadProgress > 0 && <span className="text-xs text-white font-bold">{uploadProgress}%</span>}
                </div>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Change profile picture"
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-lg bg-primary-500 hover:bg-primary-400 flex items-center justify-center transition-colors shadow-lg"
            >
              <Camera size={12} className="text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {editingName ? (
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        value={newName} onChange={e => setNewName(e.target.value)}
                        className={`w-full bg-white/5 border rounded-lg px-2 py-1 pr-7 text-sm text-white outline-none ${
                          nameStatus === 'taken'   ? 'border-red-500/60' :
                          nameStatus === 'available' ? 'border-emerald-500/60' :
                          'border-primary-500/50'
                        }`}
                        autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2">
                        {nameStatus === 'checking'  && <Loader2 size={13} className="text-gray-500 animate-spin" />}
                        {nameStatus === 'available' && <Check size={13} className="text-emerald-400" />}
                        {nameStatus === 'taken'      && <AlertCircle size={13} className="text-red-400" />}
                      </span>
                    </div>
                    <button
                      onClick={handleSaveName}
                      disabled={nameStatus === 'taken' || nameStatus === 'checking'}
                      aria-label="Save name"
                      className="p-1.5 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    ><Check size={13} /></button>
                    <button onClick={() => { setEditingName(false); setNameStatus('idle'); }} aria-label="Cancel editing name" className="p-1.5 rounded-lg bg-white/5 text-gray-500 hover:bg-white/10 transition-colors"><X size={13} /></button>
                  </div>
                  {nameStatus === 'taken' && (
                    <p className="text-2xs text-red-400 mt-1">This name is already taken — try another</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="font-display font-bold text-xl text-white">{user?.username}</h1>
                  {isAdmin && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 font-medium">Admin</span>}
                  <button onClick={() => { setNewName(user?.username ?? ''); setNameStatus('idle'); setEditingName(true); }} aria-label="Edit name" className="p-1 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-all">
                    <Edit2 size={12} />
                  </button>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
            <p className="text-xs text-gray-700 mt-1">
              Member since {formatDate(profile?.created_at)}
            </p>
            {profile?.location && (
              <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-600">
                <MapPin size={11} /> {profile.location}
              </div>
            )}
          </div>

          {isAdmin && (
            <Link to="/admin" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-400 text-xs font-medium hover:bg-primary-500/20 transition-all flex-shrink-0">
              <LayoutDashboard size={13} /> Admin
            </Link>
          )}
        </div>

        {/* Bio */}
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          {editingBio ? (
            <div className="space-y-2">
              <textarea
                value={newBio} onChange={e => setNewBio(e.target.value)} rows={3} placeholder="Write a bio…"
                className="w-full bg-white/5 border border-primary-500/50 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 outline-none resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleSaveBio} className="px-3 py-1.5 rounded-lg bg-primary-500/20 border border-primary-500/30 text-primary-400 text-xs font-medium hover:bg-primary-500/30 transition-all">Save</button>
                <button onClick={() => setEditingBio(false)} className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-500 text-xs hover:bg-white/10 transition-all">Cancel</button>
              </div>
            </div>
          ) : editingLoc ? (
            <div className="flex items-center gap-2">
              <MapPin size={13} className="text-gray-600 flex-shrink-0" />
              <input
                value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Your location…"
                className="flex-1 bg-white/5 border border-primary-500/50 rounded-lg px-2 py-1 text-sm text-white placeholder-gray-600 outline-none"
                autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSaveLocation(); if (e.key === 'Escape') setEditingLoc(false); }}
              />
              <button onClick={handleSaveLocation} aria-label="Save location" className="p-1.5 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors"><Check size={13} /></button>
              <button onClick={() => setEditingLoc(false)} aria-label="Cancel editing location" className="p-1.5 rounded-lg bg-white/5 text-gray-500 hover:bg-white/10 transition-colors"><X size={13} /></button>
            </div>
          ) : (
            <p className="text-sm text-gray-400 leading-relaxed">
              {profile?.bio || <span className="text-gray-600 italic">Add a bio…</span>}
            </p>
          )}
        </div>
      </motion.div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="grid grid-cols-3 gap-3 mb-5"
      >
        {stats.map(({ label, value, icon: Icon, href, color }) => (
          <Link key={label} to={href} className="rounded-2xl p-4 border border-white/[0.07] hover:border-white/[0.12] transition-all group" style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(16px)' }}>
            <Icon size={18} className={`${color} mb-2`} />
            <p className="font-display font-black text-2xl text-white">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </Link>
        ))}
      </motion.div>

      {/* ── Watch Breakdown ────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-2xl p-4 border border-white/[0.07] mb-5"
          style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(16px)' }}
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Watch History Breakdown</p>
          <div className="flex gap-4">
            {[
              { label: 'Movies', count: watchBreakdown.movies, icon: Film,     color: 'text-blue-400',   bg: 'bg-blue-500/10' },
              { label: 'TV',     count: watchBreakdown.tv,     icon: Tv,       color: 'text-purple-400', bg: 'bg-purple-500/10' },
              { label: 'Anime',  count: watchBreakdown.anime,  icon: Sparkles, color: 'text-pink-400',   bg: 'bg-pink-500/10' },
            ].map(({ label, count, icon: Icon, color, bg }) => (
              <div key={label} className={`flex-1 rounded-xl ${bg} p-3 text-center`}>
                <Icon size={16} className={`${color} mx-auto mb-1`} />
                <p className={`font-black text-lg ${color}`}>{count}</p>
                <p className="text-xs text-gray-600">{label}</p>
              </div>
            ))}
          </div>
          {history.length > 0 && (
            <div className="mt-3">
              <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
                {watchBreakdown.movies > 0 && <div className="bg-blue-500 rounded-l-full"   style={{ width: `${(watchBreakdown.movies / history.length) * 100}%` }} />}
                {watchBreakdown.tv     > 0 && <div className="bg-purple-500"                style={{ width: `${(watchBreakdown.tv     / history.length) * 100}%` }} />}
                {watchBreakdown.anime  > 0 && <div className="bg-pink-500 rounded-r-full"   style={{ width: `${(watchBreakdown.anime  / history.length) * 100}%` }} />}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Menu Sections ──────────────────────────────────────────────────── */}
      {menuSections.map((section, si) => (
        <motion.div key={section.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + si * 0.04 }}
          className="rounded-2xl border border-white/[0.07] mb-3 overflow-hidden"
          style={{ background: 'rgba(10,12,24,0.8)', backdropFilter: 'blur(16px)' }}
        >
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 pt-3 pb-2">{section.title}</p>
          {section.items.map(({ icon: Icon, label, action, isCta }, i) => (
            <button key={label} onClick={action}
              className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors group border-t border-white/[0.04] ${isCta ? 'bg-primary-500/[0.04]' : ''}`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${isCta ? 'bg-primary-500/20 group-hover:bg-primary-500/30' : 'bg-white/5 group-hover:bg-white/10'}`}>
                <Icon size={14} className={isCta ? 'text-primary-400' : 'text-gray-400'} />
              </div>
              <span className={`flex-1 text-sm text-left font-medium ${isCta ? 'text-primary-300' : 'text-gray-300'}`}>{label}</span>
              {isCta && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400 font-semibold border border-primary-500/20">Chat</span>}
              <ChevronRight size={14} className={`${isCta ? 'text-primary-600' : 'text-gray-700'} group-hover:text-gray-500 transition-colors`} />
            </button>
          ))}
        </motion.div>
      ))}

      {/* ── Sign Out ───────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <button onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-all text-sm font-medium"
        >
          <LogOut size={15} /> Sign Out
        </button>
      </motion.div>
    </div>
  );
}
