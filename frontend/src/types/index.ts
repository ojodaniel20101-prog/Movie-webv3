// ─── TMDB Types ──────────────────────────────────────────

export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  original_language?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  genres?: Genre[];
  runtime?: number;
  status?: string;
  tagline?: string;
  budget?: number;
  revenue?: number;
  production_companies?: ProductionCompany[];
  belongs_to_collection?: Collection | null;
  videos?: { results: Video[] };
  credits?: { cast: CastMember[]; crew: CrewMember[] };
  recommendations?: { results: TMDBMovie[] };
  similar?: { results: TMDBMovie[] };
  images?: { backdrops: Image[]; posters: Image[]; logos: Image[] };
  external_ids?: { imdb_id?: string; tvdb_id?: number };
}

export interface TMDBShow {
  id: number;
  name: string;
  original_name: string;
  original_language?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date?: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  genres?: Genre[];
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: Season[];
  status?: string;
  tagline?: string;
  networks?: Network[];
  videos?: { results: Video[] };
  credits?: { cast: CastMember[]; crew: CrewMember[] };
  recommendations?: { results: TMDBShow[] };
  similar?: { results: TMDBShow[] };
  images?: { backdrops: Image[]; posters: Image[]; logos: Image[] };
  external_ids?: { tvdb_id?: number; imdb_id?: string };
}

export interface Season {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
  episode_count: number;
  air_date: string;
  episodes?: Episode[];
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string;
  episode_number: number;
  season_number: number;
  vote_average: number;
  runtime?: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface Image {
  file_path: string;
  width: number;
  height: number;
  vote_average: number;
}

export interface Collection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface ProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface Network {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface TMDBSearchResult {
  id: number;
  media_type: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids?: number[];
  popularity: number;
}

export interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// ─── AniList Types ───────────────────────────────────────

export interface AniListMedia {
  id: number;
  idMal?: number;
  title: {
    romaji: string;
    english: string | null;
    native: string;
  };
  coverImage: {
    extraLarge: string;
    large: string;
    medium: string;
    color: string | null;
  };
  bannerImage: string | null;
  description: string | null;
  averageScore: number | null;
  meanScore: number | null;
  popularity: number;
  trending: number;
  episodes: number | null;
  duration: number | null;
  status: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
  season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL' | null;
  seasonYear: number | null;
  format: 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC';
  genres: string[];
  studios: {
    nodes: Array<{ id: number; name: string; isAnimationStudio: boolean }>;
  };
  trailer: {
    id: string;
    site: string;
    thumbnail: string;
  } | null;
  externalLinks?: Array<{ id: number; url: string; site: string }>;
  relations?: {
    edges: Array<{
      relationType: string;
      node: {
        id: number;
        title: { romaji: string; english: string | null };
        coverImage: { large: string };
        format: string;
      };
    }>;
  };
  nextAiringEpisode?: {
    airingAt: number;
    episode: number;
    timeUntilAiring: number;
  } | null;
  streamingEpisodes?: {
    title?: string;
    thumbnail?: string;
    url?: string;
    site?: string;
  }[];
}

// ─── Unified Content Type ─────────────────────────────────

export type ContentType = 'movie' | 'tv' | 'anime';

export interface UnifiedContent {
  id: string; // tmdb_id or anilist_id
  tmdbId?: number;
  anilistId?: number;
  type: ContentType;
  title: string;
  originalTitle?: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseYear: string;
  rating: number;
  genres: string[];
  runtime?: number;
  episodeCount?: number;
  seasonCount?: number;
  status?: string;
  isAnime?: boolean;
  anilistData?: AniListMedia;
}

// ─── User / Auth Types ────────────────────────────────────

export interface User {
  id: string;
  email: string | null;
  username: string;
  avatar: string | null;
  isGuest?: boolean;
  role?: 'user' | 'admin';
  isBanned?: boolean;
}

export interface WatchlistItem {
  id: string;
  content_id: string;
  content_type: ContentType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_year: string;
  added_at: string;
}

export interface HistoryItem {
  id: string;
  content_id: string;
  content_type: ContentType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  season_number: number | null;
  episode_number: number | null;
  episode_title: string | null;
  progress_seconds: number;
  duration_seconds: number;
  watched_at: string;
}

// ─── Streaming Types ──────────────────────────────────────

export type StreamingServer = 'vidsrc' | 'megaplay';
export type AudioType = 'sub' | 'dub';

export interface StreamingSource {
  server: StreamingServer;
  label: string;
  url: string;
  audioType?: AudioType;
}
