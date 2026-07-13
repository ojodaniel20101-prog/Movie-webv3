import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import ChannelCard, { ChannelCardSkeleton } from './ChannelCard';
import type { Channel } from '@/types/livetv';

interface Props {
  title:    string;
  icon?:    React.ReactNode;
  channels: Channel[];
  loading?: boolean;
  linkTo?:  string;
  onLinkClick?: () => void;
}

export default function ChannelRow({ title, icon, channels, loading, linkTo, onLinkClick }: Props) {
  if (!loading && channels.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-primary-400 flex-shrink-0">{icon}</span>}
          <h2 className="section-title truncate">{title}</h2>
        </div>
        {linkTo && (
          <Link
            to={linkTo}
            onClick={onLinkClick}
            className="flex items-center gap-1 text-xs font-semibold whitespace-nowrap flex-shrink-0"
            style={{ color: 'var(--primary-light)' }}
          >
            All <ChevronRight size={13} />
          </Link>
        )}
      </div>

      <div className="scroll-row px-4 md:px-6 lg:px-8">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <ChannelCardSkeleton key={i} />)
          : channels.map(ch => <ChannelCard key={ch.id} channel={ch} size="compact" />)}
      </div>
    </motion.section>
  );
}
