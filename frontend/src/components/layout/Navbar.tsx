import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, User, X, ChevronDown,
  Bookmark, Clock, Settings, LogOut, Clapperboard,
  Flame
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

const navLinks = [
  { label: 'Home',      href: '/' },
  { label: 'Movies',    href: '/browse/movies' },
  { label: 'TV Shows',  href: '/browse/tv' },
  { label: 'Anime',     href: '/anime' },
  { label: 'Sports',    href: '/sports' },
  { label: 'Wrestling', href: '/wrestling' },
  { label: 'Live TV',   href: '/live' },
  { label: 'Trailers',  href: '/trailers' },
];

export default function Navbar() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();

  const [searchQuery,  setSearchQuery]  = useState('');
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled,     setScrolled]     = useState(false);
  const [hidden,       setHidden]       = useState(false);

  const searchRef   = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const isHome = location.pathname === '/';

  // Hide on scroll down, show on scroll up
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 60);
      if (y > lastScrollY.current && y > 80 && isHome) {
        setHidden(true);
      } else {
        setHidden(false);
      }
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHome]);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [location]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  }, [searchQuery, navigate]);

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  return (
    <motion.nav
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: hidden ? -80 : 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-500 ${
        scrolled
          ? 'bg-black/60 backdrop-blur-2xl border-b border-white/[0.08] shadow-nav'
          : 'bg-gradient-to-b from-black/60 via-black/20 to-transparent'
      }`}
    >
      <div className="max-w-screen-2xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-3 h-16">

          {/* ─── LOGO (home page only) ───────────────────── */}
          {isHome && <Link to="/" className="flex items-center gap-2.5 flex-shrink-0 group">
            <div className="relative w-9 h-9">
              <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-9 transition-transform duration-300 group-hover:scale-110">
                <defs>
                  <linearGradient id="logo-g" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#7B6FF0"/>
                    <stop offset="100%" stopColor="#22D3EE"/>
                  </linearGradient>
                </defs>
                <rect width="36" height="36" rx="10" fill="url(#logo-g)"/>
                <path d="M8 9h20L16 27h12" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div className="absolute inset-0 rounded-[10px] ring-1 ring-white/10 group-hover:ring-primary-500/30 transition-all duration-300"/>
            </div>
            <span className="font-display font-bold text-xl tracking-tight hidden sm:block">
              <span className="text-white">Zen</span>
              <span className="text-gradient">trix</span>
            </span>
          </Link>}

          {/* ─── DESKTOP NAV ───────────────────────────────── */}
          <div className="hidden md:flex items-center gap-0.5 flex-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive(link.href)
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                {isActive(link.href) && (
                  <motion.div
                    layoutId="nav-active-bg"
                    className="absolute inset-0 rounded-lg"
                    style={{ background: 'rgba(123,111,240,0.12)', border: '1px solid rgba(123,111,240,0.2)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10">{link.label}</span>
              </Link>
            ))}
          </div>

          {/* ─── SEARCH BAR (home page only) ───────────────── */}
          {isHome ? (
            <form
              onSubmit={handleSearch}
              className="flex-1 md:flex-none md:w-56 lg:w-72 relative"
            >
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search movies, shows..."
                className="w-full h-9 pl-9 pr-4 rounded-xl text-sm text-white placeholder-gray-500 outline-none transition-all duration-200 focus:ring-1 focus:ring-primary-500/40"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  fontSize: '16px',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </form>
          ) : (
            <div className="flex-1" />
          )}

          {/* ─── RIGHT ACTIONS (home page only) ──────────── */}
          {isHome && (<div className="flex items-center gap-1.5 flex-shrink-0">)}

            {/* Notifications — desktop only */}
            <motion.button
              className="btn-icon hidden lg:flex relative"
              aria-label="Notifications"
              whileTap={{ scale: 0.92 }}
            >
              <Bell size={17} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full"
                style={{ background: 'var(--primary)', boxShadow: '0 0 6px var(--primary-glow)' }} />
            </motion.button>

            {/* User menu — desktop */}
            {isAuthenticated ? (
              <div ref={userMenuRef} className="relative hidden sm:block">
                <motion.button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 h-9 px-2.5 rounded-xl transition-all"
                  style={{
                    background: userMenuOpen ? 'rgba(123,111,240,0.12)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${userMenuOpen ? 'rgba(123,111,240,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt="" className="w-6 h-6 rounded-lg object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #7B6FF0, #22D3EE)' }}>
                      {user?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-200 hidden md:block max-w-[80px] truncate">
                    {user?.username}
                  </span>
                  <ChevronDown size={12} className={`text-gray-500 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                </motion.button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute right-0 top-full mt-2 w-56 rounded-2xl overflow-hidden"
                      style={{
                        background: 'rgba(10,10,20,0.97)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(24px)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
                      }}
                    >
                      <div className="p-3 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5">
                          {user?.avatar ? (
                            <img src={user.avatar} alt="" className="w-9 h-9 rounded-xl object-cover" />
                          ) : (
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                              style={{ background: 'linear-gradient(135deg, #7B6FF0, #22D3EE)' }}>
                              {user?.username?.[0]?.toUpperCase() || 'U'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{user?.username}</p>
                            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-1.5">
                        {[
                          { icon: Bookmark, label: 'Watchlist', href: '/watchlist' },
                          { icon: Clock,    label: 'History',   href: '/watchlist' },
                          { icon: Settings, label: 'Settings',  href: '/profile' },
                        ].map(({ icon: Icon, label, href }) => (
                          <Link
                            key={label}
                            to={href}
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/[0.06] transition-all duration-150"
                          >
                            <Icon size={15} className="text-gray-500 flex-shrink-0" />
                            {label}
                          </Link>
                        ))}
                      </div>
                      <div className="p-1.5 border-t border-white/[0.06]">
                        <button
                          onClick={() => { logout(); setUserMenuOpen(false); }}
                          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-150"
                        >
                          <LogOut size={15} />
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link to="/auth" className="hidden sm:flex btn-primary text-sm py-2 px-5 gap-1.5">
                Sign In
              </Link>
            )}

            {/* Mobile profile icon */}
            {isAuthenticated ? (
              <Link to="/profile" className="sm:hidden flex-shrink-0" aria-label="Profile">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #7B6FF0, #22D3EE)' }}>
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </Link>
            ) : (
              <Link to="/auth" className="sm:hidden btn-icon" aria-label="Sign In">
                <User size={18} />
              </Link>
            )}
          </div>}
        </div>
      </div>

      {/* ─── MOBILE MENU ─────────────────────────────────── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden overflow-hidden border-t border-white/[0.05]"
            style={{ background: 'rgba(3,3,12,0.98)', backdropFilter: 'blur(24px)' }}
          >
            <div className="p-4 space-y-1">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                >
                  <Link
                    to={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive(link.href)
                        ? 'text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                    style={isActive(link.href) ? {
                      background: 'rgba(123,111,240,0.12)',
                      border: '1px solid rgba(123,111,240,0.2)',
                    } : {}}
                  >
                    <Clapperboard size={16} className={isActive(link.href) ? 'text-primary-400' : 'text-gray-600'} />
                    {link.label}
                  </Link>
                </motion.div>
              ))}

              <div className="pt-3 border-t border-white/[0.06] mt-2">
                {isAuthenticated ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 px-4 py-3 mb-1">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, #7B6FF0, #22D3EE)' }}>
                        {user?.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{user?.username}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                      </div>
                    </div>
                    <Link to="/profile" onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/[0.04]">
                      <User size={16} className="text-gray-600" />
                      Profile & Settings
                    </Link>
                    <button onClick={() => { logout(); setMenuOpen(false); }}
                      className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <Link to="/auth" onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-center h-12 rounded-xl btn-primary text-sm font-semibold">
                    <Flame size={16} />
                    Sign In to Stream
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

