// ─── Live TV (IPTV) API client ──────────────────────────────────────
// Hits the same Zentrix backend as everything else (Vite proxies
// /api → http://localhost:3001 in dev; same-origin in production).
// No separate base URL or port — fully integrated, single backend.

import type {
  Channel, ChannelsResponse, LiveCategory, LiveCountry, LiveHealthResponse,
} from '@/types/livetv';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Live TV API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export interface PingResult {
  ok: boolean;
  status: number;
  contentType: string;
  ms: number;
  error?: string;
}

export const liveTvApi = {
  health:     () => get<LiveHealthResponse>('/api/iptv/health'),
  categories: () => get<LiveCategory[]>('/api/iptv/categories'),
  countries:  () => get<LiveCountry[]>('/api/iptv/countries'),

  channels: (params: {
    q?:        string;
    country?:  string;
    category?: string;
    sort?:     string;
    limit?:    number;
    offset?:   number;
  } = {}) => {
    const p = new URLSearchParams();
    if (params.q)        p.set('q',        params.q);
    if (params.country && params.country !== 'all')
                         p.set('country',  params.country.toLowerCase());
    if (params.category && params.category !== 'all')
                         p.set('category', params.category);
    if (params.sort)     p.set('sort',     params.sort);
    if (params.limit)    p.set('limit',    String(params.limit));
    if (params.offset)   p.set('offset',   String(params.offset));
    return get<ChannelsResponse>(`/api/iptv/channels?${p}`);
  },

  /** Fetch N channels from a specific category — used for home rows */
  categoryRow: (category: string, limit = 20) =>
    liveTvApi.channels({ category, limit, sort: 'name' }),

  /** Quick HEAD-based ping to warm a stream connection (pre-connect).
   *  Returns in ~50-200ms; much faster than fetching the full playlist. */
  ping: async (url: string, ua?: string, ref?: string): Promise<PingResult> => {
    const p = new URLSearchParams({ url });
    if (ua)  p.set('ua', ua);
    if (ref) p.set('ref', ref);
    const res = await fetch(`/api/iptv/ping?${p}`, { signal: AbortSignal.timeout(8000) });
    return res.json();
  },

  /** Ping multiple channels in one request (batch pre-connect). */
  batchPing: async (channels: { url: string; ua?: string; ref?: string }[]) => {
    const p = new URLSearchParams({ channels: JSON.stringify(channels.slice(0, 50)) });
    const res = await fetch(`/api/iptv/channels-batch-ping?${p}`, { signal: AbortSignal.timeout(15000) });
    return res.json() as Promise<{ results: ({ url: string; ok: boolean; status: number; error?: string })[] }>;
  },
};

/** Build the proxied stream URL for a channel (routes through our
 *  backend's HLS proxy so the browser never sees CORS/referer issues). */
export function liveProxyUrl(url: string, ua?: string, ref?: string): string {
  const p = new URLSearchParams({ url });
  if (ua)  p.set('ua', ua);
  if (ref) p.set('ref', ref);
  return `/api/iptv/proxy?${p}`;
}

export type { Channel, LiveCountry, LiveCategory, ChannelsResponse };
