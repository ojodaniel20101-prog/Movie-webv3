import { useRef, useCallback, useEffect } from 'react';

// ─── YouTube postMessage helpers ──────────────────────────────────────────────

function ytCommand(iframe: HTMLIFrameElement, func: string) {
  try {
    iframe.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }),
      '*'
    );
  } catch { /* cross-origin — ignore */ }
}

export function playIframe(iframe: HTMLIFrameElement)   { ytCommand(iframe, 'playVideo');  }
export function pauseIframe(iframe: HTMLIFrameElement)  { ytCommand(iframe, 'pauseVideo'); }
export function muteIframe(iframe: HTMLIFrameElement)   { ytCommand(iframe, 'mute');       }
export function unmuteIframe(iframe: HTMLIFrameElement) { ytCommand(iframe, 'unMute');     }

export interface TrailerFeedControls {
  registerIframe: (el: HTMLIFrameElement | null, id: string) => void;
  pauseActive:    () => void;
  playActive:     () => void;
  activeIdRef:    React.MutableRefObject<string | null>;
}

export function useTrailerFeed(): TrailerFeedControls {
  const observerRef  = useRef<IntersectionObserver | null>(null);
  const activeIdRef  = useRef<string | null>(null);
  const iframeMapRef = useRef<Map<string, HTMLIFrameElement>>(new Map());
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helper: pause every iframe except the one with `exceptId` ─────────────
  const pauseAllExcept = useCallback((exceptId: string | null) => {
    iframeMapRef.current.forEach((iframe, id) => {
      if (id !== exceptId) {
        pauseIframe(iframe);
      }
    });
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const iframe = entry.target as HTMLIFrameElement;
          const id     = iframe.dataset.trailerId ?? '';

          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            // ── Card is sufficiently visible — make it the active one ──────
            if (activeIdRef.current !== id) {
              // BUG FIX: pause EVERY other iframe, not just the tracked one.
              // This handles fast scrolls where activeIdRef has already moved on
              // before the old card's exit callback fires.
              pauseAllExcept(id);
              activeIdRef.current = id;
            }

            // Clear any pending play timer from a previous entry
            if (playTimerRef.current) clearTimeout(playTimerRef.current);
            // Small delay so the iframe settles before receiving the play command
            playTimerRef.current = setTimeout(() => playIframe(iframe), 250);

          } else {
            // ── Card scrolled away — ALWAYS pause it regardless of activeId ──
            // BUG FIX: removed `activeIdRef.current === id` guard — that guard
            // was preventing pauses when the user scrolled past quickly.
            pauseIframe(iframe);

            // If this was the tracked active card, clear the reference
            if (activeIdRef.current === id) {
              activeIdRef.current = null;
            }
          }
        });
      },
      {
        // Fire at these ratios so we catch both entry and exit reliably
        threshold: [0, 0.2, 0.55, 0.8, 1.0],
      }
    );

    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [pauseAllExcept]);

  const registerIframe = useCallback(
    (el: HTMLIFrameElement | null, id: string) => {
      if (!el) {
        const old = iframeMapRef.current.get(id);
        if (old) {
          pauseIframe(old); // ensure paused on unmount
          observerRef.current?.unobserve(old);
          iframeMapRef.current.delete(id);
        }
        return;
      }
      el.dataset.trailerId = id;
      iframeMapRef.current.set(id, el);
      observerRef.current?.observe(el);
    },
    []
  );

  const pauseActive = useCallback(() => {
    if (!activeIdRef.current) return;
    const el = iframeMapRef.current.get(activeIdRef.current);
    if (el) pauseIframe(el);
  }, []);

  const playActive = useCallback(() => {
    if (!activeIdRef.current) return;
    const el = iframeMapRef.current.get(activeIdRef.current);
    if (el) playIframe(el);
  }, []);

  return { registerIframe, pauseActive, playActive, activeIdRef };
}
