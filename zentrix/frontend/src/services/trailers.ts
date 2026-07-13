import axios from 'axios';
import { getTrailerKey, getPosterUrl, getBackdropUrl, getYear } from './tmdb';
import type { AniListMedia } from '@/types';

const TMDB_API_KEY = '5072a0ec4e400e825a615cd9f0dab0af';
const TMDB_BASE    = 'https://api.themoviedb.org/3';
const ANILIST_URL  = 'https://graphql.anilist.co';

// YouTube embed base URL
export const YOUTUBE_EMBED_BASE = 'https://www.youtube.com/embed';
export const YOUTUBE_WATCH_BASE = 'https://www.youtube.com/watch';

// ─── YouTube URL Helpers ──────────────────────────────────────────────────────

export function getYouTubeEmbedUrl(videoKey: string, autoplay = false): string {
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  if (autoplay) params.set('autoplay', '1');
  return `${YOUTUBE_EMBED_BASE}/${videoKey}?${params.toString()}`;
}

export function getYouTubeWatchUrl(videoKey: string): string {
  return `${YOUTUBE_WATCH_BASE}?v=${videoKey}`;
}

export function getYouTubeThumbnailUrl(videoKey: string, quality: 'default' | 'mqdefault' | 'hqdefault' | 'sddefault' | 'maxresdefault' = 'hqdefault'): string {
  return `https://img.youtube.com/vi/${videoKey}/${quality}.jpg`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrailerItem {
  id:           string;
  contentId:    number;
  contentType:  'movie' | 'tv' | 'anime';
  youtubeKey:   string;
  title:        string;
  overview:     string;
  posterPath:   string | null;
  backdropPath: string | null;
  releaseYear:  string;
  rating:       number;
  genres:       string[];
  runtime?:     number;
  badge?:       'DUB' | 'SUB';
}

// ─── Cache — keyed by category+page, TTL 5 min ───────────────────────────────

const cache = new Map<string, { data: TrailerItem[]; ts: number }>();
const TTL   = 5 * 60 * 1000;

function getCached(key: string): TrailerItem[] | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  return null;
}
function setCached(key: string, data: TrailerItem[]): void {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Fisher-Yates shuffle ─────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── TMDB genre IDs ──────────────────────────────────────────────────────────

const GENRE_IDS: Record<string, number> = {
  horror:      27,
  comedy:      35,
  action:      28,
  animation:   16,
  kids:        10751,
  scifi:       878,
  romance:     10749,
  thriller:    53,
  crime:       80,
  drama:       18,
  adventure:   12,
  fantasy:     14,
  mystery:     9648,
  documentary: 99,
};

// ─── TMDB axios instance ─────────────────────────────────────────────────────

const tmdbApi = axios.create({
  baseURL: TMDB_BASE,
  params:  { api_key: TMDB_API_KEY, language: 'en-US' },
  timeout: 12000,
});

// ─── Batch detail+video fetch ─────────────────────────────────────────────────

async function fetchTMDBWithVideos(
  ids: Array<{ id: number; type: 'movie' | 'tv' }>,
): Promise<TrailerItem[]> {
  const results = await Promise.allSettled(
    ids.map(({ id, type }) =>
      tmdbApi.get(`/${type}/${id}`, { params: { append_to_response: 'videos,genres' } })
    )
  );

  const items: TrailerItem[] = [];
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res.status !== 'fulfilled') continue;
    const d    = res.value.data;
    const type = ids[i].type;
    const key  = getTrailerKey(d.videos);
    if (!key) continue;

    items.push({
      id:           `${type}-${d.id}`,
      contentId:    d.id,
      contentType:  type,
      youtubeKey:   key,
      title:        d.title || d.name || '',
      overview:     d.overview || '',
      posterPath:   getPosterUrl(d.poster_path, 'w342'),
      backdropPath: getBackdropUrl(d.backdrop_path, 'w780'),
      releaseYear:  getYear(d.release_date || d.first_air_date),
      rating:       d.vote_average ?? 0,
      genres:       (d.genres || []).map((g: { name: string }) => g.name),
      runtime:      d.runtime || d.episode_run_time?.[0],
    });
  }
  return items;
}

// ─── ID fetchers ──────────────────────────────────────────────────────────────

async function getTrendingIds(
  type: 'movie' | 'tv', page = 1
): Promise<Array<{ id: number; type: 'movie' | 'tv' }>> {
  // Use random page 1-3 so every reload yields a different set
  const randomPage = Math.floor(Math.random() * 3) + 1;
  const res = await tmdbApi.get(`/trending/${type}/week`, { params: { page: page > 1 ? page : randomPage } });
  return (res.data.results || []).slice(0, 20).map((r: { id: number }) => ({ id: r.id, type }));
}

