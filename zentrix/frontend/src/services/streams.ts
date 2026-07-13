/**
 * Streams Service
 * Manages all streaming sources, embed URLs, subtitles, and Septorch direct streams
 * Mirrors cinverse's multi-server approach with embed + direct MP4 options
 */

import axios from 'axios';

// ─── Types ───────────────────────────────────────────────

export type ServerKey =
  | 'vidsrc'
  | 'vidlink'
  | 'vidsrc2'
  | 'septorch'
  | 'megaplay'
  | 'megaplay-dub'
  | 'animeheaven';

export type ContentType = 'movie' | 'tv' | 'anime';

export interface ServerDef {
  id: ServerKey;
  label: string;
  description: string;
  adNote?: boolean;
  directPlay?: boolean;
  animeOnly?: boolean;
  requiresBackend?: boolean;
}

export interface SubtitleTrack {
  label: string;
  srclang: string;
  src: string;
}

export interface StreamQuality {
  quality: string;
  resolution: number;
  streamUrl: string;
  downloadUrl: string;
  sizeMb: string;
}

export interface SeptorchResponse {
  success: boolean;
  movie_id: string;
  detail_path: string;
  streams: Array<{
    quality: string;
    resolution: number;
    stream_url: string;
    download_url: string;
    source_url: string;
    size_mb: string;
    size_bytes: number;
    id: string;
  }>;
  subtitles: Array<{
    language: string;
    language_name: string;
    url: string;
  }>;
  source: string;
}

export interface MegaplayResponse {
  url: string;
  method: 'ani' | 's-2' | 'ani-unverified';
  episodeId?: string;
  warning?: string;
  status?: number;
}

// ─── Server Definitions ──────────────────────────────────

export const ALL_SERVERS: ServerDef[] = [
  {
    id: 'vidsrc',
    label: 'Server 1',
    description: 'Primary · Reliable',
  },
  {
    id: 'vidlink',
    label: 'Server 2',
    description: 'Fast · Recommended',
    adNote: true,
  },
  {
    id: 'vidsrc2',
    label: 'Server 3',
    description: 'Mirror · HD',
  },
  {
    id: 'septorch',
    label: 'Server 4',
    description: 'Direct MP4 · Download',
    directPlay: true,
    requiresBackend: true,
  },
  {
    id: 'megaplay',
    label: 'Server 5',
    description: 'Sub · Verified',
    animeOnly: true,
    requiresBackend: true,
  },
  {
    id: 'megaplay-dub',
    label: 'Server 6',
    description: 'Dub · Verified',
    animeOnly: true,
    requiresBackend: true,
  },
  {
    id: 'animeheaven',
    label: 'Server 7',
    description: 'Direct MP4',
    animeOnly: true,
    requiresBackend: true,
  },
];

export const getServersForContent = (type: ContentType, isAnime = false): ServerDef[] => {
  if (isAnime) return ALL_SERVERS;
  return ALL_SERVERS.filter(s => !s.animeOnly);
};

// ─── Embed URL Builders ──────────────────────────────────

export function buildEmbedUrl(
  server: ServerKey,
  tmdbId: number,
  type: ContentType,
  season = 1,
  episode = 1,
  anilistId?: number
): string {
  const s = season || 1;
  const e = episode || 1;

  switch (server) {
    case 'vidsrc': {
      if (type === 'movie') return `https://vidsrc.wiki/embed/movie/${tmdbId}`;
      if (type === 'anime' && anilistId) return `https://vidsrc.wiki/embed/tv/${anilistId}/${s}/${e}`;
      return `https://vidsrc.wiki/embed/tv/${tmdbId}/${s}/${e}`;
    }

    case 'vidlink': {
      if (type === 'movie') return `https://vidlink.pro/movie/${tmdbId}?autoplay=true&nextbutton=true`;
      return `https://vidlink.pro/tv/${tmdbId}/${s}/${e}?autoplay=true&nextbutton=true`;
    }

    case 'vidsrc2': {
      if (type === 'movie') return `https://vidsrc.wiki/embed/movie/${tmdbId}?server=bx`;
      if (type === 'anime' && anilistId) return `https://vidsrc.wiki/embed/tv/${anilistId}/${s}/${e}?server=bx`;
      return `https://vidsrc.wiki/embed/tv/${tmdbId}/${s}/${e}?server=bx`;
    }

    default:
      return '';
  }
}

// ─── Septorch Direct Stream ──────────────────────────────

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

