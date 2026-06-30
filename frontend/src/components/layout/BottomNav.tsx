import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Search, Radio, Sword, Trophy, Clapperboard } from 'lucide-react';

const tabs = [
  { icon: Home,         label: 'Home',      href: '/',          color: '#7B6FF0' },
  { icon: Search,       label: 'Search',    href: '/search',    color: '#22D3EE' },
  { icon: Radio,        label: 'Live TV',   href: '/live',      color: '#F472B6' },
  { icon: Trophy,       label: 'Sports',    href: '/sports',    color: '#ef4444' },
  { icon: Clapperboard, label: 'Trailers',  href: '/trailers',  color: '#F59E0B' },
];

export default function BottomNav() {
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Background layer */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(2,2,8,0.96)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}
      />

      {/* Subtle glow line at top */}
      <div
        className="absolute top-0 left-8 right-8 h-px"
        style={{ background: 'linear-gradient(to right, transparent, rgba(123,111,240,0.2), rgba(34,211,238,0.15), transparent)' }}
      />

      {/* Tab row */}
      <div className="relative flex items-center justify-around h-[68px] px-1">
        {tabs.map(({ icon: Icon, label, href, color }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              to={href}
              className="relative flex flex-col items-center justify-center gap-1 flex-1 h-full"
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              {/* Active background pill */}
              <AnimatePresence>
                {active && (
                  <motion.div
                    layoutId="bottom-active-pill"
                    className="absolute inset-x-1.5 top-2 bottom-2 rounded-2xl"
                    style={{ background: `${color}18`, border: `1px solid ${color}28` }}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
              </AnimatePresence>

              {/* Icon */}
              <motion.div
                className="relative z-10"
                animate={{ scale: active ? 1.1 : 1, y: active ? -1 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                whileTap={{ scale: 0.88 }}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.3 : 1.7}
                  style={{
                    color: active ? color : 'rgba(160,160,192,0.6)',
                    filter: active ? `drop-shadow(0 0 6px ${color}60)` : 'none',
                    transition: 'color 0.2s, filter 0.2s',
                  }}
                />
              </motion.div>

              {/* Label */}
              <motion.span
                className="relative z-10 text-[9.5px] font-semibold leading-none"
                animate={{ opacity: active ? 1 : 0.45 }}
                transition={{ duration: 0.2 }}
                style={{ color: active ? color : 'rgba(160,160,192,0.7)', letterSpacing: '0.02em' }}
              >
                {label}
              </motion.span>
            </Link>
          );
        })}
      </div>

      {/* Safe area spacer */}
      <div
        className="relative"
        style={{ height: 'env(safe-area-inset-bottom, 0px)', minHeight: '0px' }}
      />
    </div>
  );
}
