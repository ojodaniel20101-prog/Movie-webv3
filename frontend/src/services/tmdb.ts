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
    append_to_response: 'credits,videos,recommendations,similar,images,external_ids,release_dates',
  });
export const getMovieVideos  = (id: number) =>
  cachedRequest<{ id: number; results: Video[] }>(`/movie/${id}/videos`);

// ─── TV Shows ────────────────────────────────────────────
export const getPopularShows  = (page = 1) => cachedRequest<TMDBResponse<TMDBShow>>('/tv/popular',   { page });
export const getTopRatedShows = (page = 1) => cachedRequest<TMDBResponse<TMDBShow>>('/tv/top_rated', { page });
export const getAiringShows   = (page = 1) => cachedRequest<TMDBResponse<TMDBShow>>('/tv/on_the_air',{ page });

export const getShowDetails = (id: number) =>
  cachedRequest<TMDBShow>(`/tv/${id}`, {
    append_to_response: 'credits,videos,recommendations,similar,images,external_ids,content_ratings',
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

// ─── Content Rating Helpers ──────────────────────────────

export interface ContentRating {
  country: string;
  rating: string;
}

export function getContentRatingUS(releaseDates?: { results: Array<{ iso_3166_1: string; release_dates: Array<{ certification: string }> }> }): string | null {
  if (!releaseDates?.results) return null;
  const usEntry = releaseDates.results.find(r => r.iso_3166_1 === 'US');
  if (!usEntry?.release_dates?.length) return null;
  // Find first non-empty certification
  const cert = usEntry.release_dates.find(r => r.certification)?.certification;
  return cert || null;
}

export function getContentRatingTV(contentRatings?: { results: Array<{ iso_3166_1: string; rating: string }> }): string | null {
  if (!contentRatings?.results) return null;
  const usEntry = contentRatings.results.find(r => r.iso_3166_1 === 'US');
  return usEntry?.rating || null;
}

// ─── Nollywood ─────────────────────────────────────────

/**
 * Get Nollywood movies — Nigerian-produced films.
 * Uses multiple strategies to find real Nollywood content on TMDB.
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
      const res = await cachedRequest<TMDBResponse<TMDBMovie>>('/search/movie', {
        query: term,
        page,
      });
      if (res.results) allResults.push(...res.results);
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

  // Strategy 3: Discover with African production companies + drama/romance genres
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
 * Get Nollywood TV shows — Nigerian-produced series.
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
      const res = await cachedRequest<TMDBResponse<TMDBShow>>('/search/tv', {
        query: term,
        page,
      });
      if (res.results) allResults.push(...res.results);
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

  // Strategy 3: African TV shows
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

/**
 * Search specifically for Nigerian/Nollywood content by title.
 * Used for boosting Nollywood results in search.
 */
export const searchNollywoodContent = async (query: string, page = 1) => {
  const results = await cachedRequest<TMDBResponse<TMDBSearchResult>>('/search/multi', {
    query,
    page,
    include_adult: false,
  });

  // Boost Nigerian content in ranking
  const boosted = results.results.sort((a, b) => {
    let scoreA = (a.popularity || 0);
    let scoreB = (b.popularity || 0);

    // Boost Nigerian-sounding titles
    const nigerianTerms = ['nollywood', 'nigerian', 'lagos', 'abuja', 'igbo', 'yoruba', 'hausa'];
    const aTitle = (a.title || a.name || '').toLowerCase();
    const bTitle = (b.title || b.name || '').toLowerCase();

    for (const term of nigerianTerms) {
      if (aTitle.includes(term)) scoreA *= 3;
      if (bTitle.includes(term)) scoreB *= 3;
    }

    return scoreB - scoreA;
  });

  return { ...results, results: boosted };
};

// ─── Superhero ─────────────────────────────────────────
export const getSuperheroMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/discover/movie', {
    page,
    with_keywords: '9715|192092|155', // superhero, super power, hero
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

// ─── Teen Fantasy / Young Adult ────────────────────────
export const getTeenFantasyMovies = (page = 1) =>
  cachedRequest<TMDBResponse<TMDBMovie>>('/discover/movie', {
    page,
    with_keywords: '196962|334', // teen fantasy, coming of age
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
