import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, Trash2, Play, HardDrive } from 'lucide-react';
import { useDownloadStore } from '@/store/useDownloadStore';

export default function DownloadsPage() {
  const { downloads, loadDownloads, removeDownload } = useDownloadStore();

  useEffect(() => {
    loadDownloads();
  }, []);

  const handlePlay = (fileUrl: string) => {
    window.open(fileUrl, '_blank');
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Download size={24} style={{ color: '#22D3EE' }} />
        <h1 className="text-2xl font-bold text-white">Downloads</h1>
        <span className="ml-auto text-xs text-gray-500">{downloads.length} item{downloads.length !== 1 ? 's' : ''}</span>
      </div>

      {downloads.length === 0 ? (
        <div className="text-center py-20">
          <HardDrive size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 font-medium">No downloads yet</p>
          <p className="text-gray-600 text-sm mt-1">Downloaded episodes will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {downloads.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-3 rounded-2xl border border-white/[0.07]"
              style={{ background: 'rgba(10,12,24,0.8)' }}
            >
              {/* Thumbnail */}
              <div className="w-16 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-white/5">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Download size={20} className="text-gray-600" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{item.title}</p>
                {item.episodeNumber && (
                  <p className="text-gray-400 text-xs">
                    {item.seasonNumber ? `S${item.seasonNumber} · ` : ''}Ep {item.episodeNumber}
                  </p>
                )}
                <p className="text-gray-600 text-xs mt-1">{formatDate(item.downloadedAt)}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePlay(item.fileUrl)}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(34,211,238,0.15)' }}
                >
                  <Play size={16} style={{ color: '#22D3EE' }} />
                </button>
                <button
                  onClick={() => removeDownload(item.id)}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.1)' }}
                >
                  <Trash2 size={16} style={{ color: '#ef4444' }} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
