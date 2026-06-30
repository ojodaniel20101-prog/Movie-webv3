import axios from 'axios';
import type {
  TMDBMovie, TMDBShow, TMDBResponse, TMDBSearchResult,
  Season, Episode, Video, CastMember
} from '@/types';

const TMDB_API_KEY = '5072a0ec4e400e825a615cd9f0dab0af';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// ─── Image URL helpers ───────────────────────────────────
// Handles BOTH TMDB relative paths ("/abc.jpg") AND
// already-full AniList URLs ("https://s4.anilist.co/...")

export const getPosterUrl = (
  path: string | null,
  size: 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'
): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;          // AniList / external full URL
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
};

export const getBackdropUrl = (
  path: string | null,
  size: 'w300' | 'w780' | 'w1280' | 'original' = 'w1280'
): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
};

export const getProfileUrl = (path: string | null): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${TMDB_IMAGE_BASE}/w185${path}`;
};

// ─── Axios instance ──────────────────────────────────────

const tmdb = axios.create({
  baseURL: TMDB_BASE_URL,
  params: { api_key: TMDB_API_KEY, language: 'en-US' },
  timeout: 10000,
});

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

async function cachedRequest<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const key = url + JSON.stringify(params || {});
  const hit = cache.get(key);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) return hit.data as T;
  const res = await tmdb.get<T>(url, { params });
  cache.set(key, { data: res.data, timestamp: Date.now() });
  return res.data;
}

// ─── Trending ────────────────────────────────────────────
export const getTrending = (timeWindow: 'day' | 'week' = 'week', page = 1) =>
  cachedRequest<TMDBResponse<TMDBSearchResult>>('/trending/all/week', { page, time_window: timeWindow });
export const getTrendingMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/trending/movie/week', { page });
export const getTrendingShows  = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/trending/tv/week',    { page });

// ─── Movies ──────────────────────────────────────────────
export const getPopularMovies  = (page = 1) => cachedRequest<TMDBResponse<TMDBMovie>>('/movie/popular',    { page });
export const getTopRatedMovies = (page = 1) => cachedRequest<TMDBResponse<TMDBMovie>>('/movie/top_rated',  { page });
export const getNowPlayingMovies=(page = 1) => cachedRequest<TMDBResponse<TMDBMovie>>('/movie/now_playing',{ page });
export const getUpcomingMovies  = (page = 1) => cachedRequest<TMDBResponse<TMDBMovie>>('/movie/upcoming',  { page });

export const getMovieDetails = (id: number) =>
  cachedRequest<TMDBMovie>(`/movie/${id}`, {
    append_to_response: 'credits,videos,recommendations,similar,images,external_ids',
  });
export const getMovieVideos  = (id: number) =>
  cachedRequest<{ id: number; results: Video[] }>(`/movie/${id}/videos`);

// ─── TV Shows ────────────────────────────────────────────
export const getPopularShows  = (page = 1) => cachedRequest<TMDBResponse<TMDBShow>>('/tv/popular',   { page });
export const getTopRatedShows = (page = 1) => cachedRequest<TMDBResponse<TMDBShow>>('/tv/top_rated', { page });
export const getAiringShows   = (page = 1) => cachedRequest<TMDBResponse<TMDBShow>>('/tv/on_the_air',{ page });

export const getShowDetails = (id: number) =>
  cachedRequest<TMDBShow>(`/tv/${id}`, {
    append_to_response: 'credits,videos,recommendations,similar,images,external_ids',
  });
export const getSeasonDetails = (showId: number, seasonNumber: number) =>
  cachedRequest<Season>(`/tv/${showId}/season/${seasonNumber}`);
export const getShowVideos = (id: number) =>
  cachedRequest<{ id: number; results: Video[] }>(`/tv/${id}/videos`);

// ─── Search ──────────────────────────────────────────────
export const searchMulti  = (query: string, page = 1) =>
  cachedRequest<TMDBResponse<TMDBSearchResult>>('/search/multi', { query, page });
export const searchMovies = (query: string, page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/search/movie', { query, page });
export const searchShows  = (query: string, page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/search/tv', { query, page });

// ─── Discover ────────────────────────────────────────────
export const getAnimeShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/discover/tv', {
    page, with_keywords: '210024', sort_by: 'popularity.desc',
  });

export const getGenres = (type: 'movie' | 'tv' = 'movie') =>
  cachedRequest<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`);

// ─── Anime: find TMDB ID from a title ───────────────────
// Used to resolve AniList anime → TMDB ID for vidsrc playback
export const findAnimeTMDBId = async (title: string): Promise<number | null> => {
  if (!title) return null;
  try {
    const res = await searchShows(title);
    if (!res.results?.length) return null;

    // Prefer Japanese-original shows that match the title
    const ranked = res.results
      .filter(s => s.poster_path || s.backdrop_path)
      .sort((a, b) => {
        let scoreA = a.popularity;
        let scoreB = b.popularity;
        if (a.original_language === 'ja') scoreA *= 2;
        if (b.original_language === 'ja') scoreB *= 2;
        const titleLower = title.toLowerCase();
        if ((a.name || '').toLowerCase().includes(titleLower)) scoreA *= 3;
        if ((b.name || '').toLowerCase().includes(titleLower)) scoreB *= 3;
        return scoreB - scoreA;
      });

    return ranked[0]?.id ?? null;
  } catch {
    return null;
  }
};

// ─── Helpers ─────────────────────────────────────────────
export const getTrailerKey = (videos?: { results: Video[] }): string | null => {
  if (!videos?.results?.length) return null;
  return (
    videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official)?.key ||
    videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key ||
    videos.results.find(v => v.site === 'YouTube')?.key ||
    null
  );
};

export const getYear = (dateStr?: string): string =>
  dateStr?.split('-')[0] ?? '';

export const formatRuntime = (minutes?: number): string => {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const getDirector = (
  crew?: { id: number; name: string; job: string; department: string; profile_path: string | null }[]
): string => crew?.find(c => c.job === 'Director')?.name ?? '';

export const isAnimeShow = (show: TMDBShow): boolean =>
  (show.genre_ids || show.genres?.map(g => g.id) || []).includes(16) &&
  show.original_language === 'ja';

export default tmdb;
