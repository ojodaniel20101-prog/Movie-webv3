import { motion } from 'framer-motion';
import { Crown, Users, MessageCircle, Megaphone, ChevronRight, Sparkles } from 'lucide-react';

/* ── Minimal WhatsApp brand glyph (inline SVG, not emoji) ──────────── */
function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.6.1-.2.3-.7.9-.9 1-.2.2-.4.2-.6.1-1.7-.8-2.8-1.5-3.9-3.3-.3-.5.3-.5.8-1.6.1-.2 0-.4-.1-.5-.1-.1-.5-1.2-.7-1.7-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9 1-.9 2.3 0 1.4 1 2.7 1.1 2.9.1.2 1.9 3 4.7 4.1 2.3.9 2.8.7 3.3.7.5-.1 1.7-.7 1.9-1.4.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3zM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.7 1.5 5.2L2 22l4.9-1.3c1.5.8 3.2 1.3 5.1 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/>
    </svg>
  );
}

interface DevPerson {
  name: string;
  role: string;
  color: string;
}

const LEAD_DEV: DevPerson = { name: 'XJUNIOR542', role: 'Lead Developer', color: '#7B6FF0' };

const TEAM: DevPerson[] = [
  { name: 'Unknown',    role: 'Developer', color: '#22D3EE' },
  { name: 'Leo Vallor', role: 'Developer', color: '#F472B6' },
  { name: 'Qwin Grace', role: 'Developer', color: '#2DD4BF' },
];

interface CommunityLink {
  label:    string;
  sublabel: string;
  href:     string;
  icon:     typeof MessageCircle;
  featured?: boolean;
}

const COMMUNITY_LINKS: CommunityLink[] = [
  {
    label: 'ZENTRIX TECH',
    sublabel: 'Join the community group',
    href: 'https://chat.whatsapp.com/CgaMVqHUW2jDSAjt01Xfhl?s=cl&p=a&ilr=0',
    icon: Users,
    featured: true,
  },
  {
    label: 'ZENTRIX TECH',
    sublabel: 'Main announcement channel',
    href: 'https://whatsapp.com/channel/0029VbCjCq80LKZ4i4iWHq22',
    icon: Megaphone,
  },
  {
    label: 'ZENTRIX TECH C²',
    sublabel: 'Secondary channel',
    href: 'https://whatsapp.com/channel/0029VbC37fVGU3BNq6QK2z21',
    icon: Megaphone,
  },
  {
    label: 'Aimbot 2nd',
    sublabel: 'Affiliate channel',
    href: 'https://whatsapp.com/channel/0029VbCucbz3GJOziMSNLl1j',
    icon: Megaphone,
  },
];

function Avatar({ name, color, size = 56 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className="rounded-2xl flex items-center justify-center font-display font-extrabold flex-shrink-0"
      style={{
        width: size, height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(145deg, ${color}33, ${color}10)`,
        border: `1px solid ${color}44`,
        color,
        boxShadow: `0 4px 20px ${color}22`,
      }}
    >
      {initials}
    </div>
  );
}

export default function DevCreditsSection() {
  return (
    <section className="px-4 md:px-6 lg:px-8 py-2">
      <div className="max-w-4xl mx-auto">

        {/* ── Section header ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3"
            style={{ background: 'rgba(123,111,240,0.1)', border: '1px solid rgba(123,111,240,0.2)' }}>
            <Sparkles size={12} className="text-primary-400" />
            <span className="text-2xs font-bold uppercase tracking-widest text-primary-300">Behind Zentrix</span>
          </div>
          <h2 className="font-display font-black text-2xl md:text-3xl text-white">
            Built by <span className="text-gradient">the team</span>
          </h2>
        </motion.div>

        {/* ── Lead dev — featured card ── */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-3xl p-5 md:p-6 mb-4 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(123,111,240,0.12), rgba(34,211,238,0.06))',
            border: '1px solid rgba(123,111,240,0.25)',
          }}
        >
          <motion.div
            className="absolute -right-10 -top-10 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(123,111,240,0.25), transparent 70%)' }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative flex items-center gap-4">
            <Avatar name={LEAD_DEV.name} color={LEAD_DEV.color} size={64} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-display font-bold text-lg md:text-xl text-white tracking-tight">
                  {LEAD_DEV.name}
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.32)', color: '#FCD34D' }}>
                  <Crown size={10} />
                  LEAD DEV
                </span>
              </div>
              <p className="text-sm text-gray-400">{LEAD_DEV.role}</p>
            </div>
          </div>
        </motion.div>

        {/* ── Team grid ── */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10"
        >
          {TEAM.map((dev) => (
            <motion.div
              key={dev.name}
              variants={{
                hidden: { opacity: 0, y: 16 },
                show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
              }}
              className="glass-card-hover flex items-center gap-3 p-4"
            >
              <Avatar name={dev.name} color={dev.color} size={44} />
              <div className="min-w-0">
                <p className="font-semibold text-white text-sm truncate">{dev.name}</p>
                <p className="text-xs text-gray-500">{dev.role}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Community links ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="text-center mb-5">
            <h3 className="font-display font-bold text-lg text-white mb-1">Join the community</h3>
            <p className="text-sm text-gray-500">Updates, support, and behind-the-scenes on WhatsApp</p>
          </div>

          <div className="space-y-2.5 max-w-md mx-auto">
            {COMMUNITY_LINKS.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                whileTap={{ scale: 0.97 }}
                className={`flex items-center gap-3 px-4 rounded-2xl transition-all duration-200 ${
                  link.featured ? 'py-4' : 'py-3'
                }`}
                style={{
                  background: link.featured
                    ? 'linear-gradient(135deg, rgba(37,211,102,0.16), rgba(37,211,102,0.06))'
                    : 'rgba(255,255,255,0.04)',
                  border: link.featured
                    ? '1px solid rgba(37,211,102,0.3)'
                    : '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <div
                  className="rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    width: link.featured ? 42 : 36,
                    height: link.featured ? 42 : 36,
                    background: 'rgba(37,211,102,0.15)',
                    color: '#25D366',
                  }}
                >
                  <WhatsAppIcon size={link.featured ? 21 : 18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-white truncate ${link.featured ? 'text-base' : 'text-sm'}`}>
                    {link.label}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{link.sublabel}</p>
                </div>
                <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />
              </motion.a>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
