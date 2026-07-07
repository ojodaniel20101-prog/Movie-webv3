/**
 * Details Service
 * Handles movie/show/anime detail fetching with credits, videos, recommendations
 * Mirrors cinverse's approach: uses TMDB + AniList directly
 */

import axios from 'axios';
import type {
  TMDBMovie, TMDBShow, Season, Episode,
  Video, CastMember, CrewMember, AniListMedia,
} from '@/types';
import { getAnimeById, getAnimeByIdWithRelations } from './anilist';

const TMDB_API_KEY = '5072a0ec4e400e825a615cd9af0dab0af';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

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

// ─── Movie Details ───────────────────────────────────────
export const getMovieDetails = (id: number) =>
  cachedRequest<TMDBMovie>(`/movie/${id}`, {
    append_to_response: 'credits,videos,recommendations,similar,images,external_ids',
  });

export const getMovieVideos = (id: number) =>
  cachedRequest<{ id: number; results: Video[] }>(`/movie/${id}/videos`);

// ─── TV Show Details ─────────────────────────────────────
export const getShowDetails = (id: number) =>
  cachedRequest<TMDBShow>(`/tv/${id}`, {
    append_to_response: 'credits,videos,recommendations,similar,images,external_ids',
  });

export const getShowVideos = (id: number) =>
  cachedRequest<{ id: number; results: Video[] }>(`/tv/${id}/videos`);

export const getSeasonDetails = (showId: number, seasonNumber: number) =>
  cachedRequest<Season>(`/tv/${showId}/season/${seasonNumber}`);

// ─── Anime Details ───────────────────────────────────────
export { getAnimeById, getAnimeByIdWithRelations };

