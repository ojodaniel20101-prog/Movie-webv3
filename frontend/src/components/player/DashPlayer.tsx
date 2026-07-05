import { useEffect, useRef } from 'react';

interface DashPlayerProps {
  src: string;
  title?: string;
}

export default function DashPlayer({ src, title }: DashPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    if (src.includes('.m3u8')) {
      try {
        const Hls = require('hls.js').default;
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(src);
          hls.attachMedia(video);
        }
      } catch (e) {
        console.error('HLS error:', e);
      }
    }

    if (src.includes('.mpd')) {
      video.src = src;
    }
  }, [src]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      playsInline
      className="w-full h-full"
      style={{ background: '#000' }}
      title={title}
    />
  );
}
