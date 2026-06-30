import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import ChannelCard, { ChannelCardSkeleton } from './ChannelCard';
import type { Channel } from '@/types/livetv';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.025 } } };
const item = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 320, damping: 24 } },
};

interface Props {
  channels: Channel[];
  loading:  boolean;
  total:    number;
  offset:   number;
  limit:    number;
  onPage:   (offset: number) => void;
}

export default function ChannelGrid({ channels, loading, total, offset, limit, onPage }: Props) {
  const pages   = Math.ceil(total / limit);
  const current = Math.floor(offset / limit) + 1;

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
        {loading ? (
          Array.from({ length: 24 }).map((_, i) => <ChannelCardSkeleton key={i} wide />)
        ) : channels.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center gap-3 text-center py-20">
            <Inbox size={40} className="text-gray-700" />
            <div>
              <p className="font-display font-bold text-lg text-white">No channels found</p>
              <p className="text-gray-600 text-sm mt-1">Try a different filter or search term</p>
            </div>
          </div>
        ) : (
          <motion.div
            key={offset}
            variants={container}
            initial="hidden"
            animate="show"
            className="col-span-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4"
          >
            {channels.map(ch => (
              <motion.div key={ch.id} variants={item}>
                <ChannelCard channel={ch} size="full" />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-4 py-6">
          <button
            onClick={() => onPage(Math.max(0, offset - limit))}
            disabled={current <= 1}
            aria-label="Previous page"
            className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-gray-500 text-sm font-medium tabular-nums">
            {current} <span className="text-gray-700">/</span> {pages}
          </span>
          <button
            onClick={() => onPage(Math.min((pages - 1) * limit, offset + limit))}
            disabled={current >= pages}
            aria-label="Next page"
            className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
