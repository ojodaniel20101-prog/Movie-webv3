import { useRef, useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';
import { pauseIframe } from '@/hooks/useTrailerFeed';

interface Props {
  youtubeKey:     string;
  trailerId:      string;
  posterPath:     string | null;
  registerIframe: (el: HTMLIFrameElement | null, id: string) => void;
  priority?:      boolean;
  onReady?:       () => void;
  onEnded?:       () => void;
}

const MUTE_KEY = 'zentrix_trailer_muted';

// ─── Parse any postMessage payload safely ────────────────────────────────────
function parseYTMessage(raw: MessageEvent['data']): Record<string, unknown> | null {
  try {
    if (typeof raw === 'string') {
      // Fast bail — must contain "event" key somewhere
      if (!raw.includes('"event"') && !raw.includes("'event'")) return null;
      return JSON.parse(raw) as Record<string, unknown>;
    }
    // Some mobile browsers send the data already parsed as an object
    if (raw && typeof raw === 'object' && 'event' in raw) {
      return raw as Record<string, unknown>;
    }
  } catch { /* malformed JSON */ }
  return null;
}

export default function YouTubeEmbed({
  youtubeKey,
  trailerId,
  posterPath,
  registerIframe,
  priority = false,
  onReady,
  onEnded,
}: Props) {
  const iframeRef  = useRef<HTMLIFrameElement>(null);
  const loadedRef  = useRef(false);

  const [muted,  setMuted]  = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === 'true'; } catch { return false; }
  });
  const [loaded, setLoaded] = useState(false);
  const [show,   setShow]   = useState(priority);

  // Show iframe when card first becomes active
  useEffect(() => {
    if (priority) setShow(true);
  }, [priority]);

  // Pause immediately when card loses priority — synchronous failsafe
  useEffect(() => {
    if (!priority && loadedRef.current && iframeRef.current) {
      pauseIframe(iframeRef.current);
    }
  }, [priority]);

  // Register / unregister with IntersectionObserver
  useEffect(() => {
    if (show && iframeRef.current) registerIframe(iframeRef.current, trailerId);
    return () => { if (show) registerIframe(null, trailerId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, trailerId]);

  // ── Store latest callbacks in refs — lets us use empty-dep listener ────────
  const onEndedRef  = useRef<(() => void) | undefined>(undefined);
  const priorityRef = useRef(priority);
  useEffect(() => { onEndedRef.current  = onEnded;  }, [onEnded]);
  useEffect(() => { priorityRef.current = priority; }, [priority]);

  // ── Single persistent postMessage listener (never re-registers) ───────────
  //
  // FIX: YouTube needs a "listening" handshake message sent back after load.
  //      Without it, the player initialises but never emits playerState events.
  //      We send that handshake in the onLoad handler below.
  //
  // FIX: Handle BOTH string and object data payloads (Android Chrome sends
  //      pre-parsed objects on some versions).
  //
  // FIX: Listen for BOTH YouTube event formats:
  //      {"event":"onStateChange","info":0}              ← older embed API
  //      {"event":"infoDelivery","info":{"playerState":0}} ← newer embed API
  //
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = parseYTMessage(event.data);
      if (!data) return;

      const isEnded =
        (data.event === 'onStateChange'  && data.info === 0) ||
        (data.event === 'infoDelivery'   &&
          (data.info as Record<string, unknown>)?.playerState === 0);

      if (isEnded && priorityRef.current && onEndedRef.current) {
        onEndedRef.current();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []); // ← empty deps: one stable listener per component lifetime

  // ── Mute toggle ──────────────────────────────────────────────────────────
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, String(next)); } catch { /**/ }
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: next ? 'mute' : 'unMute', args: [] }),
      '*'
    );
  };

  // No loop/playlist → YouTube fires the ended event naturally
  const src = [
    `https://www.youtube.com/embed/${youtubeKey}`,
    `?autoplay=1`,
    `&mute=${muted ? 1 : 0}`,
    `&controls=0`,
    `&rel=0`,
    `&enablejsapi=1`,
    `&origin=${encodeURIComponent(window.location.origin)}`,
    `&modestbranding=1`,
    `&playsinline=1`,
    `&iv_load_policy=3`,
    `&cc_load_policy=0`,
    `&fs=0`,
    `&widget_referrer=${encodeURIComponent(window.location.origin)}`,
  ].join('');

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-black">
      {posterPath && !loaded && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${posterPath})`,
            filter: 'brightness(0.45)',
            /* Ensure poster always fills like object-fit:cover */
            width: '100%',
            height: '100%',
          }}
        />
      )}

      {show && (
        /* ── TikTok-style full-screen cover: iframe is sized to ALWAYS fill
            the viewport, cropping excess. The wrapper overflow:hidden clips
            the parts that extend beyond the container. This eliminates the
            black letterbox bars YouTube adds for 16:9 content on 9:16 phones. ── */
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            ref={iframeRef}
            src={src}
            className={`absolute top-1/2 left-1/2 border-0 transition-opacity duration-500 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={() => {
              setLoaded(true);
              loadedRef.current = true;

              // ── CRITICAL FIX: Send "listening" handshake to YouTube ──────────
              // This tells the YouTube player "I'm here, please send me events".
              // Without this message, playerState events are NEVER emitted back.
              // We send it twice (100ms apart) for reliability on slow connections.
              const postListening = () =>
                iframeRef.current?.contentWindow?.postMessage(
                  JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
                  '*'
                );
              postListening();
              setTimeout(postListening, 500);

              onReady?.();
            }}
            title="Trailer"
            style={{
              /* 16:9 aspect ratio, but ensure it always covers the viewport */
              width: '100vw',
              height: '56.25vw',           /* 16:9 ratio based on vw */
              minHeight: '100vh',
              minWidth: '177.78vh',        /* (16/9) * 100vh — ensures height fill on portrait */
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
      )}

      <motion.button
        onClick={toggleMute}
        className="absolute bottom-32 right-4 z-30 w-9 h-9 rounded-full flex items-center justify-center"
        style={{
          background:     'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)',
          border:         '1px solid rgba(255,255,255,0.12)',
        }}
        whileTap={{ scale: 0.88 }}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted
          ? <VolumeX size={15} className="text-white" />
          : <Volume2 size={15} className="text-white" />}
      </motion.button>
    </div>
  );
}
