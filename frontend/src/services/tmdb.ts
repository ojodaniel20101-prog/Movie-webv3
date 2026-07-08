import axios from 'axios';
import type {
  TMDBMovie, TMDBShow, TMDBResponse, TMDBSearchResult,
  Season, Episode, Video, CastMember
} from '@/types';

// ─── TMDB API Configuration (matching cinverse's approach) ─────────
// cinverse proxies TMDB through their own API at /api/v1/* endpoints
// We use TMDB directly with the same query patterns

const TMDB_API_KEY = '5072a0ec4e400e825a615cd9f0dab0af';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// ─── Image URL helpers ──────────────────────────────────────────────
// Handles BOTH TMDB relative paths ("/abc.jpg") AND
// already-full AniList URLs ("https://s4.anilist.co/...")

export const getPosterUrl = (
  path: string | null,
  size: 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'
): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
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

// ─── Axios instance (cinverse-style headers) ────────────────────────

const tmdb = axios.create({
  baseURL: TMDB_BASE_URL,
  params: { api_key: TMDB_API_KEY, language: 'en-US' },
  timeout: 10000,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
});

// ─── Caching (5 min TTL — same as cinverse's cache behavior) ────────

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

// ─── Trending (matches cinverse /api/v1/trending) ───────────────────
// cinverse trending: returns popular items sorted by trending score
// We use TMDB's trending/all/week with popularity filter

export const getTrending = (timeWindow: 'day' | 'week' = 'week', page = 1) =>
  cachedRequest<TMDBResponse<TMDBSearchResult>>(`/trending/all/${timeWindow}`, {
    page,
    time_window: timeWindow,
  });

export const getTrendingMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/trending/movie/week', { page });

export const getTrendingShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/trending/tv/week', { page });

// ─── Movies (matches cinverse movie browsing) ───────────────────────
// cinverse uses: popular, now_playing, upcoming, top_rated

export const getPopularMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/movie/popular', {
    page,
    sort_by: 'popularity.desc',
    'vote_count.gte': 100,
  });

export const getTopRatedMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/movie/top_rated', {
    page,
    sort_by: 'vote_average.desc',
    'vote_count.gte': 200,
  });

export const getNowPlayingMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/movie/now_playing', {
    page,
    region: 'US',
  });

export const getUpcomingMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/movie/upcoming', {
    page,
    region: 'US',
    sort_by: 'release_date.asc',
  });

// ─── Movie Details (matches cinverse /api/v1/info) ──────────────────
// cinverse info: returns full details, cast, ratings, runtime, seasons/episodes
// We fetch with append_to_response for all related data in one call

export const getMovieDetails = (id: number) =>
  cachedRequest<TMDBMovie>(`/movie/${id}`, {
    append_to_response: 'credits,videos,recommendations,similar,images,external_ids,release_dates',
  });

export const getMovieVideos = (id: number) =>
  cachedRequest<{ id: number; results: Video[] }>(`/movie/${id}/videos`);

// ─── TV Shows (matches cinverse TV series browsing) ─────────────────

export const getPopularShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/tv/popular', {
    page,
    sort_by: 'popularity.desc',
    'vote_count.gte': 50,
  });

export const getTopRatedShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/tv/top_rated', {
    page,
    sort_by: 'vote_average.desc',
    'vote_count.gte': 100,
  });

export const getAiringShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/tv/on_the_air', {
    page,
    timezone: 'America/New_York',
  });

// ─── TV Show Details (matches cinverse /api/v1/info for TV) ─────────

export const getShowDetails = (id: number) =>
  cachedRequest<TMDBShow>(`/tv/${id}`, {
    append_to_response: 'credits,videos,recommendations,similar,images,external_ids,content_ratings',
  });

export const getSeasonDetails = (showId: number, seasonNumber: number) =>
  cachedRequest<Season>(`/tv/${showId}/season/${seasonNumber}`);

export const getShowVideos = (id: number) =>
  cachedRequest<{ id: number; results: Video[] }>(`/tv/${id}/videos`);

// ─── Search (matches cinverse /api/v1/search) ──────────────────────
// cinverse search: q=keyword, page=page, returns movies & TV
// We use search/multi for combined results + filter out people

export const searchMulti = (query: string, page = 1) =>
  cachedRequest<TMDBResponse<TMDBSearchResult>>('/search/multi', {
    query,
    page,
    include_adult: false,
  });

export const searchMovies = (query: string, page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/search/movie', {
    query,
    page,
    include_adult: false,
    sort_by: 'popularity.desc',
  });

export const searchShows = (query: string, page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/search/tv', {
    query,
    page,
    include_adult: false,
    sort_by: 'popularity.desc',
  });

// ─── Discover (for anime and genre filtering) ───────────────────────

export const getAnimeShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/discover/tv', {
    page,
    with_keywords: '210024',
    sort_by: 'popularity.desc',
    'vote_count.gte': 10,
  });

export const getMoviesByGenre = (genreId: number, page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/discover/movie', {
    page,
    with_genres: String(genreId),
    sort_by: 'popularity.desc',
    'vote_count.gte': 50,
  });

export const getShowsByGenre = (genreId: number, page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/discover/tv', {
    page,
    with_genres: String(genreId),
    sort_by: 'popularity.desc',
    'vote_count.gte': 25,
  });

export const getGenres = (type: 'movie' | 'tv' = 'movie') =>
  cachedRequest<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`);

// ─── Anime: find TMDB ID from a title ───────────────────────────────
// Used to resolve AniList anime → TMDB ID for vidsrc playback
// Matches cinverse's approach of finding the best matching title

export const findAnimeTMDBId = async (title: string): Promise<number | null> => {
  if (!title) return null;
  try {
    // Try exact match first
    const res = await searchShows(title);
    if (!res.results?.length) return null;

    // Rank results: prefer Japanese shows with matching titles
    const ranked = res.results
      .filter(s => s.poster_path || s.backdrop_path)
      .map(s => {
        let score = s.popularity || 0;
        const titleLower = title.toLowerCase();
        const nameLower = (s.name || '').toLowerCase();
        const originalNameLower = (s.original_name || '').toLowerCase();

        // Boost Japanese content
        if (s.original_language === 'ja') score *= 3;

        // Boost exact title matches
        if (nameLower === titleLower) score *= 5;
        if (originalNameLower === titleLower) score *= 5;
        if (nameLower.includes(titleLower)) score *= 2;
        if (originalNameLower.includes(titleLower)) score *= 2;

        // Boost content with more votes (more popular/reliable)
        if (s.vote_count > 100) score *= 1.5;

        return { ...s, _score: score };
      })
      .sort((a, b) => b._score - a._score);

    return ranked[0]?.id ?? null;
  } catch {
    return null;
  }
};

// ─── Helpers ────────────────────────────────────────────────────────

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

// ─── Content rating helpers ─────────────────────────────────────────

export const getContentRating = (
  releaseDates?: { results?: Array<{ iso_3166_1: string; release_dates: Array<{ certification: string } }> }
): string => {
  if (!releaseDates?.results) return '';
  const us = releaseDates.results.find(r => r.iso_3166_1 === 'US');
  return us?.release_dates?.[0]?.certification ?? '';
};

export const getUSRating = (show?: { content_ratings?: { results?: Array<{ iso_3166_1: string; rating: string }> } }): string => {
  if (!show?.content_ratings?.results) return '';
  const us = show.content_ratings.results.find(r => r.iso_3166_1 === 'US');
  return us?.rating ?? '';
};

export default tmdb;