export async function fetchSeptorchStreams(
  title: string,
  movieId?: string,
  detailPath?: string,
  season?: number,
  episode?: number
): Promise<SeptorchResponse | null> {
  try {
    // If we don't have movieId/detailPath, search first
    if (!movieId || !detailPath) {
      const searchRes = await api.get(`/septorch/search?q=${encodeURIComponent(title)}`);
      const results = searchRes.data?.results || [];
      if (!results.length) return null;

      const best = results[0];
      movieId = best.id;
      detailPath = best.detail_path;
    }

    const isTvShow = season && episode;
    const streamRes = await api.get(
      `/septorch/streams?id=${movieId}&detailPath=${encodeURIComponent(detailPath || '')}${isTvShow ? `&season=${season}&episode=${episode}` : ''}`
    );

    if (!streamRes.data?.success) return null;

    return {
      success: true,
      movie_id: movieId,
      detail_path: detailPath || '',
      streams: (streamRes.data.streams || []).map((s: any) => ({
        quality: s.quality,
        resolution: s.resolution || 0,
        stream_url: s.stream_url,
        download_url: s.download_url,
        source_url: s.source_url,
        size_mb: s.size_mb,
        size_bytes: s.size_bytes || 0,
        id: s.id,
      })),
      subtitles: (streamRes.data.subtitles || []).map((sub: any) => ({
        language: sub.language,
        language_name: sub.language_name,
        url: sub.url,
      })),
      source: streamRes.data.source || 'septorch',
    };
  } catch (err) {
    console.error('[Streams] Septorch fetch failed:', err);
    return null;
  }
}

export function septorchToSubtitleTracks(septorchSubs: SeptorchResponse['subtitles']): SubtitleTrack[] {
  return septorchSubs
    .filter(sub => sub.url && sub.language)
    .map(sub => ({
      label: sub.language_name || sub.language,
      srclang: sub.language,
      src: sub.url,
    }));
}

// ─── Megaplay Anime Stream ───────────────────────────────

export async function fetchMegaplayStream(
  anilistId: number,
  episode: number,
  lang: 'sub' | 'dub' = 'sub'
): Promise<MegaplayResponse | null> {
  try {
    const params = new URLSearchParams({
      anilistId: String(anilistId),
      episode: String(episode),
      lang,
    });

    const res = await api.get(`/megaplay/stream?${params.toString()}`);
    if (!res.data?.url) return null;

    return {
      url: res.data.url,
      method: res.data.method || 'ani',
      episodeId: res.data.episodeId,
      warning: res.data.warning,
      status: res.data.status,
    };
  } catch (err) {
    console.error('[Streams] Megaplay fetch failed:', err);
    return null;
  }
}

// ─── AnimeHeaven Stream ──────────────────────────────────

export async function fetchAnimeHeavenStream(
  anilistId: number,
  episode: number
): Promise<{ url: string; method: string } | null> {
  try {
    const res = await api.get(`/animeheaven/stream?anilistId=${anilistId}&episode=${episode}`);
    if (!res.data?.url) return null;

    return {
      url: res.data.url,
      method: res.data.method || 'direct',
    };
  } catch (err) {
    console.error('[Streams] AnimeHeaven fetch failed:', err);
    return null;
  }
}

// ─── VidLink PostMessage Bridge ──────────────────────────

export function setupVidlinkBridge(
  onProgress: (progress: { currentTime: number; duration: number }) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.origin !== 'https://vidlink.pro') return;

    const data = event.data;
    if (data?.event === 'timeupdate' && data.currentTime != null && data.duration != null) {
      onProgress({
        currentTime: data.currentTime,
        duration: data.duration,
      });
      window.dispatchEvent(
        new CustomEvent('vidlink:progress', {
          detail: { currentTime: data.currentTime, duration: data.duration },
        })
      );
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

// ─── Subtitle formatting ─────────────────────────────────

export function formatSubtitles(
  tracks: Array<{ label: string; srclang: string; src: string }>
): SubtitleTrack[] {
  return tracks.filter(t => t.src && t.srclang);
}

// ─── Default server selection ────────────────────────────

export function getDefaultServer(type: ContentType, isAnime = false): ServerKey {
  if (isAnime) return 'megaplay';
  return 'vidsrc';
}

// ─── Content matching for Septorch ───────────────────────

export async function findSeptorchMatch(
  title: string,
  year?: string
): Promise<{ movieId: string; detailPath: string } | null> {
  try {
    const res = await api.get(`/septorch/search?q=${encodeURIComponent(title)}`);
    const results = res.data?.results || [];
    if (!results.length) return null;

    // Prefer exact title match, fallback to first result
    const match = year
      ? results.find((r: any) => r.title?.toLowerCase() === title.toLowerCase() && String(r.year) === year)
      : results.find((r: any) => r.title?.toLowerCase() === title.toLowerCase());

    const best = match || results[0];
    return { movieId: best.id, detailPath: best.detail_path };
  } catch {
    return null;
  }
}

export default {
  ALL_SERVERS,
  getServersForContent,
  buildEmbedUrl,
  fetchSeptorchStreams,
  septorchToSubtitleTracks,
  fetchMegaplayStream,
  fetchAnimeHeavenStream,
  setupVidlinkBridge,
  formatSubtitles,
  getDefaultServer,
  findSeptorchMatch,
};