async function getDiscoverIds(
  type: 'movie' | 'tv', genreId: number, page = 1
): Promise<Array<{ id: number; type: 'movie' | 'tv' }>> {
  const randomPage = Math.floor(Math.random() * 5) + 1;
  const res = await tmdbApi.get(`/discover/${type}`, {
    params: { with_genres: genreId, sort_by: 'popularity.desc', page: page > 1 ? page : randomPage },
  });
  return (res.data.results || []).slice(0, 20).map((r: { id: number }) => ({ id: r.id, type }));
}

async function getUpcomingIds(
  type: 'movie' | 'tv' = 'movie', page = 1
): Promise<Array<{ id: number; type: 'movie' | 'tv' }>> {
  const endpoint = type === 'movie' ? '/movie/upcoming' : '/tv/on_the_air';
  const res = await tmdbApi.get(endpoint, { params: { page } });
  return (res.data.results || []).slice(0, 20).map((r: { id: number }) => ({ id: r.id, type }));
}

// ─── AniList fetcher ──────────────────────────────────────────────────────────

const ANIME_FRAGMENT = `
  fragment AFields on Media {
    id title { romaji english }
    coverImage { extraLarge large }
    bannerImage
    description(asHtml: false)
    averageScore genres episodes duration
    seasonYear status
    trailer { id site thumbnail }
  }
`;

async function fetchAniListAnime(
  sort: 'TRENDING_DESC' | 'POPULARITY_DESC', page = 1, perPage = 30
): Promise<TrailerItem[]> {
  const query = `
    ${ANIME_FRAGMENT}
    query($sort:[MediaSort],$page:Int,$perPage:Int){
      Page(page:$page,perPage:$perPage){
        media(sort:$sort,type:ANIME,isAdult:false){...AFields}
      }
    }
  `;
  // Randomise AniList page too
  const randomPage = Math.floor(Math.random() * 4) + 1;
  const res = await fetch(ANILIST_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, variables: { sort: [sort], page: page > 1 ? page : randomPage, perPage } }),
  });
  if (!res.ok) return [];
  const json = await res.json();
  const media: AniListMedia[] = json.data?.Page?.media || [];

  return media
    .filter((m) => m.trailer?.site === 'youtube' && m.trailer?.id)
    .map((m): TrailerItem => ({
      id:           `anime-${m.id}`,
      contentId:    m.id,
      contentType:  'anime',
      youtubeKey:   m.trailer!.id,
      title:        m.title.english || m.title.romaji || '',
      overview:     m.description?.replace(/<[^>]+>/g, '') || '',
      posterPath:   m.coverImage?.extraLarge || m.coverImage?.large || null,
      backdropPath: m.bannerImage || null,
      releaseYear:  String(m.seasonYear || ''),
      rating:       m.averageScore ? m.averageScore / 10 : 0,
      genres:       m.genres || [],
      runtime:      m.duration,
      badge:        'SUB',
    }));
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function dedupe(items: TrailerItem[]): TrailerItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type TrailerCategory =
  | 'explore' | 'movies' | 'tv' | 'anime'
  | 'horror'  | 'comedy' | 'action' | 'animation'
  | 'kids'    | 'scifi'  | 'romance' | 'thriller'
  | 'upcoming'| 'trending';

// ─── Main fetch (shuffled every call, cached for 5 min per page) ──────────────