// ─── Resolve anime TMDB ID from title ────────────────────
export const findAnimeTMDBId = async (title: string): Promise<number | null> => {
  if (!title) return null;
  try {
    const res = await cachedRequest<TMDBResponse<{ id: number; name: string; original_language: string; popularity: number; poster_path: string | null; backdrop_path: string | null }>>('/search/tv', { query: title, page: 1 });
    if (!res.results?.length) return null;

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

// ─── Trailer helpers ─────────────────────────────────────
export const getTrailerKey = (videos?: { results: Video[] }): string | null => {
  if (!videos?.results?.length) return null;
  return (
    videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official)?.key ||
    videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key ||
    videos.results.find(v => v.site === 'YouTube')?.key ||
    null
  );
};

// ─── Cast & Crew helpers ─────────────────────────────────
export const getDirector = (crew?: CrewMember[]): string =>
  crew?.find(c => c.job === 'Director')?.name ?? '';

export const getWriters = (crew?: CrewMember[]): string[] =>
  crew?.filter(c => c.job === 'Writer' || c.job === 'Screenplay').map(c => c.name) ?? [];

export const getTopCast = (cast?: CastMember[], limit = 10): CastMember[] =>
  (cast || []).slice(0, limit);

// ─── Year helpers ────────────────────────────────────────
export const getYear = (dateStr?: string): string =>
  dateStr?.split('-')[0] ?? '';

export const formatRuntime = (minutes?: number): string => {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// ─── Anime helpers ───────────────────────────────────────
export const isAnimeShow = (show: TMDBShow): boolean =>
  (show.genre_ids || show.genres?.map(g => g.id) || []).includes(16) &&
  show.original_language === 'ja';

// ─── Genre name helper ───────────────────────────────────
export const getGenreNames = (genres?: { id: number; name: string }[]): string[] =>
  genres?.map(g => g.name) ?? [];

// ─── Unified detail fetch ────────────────────────────────
export interface UnifiedDetails {
  id: number;
  type: 'movie' | 'tv' | 'anime';
  title: string;
  originalTitle?: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseYear: string;
  rating: number;
  voteCount: number;
  genres: string[];
  genreIds: number[];
  runtime?: number;
  runtimeFormatted: string;
  status?: string;
  tagline?: string;
  trailerKey: string | null;
  cast: CastMember[];
  director: string;
  writers: string[];
  recommendations: Array<{ id: number; title: string; posterPath: string | null; rating: number; type: 'movie' | 'tv' | 'anime' }>;
  similar: Array<{ id: number; title: string; posterPath: string | null; rating: number; type: 'movie' | 'tv' | 'anime' }>;
  externalIds?: { imdb_id?: string; tvdb_id?: number };
  // TV/Anime specific
  seasons?: Season[];
  episodeCount?: number;
  seasonCount?: number;
  // Anime specific
  anilistData?: AniListMedia | null;
  tmdbId?: number;
}

import type { TMDBResponse } from '@/types';

export async function fetchUnifiedDetails(
  type: 'movie' | 'tv' | 'anime',
  id: number
): Promise<UnifiedDetails | null> {
  try {
    if (type === 'movie') {
      const movie = await getMovieDetails(id);
      const trailerKey = getTrailerKey(movie.videos);
      const cast = getTopCast(movie.credits?.cast);
      const director = getDirector(movie.credits?.crew);
      const writers = getWriters(movie.credits?.crew);

      return {
        id: movie.id,
        type: 'movie',
        title: movie.title,
        originalTitle: movie.original_title,
        overview: movie.overview,
        posterPath: movie.poster_path,
        backdropPath: movie.backdrop_path,
        releaseYear: getYear(movie.release_date),
        rating: movie.vote_average,
        voteCount: movie.vote_count,
        genres: getGenreNames(movie.genres),
        genreIds: movie.genre_ids,
        runtime: movie.runtime,
        runtimeFormatted: formatRuntime(movie.runtime),
        status: movie.status,
        tagline: movie.tagline,
        trailerKey,
        cast,
        director,
        writers,
        recommendations: (movie.recommendations?.results || []).slice(0, 12).map(m => ({
          id: m.id, title: m.title, posterPath: m.poster_path, rating: m.vote_average, type: 'movie' as const,
        })),
        similar: (movie.similar?.results || []).slice(0, 12).map(m => ({
          id: m.id, title: m.title, posterPath: m.poster_path, rating: m.vote_average, type: 'movie' as const,
        })),
        externalIds: movie.external_ids,
      };
    }

    if (type === 'tv') {
      const show = await getShowDetails(id);
      const trailerKey = getTrailerKey(show.videos);
      const cast = getTopCast(show.credits?.cast);
      const director = getDirector(show.credits?.crew);
      const writers = getWriters(show.credits?.crew);

      return {
        id: show.id,
        type: 'tv',
        title: show.name,
        originalTitle: show.original_name,
        overview: show.overview,
        posterPath: show.poster_path,
        backdropPath: show.backdrop_path,
        releaseYear: getYear(show.first_air_date),
        rating: show.vote_average,
        voteCount: show.vote_count,
        genres: getGenreNames(show.genres),
        genreIds: show.genre_ids,
        runtime: show.episode_run_time?.[0],
        runtimeFormatted: show.episode_run_time?.[0] ? `${show.episode_run_time[0]}m/ep` : '',
        status: show.status,
        tagline: show.tagline,
        trailerKey,
        cast,
        director,
        writers,
        recommendations: (show.recommendations?.results || []).slice(0, 12).map(s => ({
          id: s.id, title: s.name || '', posterPath: s.poster_path, rating: s.vote_average, type: 'tv' as const,
        })),
        similar: (show.similar?.results || []).slice(0, 12).map(s => ({
          id: s.id, title: s.name || '', posterPath: s.poster_path, rating: s.vote_average, type: 'tv' as const,
        })),
        externalIds: show.external_ids,
        seasons: (show.seasons || []).filter(s => s.season_number > 0),
        episodeCount: show.number_of_episodes,
        seasonCount: show.number_of_seasons,
      };
    }

    if (type === 'anime') {
      const [anime, tmdbId] = await Promise.all([
        getAnimeByIdWithRelations(id),
        findAnimeTMDBId((await getAnimeById(id))?.title.english || (await getAnimeById(id))?.title.romaji || ''),
      ]);

      if (!anime) return null;

      let tmdbShow: TMDBShow | null = null;
      if (tmdbId) {
        try {
          tmdbShow = await getShowDetails(tmdbId);
        } catch {
          // TMDB ID might not match
        }
      }

      const trailerKey = anime.trailer?.site === 'youtube' ? anime.trailer.id : null;

      return {
        id: anime.id,
        type: 'anime',
        title: anime.title.english || anime.title.romaji,
        originalTitle: anime.title.romaji,
        overview: anime.description?.replace(/<[^>]+>/g, '') || '',
        posterPath: anime.coverImage?.large || null,
        backdropPath: anime.bannerImage || null,
        releaseYear: String(anime.seasonYear || ''),
        rating: anime.averageScore ? anime.averageScore / 10 : 0,
        voteCount: anime.popularity || 0,
        genres: anime.genres || [],
        genreIds: [],
        runtime: anime.duration ?? undefined,
        runtimeFormatted: anime.duration ? `${anime.duration}m/ep` : '',
        status: anime.status,
        trailerKey,
        cast: [],
        director: '',
        writers: [],
        recommendations: [],
        similar: [],
        seasons: tmdbShow?.seasons?.filter(s => s.season_number > 0),
        episodeCount: anime.episodes ?? undefined,
        seasonCount: tmdbShow?.number_of_seasons,
        anilistData: anime,
        tmdbId: tmdbId ?? undefined,
      };
    }

    return null;
  } catch (err) {
    console.error(`[Details] Failed to fetch ${type}/${id}:`, err);
    return null;
  }
}

export default {
  getMovieDetails,
  getMovieVideos,
  getShowDetails,
  getShowVideos,
  getSeasonDetails,
  getAnimeById,
  getAnimeByIdWithRelations,
  findAnimeTMDBId,
  getTrailerKey,
  getDirector,
  getWriters,
  getTopCast,
  getYear,
  formatRuntime,
  isAnimeShow,
  getGenreNames,
  fetchUnifiedDetails,
};
