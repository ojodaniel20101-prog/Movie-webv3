// ─── Live TV Pre-connect Hook ───────────────────────────────────────
// Background-warms all stream connections so clicking a channel plays
// instantly. Runs once when the app mounts (not just on the Live TV
// page), pings every channel URL with a lightweight HEAD request, and
// re-pings every 60s to keep connections alive.
//
// Strategy:
//  1. Fetch first 200 channels (covers most popular + all Kids)
//  2. Ping them in batches of 10 with short timeouts
//  3. Track "warm" channels in a ref (no re-renders)
//  4. On channel click, if already warm, HLS starts ~instantly

import { useEffect, useRef } from 'react';
import { liveTvApi, liveProxyUrl } from '@/services/iptv';
import type { Channel } from '@/types/livetv';

const BATCH_SIZE = 10;
const PING_INTERVAL_MS = 60_000;   // re-ping every 60s
const INITIAL_DELAY_MS = 2_000;    // start 2s after app load

interface WarmChannel {
  channel: Channel;
  warmedAt: number;
  ok: boolean;
}

const warmChannels = new Map<string, WarmChannel>();
let globalInitDone = false;

/** Check if a channel has been pre-warmed. */
export function isChannelWarm(channelId: string): boolean {
  const entry = warmChannels.get(channelId);
  if (!entry) return false;
  // Warm entry expires after 90s (live segments rotate)
  return entry.ok && (Date.now() - entry.warmedAt) < 90_000;
}

/** Get the list of currently-warm channel IDs. */
export function getWarmChannelIds(): string[] {
  return Array.from(warmChannels.entries())
    .filter(([, v]) => v.ok && (Date.now() - v.warmedAt) < 90_000)
    .map(([k]) => k);
}

/** Background pre-connect service.
 *  Call this once at the App level (inside a useEffect). */
export function useLivePreconnect() {
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Only run once globally even if component re-mounts
    if (globalInitDone) return;
    globalInitDone = true;

    const abort = new AbortController();
    abortRef.current = abort;

    async function warmup() {
      try {
        const { items } = await liveTvApi.channels({ limit: 200, sort: 'name' });
        if (abort.signal.aborted) return;

        // Ping in batches — serialise batches, parallelise inside each batch
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          if (abort.signal.aborted) return;
          const batch = items.slice(i, i + BATCH_SIZE);

          await Promise.allSettled(
            batch.map(async (ch) => {
              try {
                const proxyUrl = liveProxyUrl(ch.url, ch.userAgent, ch.referer);
                // Use a HEAD fetch against the proxy — this warms the TCP
                // + TLS connection to the upstream without downloading the
                // (large) playlist body.
                const res = await fetch(proxyUrl, {
                  method: 'HEAD',
                  signal: AbortSignal.timeout(5000),
                });
                warmChannels.set(ch.id, {
                  channel: ch,
                  warmedAt: Date.now(),
                  ok: res.ok,
                });
              } catch {
                // Individual ping failures are fine — channel just won't
                // be "warm"; the player will still try normally.
              }
            })
          );

          // Small delay between batches to avoid overwhelming the network
          await new Promise(r => setTimeout(r, 200));
        }

        console.log(`[LiveTV] 🔥 Pre-warmed ${warmChannels.size} channels`);
      } catch (e) {
        console.warn('[LiveTV] Pre-connect failed:', e);
      }
    }

    // Start after INITIAL_DELAY_MS so the app finishes its own boot first
    const initTimer = setTimeout(() => {
      warmup();
      // Re-warm every 60s to keep connections fresh
      timerRef.current = setInterval(warmup, PING_INTERVAL_MS);
    }, INITIAL_DELAY_MS);

    return () => {
      abort.abort();
      clearTimeout(initTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
}