export async function fetchTrailers(
  category: TrailerCategory,
  page = 1
): Promise<TrailerItem[]> {
  // Use a time-bucketed cache key so the same page within a 5-min window is stable
  // but each new minute-bucket (floor/5) gives a fresh shuffle
  const bucket   = Math.floor(Date.now() / TTL);
  const cacheKey = `${category}-p${page}-b${bucket}`;
  const hit      = getCached(cacheKey);
  if (hit) return shuffle(hit); // always re-shuffle even from cache

  let items: TrailerItem[] = [];

  try {
    switch (category) {
      case 'explore':
      case 'trending': {
        const [movieIds, tvIds, animeItems] = await Promise.all([
          getTrendingIds('movie', page),
          getTrendingIds('tv', page),
          fetchAniListAnime('TRENDING_DESC', page, 15),
        ]);
        const tmdbItems = await fetchTMDBWithVideos([
          ...shuffle(movieIds).slice(0, 10),
          ...shuffle(tvIds).slice(0, 10),
        ]);
        // Interleave with anime for variety
        const mixed: TrailerItem[] = [];
        const maxLen = Math.max(tmdbItems.length, animeItems.length);
        for (let i = 0; i < maxLen; i++) {
          if (tmdbItems[i])                     mixed.push(tmdbItems[i]);
          if (i % 3 === 2 && animeItems[i])     mixed.push(animeItems[i]);
        }
        items = mixed;
        break;
      }
      case 'movies': {
        const ids = await getTrendingIds('movie', page);
        items     = await fetchTMDBWithVideos(shuffle(ids));
        break;
      }
      case 'tv': {
        const ids = await getTrendingIds('tv', page);
        items     = await fetchTMDBWithVideos(shuffle(ids));
        break;
      }
      case 'anime': {
        const [trending, popular] = await Promise.all([
          fetchAniListAnime('TRENDING_DESC', page, 20),
          fetchAniListAnime('POPULARITY_DESC', page, 20),
        ]);
        items = dedupe(shuffle([...trending, ...popular]));
        break;
      }
      case 'upcoming': {
        const [movieIds, tvIds] = await Promise.all([
          getUpcomingIds('movie', page),
          getUpcomingIds('tv', page),
        ]);
        items = await fetchTMDBWithVideos(shuffle([...movieIds.slice(0, 12), ...tvIds.slice(0, 8)]));
        break;
      }
      default: {
        const genreId = GENRE_IDS[category];
        if (!genreId) break;
        const [movieIds, tvIds] = await Promise.all([
          getDiscoverIds('movie', genreId, page),
          getDiscoverIds('tv',    genreId, page),
        ]);
        items = await fetchTMDBWithVideos(shuffle([
          ...movieIds.slice(0, 12),
          ...tvIds.slice(0, 8),
        ]));
        break;
      }
    }
  } catch (err) {
    console.error('[fetchTrailers]', category, err);
  }

  const result = shuffle(dedupe(items).filter((i) => i.youtubeKey && i.title));
  setCached(cacheKey, result);
  return result;
}

// ─── Single trailer fetch by TMDB ID ──────────────────────────────────────────

export async function fetchTrailerByTMDBId(
  id: number,
  type: 'movie' | 'tv' = 'movie'
): Promise<TrailerItem | null> {
  try {
    const tmdbApi = axios.create({
      baseURL: TMDB_BASE,
      params: { api_key: TMDB_API_KEY, language: 'en-US' },
      timeout: 10000,
    });

    const res = await tmdbApi.get(`/${type}/${id}`, {
      params: { append_to_response: 'videos,genres' },
    });

    const d = res.data;
    const key = getTrailerKey(d.videos);
    if (!key) return null;

    return {
      id: `${type}-${d.id}`,
      contentId: d.id,
      contentType: type,
      youtubeKey: key,
      title: d.title || d.name || '',
      overview: d.overview || '',
      posterPath: getPosterUrl(d.poster_path, 'w342'),
      backdropPath: getBackdropUrl(d.backdrop_path, 'w780'),
      releaseYear: getYear(d.release_date || d.first_air_date),
      rating: d.vote_average ?? 0,
      genres: (d.genres || []).map((g: { name: string }) => g.name),
      runtime: d.runtime || d.episode_run_time?.[0],
    };
  } catch (err) {
    console.error('[fetchTrailerByTMDBId]', id, type, err);
    return null;
  }
}

// ─── Single trailer fetch by AniList ID ───────────────────────────────────────

export async function fetchTrailerByAniListId(id: number): Promise<TrailerItem | null> {
  try {
    const query = `
      query($id:Int){
        Media(id:$id,type:ANIME){
          id
          title { romaji english }
          coverImage { extraLarge large }
          bannerImage
          description(asHtml: false)
          averageScore
          genres
          episodes
          duration
          seasonYear
          status
          trailer { id site thumbnail }
        }
      }
    `;

    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id } }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const m: AniListMedia = json.data?.Media;

    if (!m || m.trailer?.site !== 'youtube' || !m.trailer?.id) return null;

    return {
      id: `anime-${m.id}`,
      contentId: m.id,
      contentType: 'anime',
      youtubeKey: m.trailer.id,
      title: m.title.english || m.title.romaji || '',
      overview: m.description?.replace(/<[^>]+>/g, '') || '',
      posterPath: m.coverImage?.extraLarge || m.coverImage?.large || null,
      backdropPath: m.bannerImage || null,
      releaseYear: String(m.seasonYear || ''),
      rating: m.averageScore ? m.averageScore / 10 : 0,
      genres: m.genres || [],
      runtime: m.duration,
      badge: 'SUB',
    };
  } catch (err) {
    console.error('[fetchTrailerByAniListId]', id, err);
    return null;
  }
}

// ─── Generic trailer fetch by content type ────────────────────────────────────

export async function fetchTrailer(
  type: 'movie' | 'tv' | 'anime',
  id: number
): Promise<TrailerItem | null> {
  if (type === 'anime') return fetchTrailerByAniListId(id);
  return fetchTrailerByTMDBId(id, type);
}
