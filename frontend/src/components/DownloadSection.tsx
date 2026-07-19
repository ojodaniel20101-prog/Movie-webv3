import { useState } from 'react';
import { useDownloadStore } from '@/store/useDownloadStore';
import { motion } from 'framer-motion';
import { Download, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Episode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
}

interface DownloadSectionProps {
  contentType: 'anime' | 'tv' | 'movie';
  contentId: string;
  title: string;
  episodes: Episode[];
  animeId?: number; // For anime lookup
}

export default function DownloadSection({
  contentType,
  contentId,
  title,
  episodes,
  animeId,
}: DownloadSectionProps) {
  const { addDownload } = useDownloadStore();
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<number>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<number, number>>({});
  const [completedDownloads, setCompletedDownloads] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  if (contentType === 'movie') {
    return null; // Download only for TV/Anime
  }

  const toggleEpisode = (epId: number) => {
    const newSet = new Set(selectedEpisodes);
    if (newSet.has(epId)) {
      newSet.delete(epId);
    } else {
      newSet.add(epId);
    }
    setSelectedEpisodes(newSet);
  };

  const toggleAll = () => {
    if (selectedEpisodes.size === episodes.length) {
      setSelectedEpisodes(new Set());
    } else {
      setSelectedEpisodes(new Set(episodes.map((_, i) => i)));
    }
  };

  const handleDownload = async () => {
    if (selectedEpisodes.size === 0) return;

    setIsDownloading(true);
    setError(null);

    const selectedEps = Array.from(selectedEpisodes)
      .map((idx) => episodes[idx])
      .sort((a, b) => a.episode_number - b.episode_number);

    for (const ep of selectedEps) {
      try {
        if (contentType === 'anime' && title) {
          // Use anime-service backend for real downloads
          setDownloadProgress((prev) => ({ ...prev, [ep.id]: 10 }));

          // 1. Search for anime
          const searchRes = await fetch(`/api/anime/search?q=${encodeURIComponent(title)}`);
          const searchData = await searchRes.json();
          if (!searchData.results?.length) throw new Error('Anime not found');
          setDownloadProgress((prev) => ({ ...prev, [ep.id]: 30 }));

          const animeId = searchData.results[0].id;

          // 2. Get episodes
          const epRes = await fetch(`/api/anime/episodes?id=${encodeURIComponent(animeId)}`);
          const epData = await epRes.json();
          if (!epData.episodes?.length) throw new Error('No episodes found');
          setDownloadProgress((prev) => ({ ...prev, [ep.id]: 50 }));

          const epNum = String(ep.episode_number);
          const matchedEp = epData.episodes.find((e: any) => e.number === epNum)
                         || epData.episodes[parseInt(epNum) - 1];
          if (!matchedEp) throw new Error(`Episode ${ep.episode_number} not found`);

          // 3. Get download URL
          const params = new URLSearchParams({
            anime_id: animeId,
            episode:  epNum,
            ep_id:    matchedEp.ep_id || '',
          });
          setDownloadProgress((prev) => ({ ...prev, [ep.id]: 70 }));

          const srcRes = await fetch(`/api/anime/source?${params}`);
          const srcData = await srcRes.json();
          if (!srcData.success) throw new Error('No download URL found');
          setDownloadProgress((prev) => ({ ...prev, [ep.id]: 90 }));

          // 4. Fetch blob and save to IndexedDB for offline playback
          const downloadUrl = srcData.downloadUrl || srcData.streamUrl;
          if (downloadUrl) {
            setDownloadProgress((prev) => ({ ...prev, [ep.id]: 70 }));
            try {
              const proxyUrl = '/api/anime/stream?url=' + encodeURIComponent(downloadUrl);
              const blobRes = await fetch(proxyUrl);
              const blob = await blobRes.blob();
              const blobUrl = URL.createObjectURL(blob);

              // Also trigger device download
              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = `${title.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_')}_EP${String(ep.episode_number).padStart(2, '0')}.mp4`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);

              // Save blob as base64 to IndexedDB for offline playback
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = async () => {
                await addDownload({
                  id: `${contentId}-${ep.id}`,
                  contentId,
                  contentType,
                  title,
                  episodeNumber: ep.episode_number,
                  seasonNumber: ep.season_number,
                  thumbnail: '',
                  fileUrl: reader.result as string,
                  downloadedAt: Date.now(),
                  size: `${(blob.size / (1024 * 1024)).toFixed(1)} MB`,
                });
              };
            } catch (blobErr) {
              // Fallback to direct download if blob fetch fails
              const a = document.createElement('a');
              a.href = downloadUrl;
              a.target = '_blank';
              a.download = `${title.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_')}_EP${String(ep.episode_number).padStart(2, '0')}.mp4`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              await addDownload({
                id: `${contentId}-${ep.id}`,
                contentId,
                contentType,
                title,
                episodeNumber: ep.episode_number,
                seasonNumber: ep.season_number,
                thumbnail: '',
                fileUrl: downloadUrl,
                downloadedAt: Date.now(),
              });
            }
          }
          setDownloadProgress((prev) => ({ ...prev, [ep.id]: 100 }));
          setCompletedDownloads((prev) => new Set([...prev, ep.id]));
        } else {
          // Non-anime: simulate for now
          for (let i = 0; i <= 100; i += 10) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            setDownloadProgress((prev) => ({ ...prev, [ep.id]: i }));
          }
          setCompletedDownloads((prev) => new Set([...prev, ep.id]));
        }
      } catch (err: any) {
        setError(`Failed to download episode ${ep.episode_number}: ${err.message}`);
        setDownloadProgress((prev) => ({ ...prev, [ep.id]: 0 }));
      }
    }

    setIsDownloading(false);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-12 p-6 rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(123,111,240,0.08))',
        border: '1px solid rgba(34,211,238,0.2)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Download size={24} style={{ color: '#22D3EE' }} />
        <h3 className="text-xl font-bold text-white">Download Episodes</h3>
      </div>

      {/* Episode selector */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedEpisodes.size === episodes.length && episodes.length > 0}
              onChange={toggleAll}
              disabled={episodes.length === 0}
              className="w-4 h-4 rounded"
              style={{
                accentColor: '#22D3EE',
                cursor: episodes.length === 0 ? 'not-allowed' : 'pointer',
              }}
            />
            <span className="text-sm font-semibold text-white">
              {selectedEpisodes.size === 0
                ? 'Select episodes'
                : `Selected ${selectedEpisodes.size}/${episodes.length}`}
            </span>
          </label>
        </div>

        {/* Episodes grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-80 overflow-y-auto">
          {episodes.map((ep, idx) => {
            const isSelected = selectedEpisodes.has(idx);
            const isCompleted = completedDownloads.has(ep.id);
            const progress = downloadProgress[ep.id] ?? 0;

            return (
              <motion.button
                key={ep.id}
                onClick={() => !isDownloading && toggleEpisode(idx)}
                disabled={isDownloading}
                whileTap={{ scale: 0.95 }}
                className="relative p-2 rounded-lg text-xs font-semibold text-white transition-all"
                style={{
                  background: isCompleted
                    ? 'rgba(34,211,238,0.2)'
                    : isSelected
                      ? 'rgba(34,211,238,0.3)'
                      : 'rgba(255,255,255,0.05)',
                  border: isCompleted
                    ? '1px solid rgba(34,211,238,0.6)'
                    : isSelected
                      ? '1px solid rgba(34,211,238,0.4)'
                      : '1px solid rgba(255,255,255,0.1)',
                  opacity: isDownloading && !isSelected ? 0.5 : 1,
                  cursor: isDownloading ? 'not-allowed' : 'pointer',
                }}
              >
                {isCompleted ? (
                  <CheckCircle2 size={16} className="mx-auto" style={{ color: '#22D3EE' }} />
                ) : (
                  <>
                    <div>Ep {ep.episode_number}</div>
                    {progress > 0 && progress < 100 && (
                      <div className="absolute inset-0 rounded-lg overflow-hidden">
                        <motion.div
                          className="h-full"
                          style={{ background: 'rgba(34,211,238,0.4)' }}
                          animate={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                  </>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-lg flex items-start gap-3"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
        </motion.div>
      )}

      {/* Download button */}
      <motion.button
        onClick={handleDownload}
        disabled={selectedEpisodes.size === 0 || isDownloading}
        whileTap={{ scale: 0.98 }}
        className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        style={{
          background:
            selectedEpisodes.size === 0 || isDownloading
              ? 'rgba(34,211,238,0.2)'
              : 'linear-gradient(135deg, #22D3EE, #00D4FF)',
        }}
      >
        {isDownloading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Downloading...
          </>
        ) : (
          <>
            <Download size={18} />
            Download {selectedEpisodes.size > 0 ? `(${selectedEpisodes.size})` : ''}
          </>
        )}
      </motion.button>

      <p className="text-xs mt-3 text-center" style={{ color: '#8899AA' }}>
        Files will be saved to your Downloads folder
      </p>
    </motion.section>
  );
}
