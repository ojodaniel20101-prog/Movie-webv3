/**
 * Movies Service
 * Handles all movie/TV listing endpoints - trending, popular, genres, Nollywood, etc.
 * Mirrors cinverse's approach: uses TMDB directly for movie data
 */

import axios from 'axios';
import type { TMDBMovie, TMDBShow, TMDBResponse, TMDBSearchResult } from '@/types';

const TMDB_API_KEY = '5072a0ec4e400e825a615cd9f0dab0af';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// ─── Image URL helpers ───────────────────────────────────
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

// ─── Axios instance ──────────────────────────────────────
const tmdb = axios.create({
  baseURL: TMDB_BASE_URL,
  params: { api_key: TMDB_API_KEY, language: 'en-US' },
  timeout: 10000,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
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
export const getTrendingAll = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBSearchResult>>('/trending/all/week', { page });

export const getTrendingMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/trending/movie/week', { page });

export const getTrendingShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/trending/tv/week', { page });

// ─── Popular ─────────────────────────────────────────────
export const getPopularMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/movie/popular', { page });

export const getPopularShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/tv/popular', { page });

// ─── Top Rated ───────────────────────────────────────────
export const getTopRatedMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/movie/top_rated', { page });

export const getTopRatedShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/tv/top_rated', { page });

// ─── Now Playing / Upcoming ──────────────────────────────
export const getNowPlayingMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/movie/now_playing', { page });

export const getUpcomingMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/movie/upcoming', { page });

export const getAiringShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/tv/on_the_air', { page });

// ─── Search ──────────────────────────────────────────────
export const searchMulti = (query: string, page = 1) =>
  cachedRequest<TMDBResponse<TMDBSearchResult>>('/search/multi', { query, page });

export const searchMovies = (query: string, page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/search/movie', { query, page });

export const searchShows = (query: string, page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/search/tv', { query, page });

// ─── Genres ──────────────────────────────────────────────
export const getGenres = (type: 'movie' | 'tv' = 'movie') =>
  cachedRequest<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`);

// ─── Discover by Genre ───────────────────────────────────
export const getMoviesByGenre = (genreId: number, page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/discover/movie', {
    with_genres: genreId,
    sort_by: 'popularity.desc',
    page,
    include_adult: false,
  });

export const getShowsByGenre = (genreId: number, page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/discover/tv', {
    with_genres: genreId,
    sort_by: 'popularity.desc',
    page,
    include_adult: false,
  });

// ─── Nollywood ───────────────────────────────────────────

/**
 * Get REAL Nollywood movies from TMDB.
 * Uses multiple fallback strategies to ensure content is always returned.
 */
export const getNollywoodMovies = async (page = 1): Promise<TMDBResponse<TMDBMovie>> => {
  // Strategy 1: Discover with Nigerian origin country
  try {
    const result = await cachedRequest<TMDBResponse<TMDBMovie>>('/discover/movie', {
      page,
      with_origin_country: 'NG',
      sort_by: 'popularity.desc',
      include_adult: false,
      'vote_count.gte': 1,
    });
    if (result.results?.length >= 4) return result;
  } catch {
    // Fallback to next strategy
  }

  // Strategy 2: Search for Nollywood-specific titles
  try {
    const searchTerms = ['nollywood', 'nigerian film', 'nigerian movie'];
    const allResults: TMDBMovie[] = [];
    for (const term of searchTerms) {
      try {
        const res = await cachedRequest<TMDBResponse<TMDBMovie>>('/search/movie', {
          query: term,
          page,
        });
        if (res.results) allResults.push(...res.results);
      } catch {
        // Continue to next term
      }
    }
    // Deduplicate by ID
    const seen = new Set<number>();
    const unique = allResults.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    if (unique.length >= 4) {
      return { page, results: unique, total_pages: page + 1, total_results: unique.length };
    }
  } catch {
    // Fallback
  }

  // Strategy 3: Discover with African region + drama/romance/comedy genres
  try {
    return await cachedRequest<TMDBResponse<TMDBMovie>>('/discover/movie', {
      page,
      with_genres: '18|10749|35', // Drama, Romance, Comedy
      with_original_language: 'en',
      region: 'NG',
      sort_by: 'popularity.desc',
      include_adult: false,
    });
  } catch {
    // Return empty as last resort
    return { page: 1, results: [], total_pages: 0, total_results: 0 };
  }
};

/**
 * Get REAL Nollywood TV shows from TMDB.
 */
export const getNollywoodShows = async (page = 1): Promise<TMDBResponse<TMDBShow>> => {
  // Strategy 1: Discover with Nigerian origin country
  try {
    const result = await cachedRequest<TMDBResponse<TMDBShow>>('/discover/tv', {
      page,
      with_origin_country: 'NG',
      sort_by: 'popularity.desc',
      include_adult: false,
      'vote_count.gte': 1,
    });
    if (result.results?.length >= 3) return result;
  } catch {
    // Fallback
  }

  // Strategy 2: Search for Nigerian TV content
  try {
    const searchTerms = ['nigerian series', 'nollywood series', 'african drama'];
    const allResults: TMDBShow[] = [];
    for (const term of searchTerms) {
      try {
        const res = await cachedRequest<TMDBResponse<TMDBShow>>('/search/tv', {
          query: term,
          page,
        });
        if (res.results) allResults.push(...res.results);
      } catch {
        // Continue
      }
    }
    const seen = new Set<number>();
    const unique = allResults.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    if (unique.length >= 3) {
      return { page, results: unique, total_pages: page + 1, total_results: unique.length };
    }
  } catch {
    // Fallback
  }

  // Strategy 3: African English-language TV shows
  try {
    return await cachedRequest<TMDBResponse<TMDBShow>>('/discover/tv', {
      page,
      with_origin_country: 'ZA|NG|GH|KE',
      with_original_language: 'en',
      sort_by: 'popularity.desc',
      include_adult: false,
    });
  } catch {
    return { page: 1, results: [], total_pages: 0, total_results: 0 };
  }
};

// ─── Superhero ───────────────────────────────────────────
export const getSuperheroMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/discover/movie', {
    page,
    with_keywords: '9715|192092|155',
    sort_by: 'popularity.desc',
    include_adult: false,
  });

export const getSuperheroShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/discover/tv', {
    page,
    with_keywords: '9715|192092|155',
    sort_by: 'popularity.desc',
    include_adult: false,
  });

// ─── Teen Fantasy ────────────────────────────────────────
export const getTeenFantasyMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/discover/movie', {
    page,
    with_keywords: '196962|334',
    sort_by: 'popularity.desc',
    include_adult: false,
  });

export const getTeenFantasyShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/discover/tv', {
    page,
    with_keywords: '196962|334',
    sort_by: 'popularity.desc',
    include_adult: false,
  });

// ─── Anime ───────────────────────────────────────────────
export const getAnimeShows = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBShow>>('/discover/tv', {
    page,
    with_keywords: '210024',
    sort_by: 'popularity.desc',
  });

// ─── Category-based fetcher ──────────────────────────────
export type ContentCategory =
  | 'trending'
  | 'popular'
  | 'top_rated'
  | 'now_playing'
  | 'upcoming'
  | 'nollywood'
  | 'superhero'
  | 'teen_fantasy'
  | 'action'
  | 'comedy'
  | 'drama'
  | 'horror'
  | 'scifi'
  | 'romance'
  | 'animation'
  | 'thriller'
  | 'crime'
  | 'documentary'
  | 'mystery'
  | 'adventure'
  | 'fantasy'
  | 'family'
  | 'anime';

const GENRE_MAP: Record<string, number> = {
  action: 28,
  comedy: 35,
  drama: 18,
  horror: 27,
  scifi: 878,
  romance: 10749,
  animation: 16,
  thriller: 53,
  crime: 80,
  documentary: 99,
  mystery: 9648,
  adventure: 12,
  fantasy: 14,
  family: 10751,
};

export interface CategoryResult {
  movies: TMDBMovie[];
  shows: TMDBShow[];
  category: string;
}

export async function fetchCategoryContent(
  category: ContentCategory,
  page = 1
): Promise<CategoryResult> {
  switch (category) {
    case 'trending': {
      const [movies, shows] = await Promise.all([
        getTrendingMovies(page),
        getTrendingShows(page),
      ]);
      return { movies: movies.results, shows: shows.results, category };
    }
    case 'popular': {
      const [movies, shows] = await Promise.all([
        getPopularMovies(page),
        getPopularShows(page),
      ]);
      return { movies: movies.results, shows: shows.results, category };
    }
    case 'top_rated': {
      const [movies, shows] = await Promise.all([
        getTopRatedMovies(page),
        getTopRatedShows(page),
      ]);
      return { movies: movies.results, shows: shows.results, category };
    }
    case 'now_playing': {
      const movies = await getNowPlayingMovies(page);
      const shows = await getAiringShows(page);
      return { movies: movies.results, shows: shows.results, category };
    }
    case 'upcoming': {
      const movies = await getUpcomingMovies(page);
      const shows = await getAiringShows(page);
      return { movies: movies.results, shows: shows.results, category };
    }
    case 'nollywood': {
      const [movies, shows] = await Promise.all([
        getNollywoodMovies(page),
        getNollywoodShows(page),
      ]);
      return { movies: movies.results, shows: shows.results, category };
    }
    case 'superhero': {
      const [movies, shows] = await Promise.all([
        getSuperheroMovies(page),
        getSuperheroShows(page),
      ]);
      return { movies: movies.results, shows: shows.results, category };
    }
    case 'teen_fantasy': {
      const [movies, shows] = await Promise.all([
        getTeenFantasyMovies(page),
        getTeenFantasyShows(page),
      ]);
      return { movies: movies.results, shows: shows.results, category };
    }
    case 'anime': {
      const shows = await getAnimeShows(page);
      return { movies: [], shows: shows.results, category };
    }
    default: {
      const genreId = GENRE_MAP[category];
      if (!genreId) {
        return { movies: [], shows: [], category };
      }
      const [movies, shows] = await Promise.all([
        getMoviesByGenre(genreId, page),
        getShowsByGenre(genreId, page),
      ]);
      return { movies: movies.results, shows: shows.results, category };
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────
export const getYear = (dateStr?: string): string =>
  dateStr?.split('-')[0] ?? '';

export const formatRuntime = (minutes?: number): string => {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const formatRating = (rating?: number): string => {
  if (!rating) return '0.0';
  return rating.toFixed(1);
};

export default {
  getTrendingAll,
  getTrendingMovies,
  getTrendingShows,
  getPopularMovies,
  getPopularShows,
  getTopRatedMovies,
  getTopRatedShows,
  getNowPlayingMovies,
  getUpcomingMovies,
  getAiringShows,
  searchMulti,
  searchMovies,
  searchShows,
  getMoviesByGenre,
  getShowsByGenre,
  getNollywoodMovies,
  getNollywoodShows,
  getSuperheroMovies,
  getSuperheroShows,
  getTeenFantasyMovies,
  getTeenFantasyShows,
  getAnimeShows,
  fetchCategoryContent,
  getGenres,
  getPosterUrl,
  getBackdropUrl,
  getProfileUrl,
  getYear,
  formatRuntime,
  formatRating,
};
