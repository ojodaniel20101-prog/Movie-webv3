import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  TrendingUp, Flame, Tv, Film, Star,
  Sparkles, Clock, Zap, Globe, Radio,
  Shield, MapPin,
} from 'lucide-react';
import CineverseHero from '@/components/ui/CineverseHero';
import CineverseContentRow from '@/components/ui/CineverseContentRow';
import { ContinueWatchingCard } from '@/components/ui/ContentCard';
import ChannelRow from '@/components/livetv/ChannelRow';
import DevCreditsSection from '@/components/about/DevCreditsSection';
import {
  getTrending, getPopularMovies, getPopularShows,
  getNowPlayingMovies, getUpcomingMovies,
  getNollywoodMovies, getNollywoodShows,
  getSuperheroMovies, getSuperheroShows,
  getYear,
} from '@/services/tmdb';
import { getTrendingAnime, getPopularAnime } from '@/services/anilist';
import { liveTvApi } from '@/services/iptv';
import { useHistoryStore } from '@/store/useHistoryStore';
import type { ContentType } from '@/types';

interface CineverseItem {
  id: number | string;
  type: ContentType;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  rating?: number;
  releaseYear?: string;
  platform?: string;
  genre?: string;
}

export default function HomePage() {
  const { items: historyItems } = useHistoryStore();

  // ─── Queries ─────────────────────────────────────────────
  const { data: trending, isLoading: trendingLoading } = useQuery({
    queryKey: ['trending'], queryFn: () => getTrending('week'), staleTime: 5 * 60 * 1000,
  });
  const { data: popularMovies, isLoading: moviesLoading } = useQuery({
    queryKey: ['popular-movies'], queryFn: () => getPopularMovies(), staleTime: 5 * 60 * 1000,
  });
  const { data: popularShows, isLoading: showsLoading } = useQuery({
    queryKey: ['popular-shows'], queryFn: () => getPopularShows(), staleTime: 5 * 60 * 1000,
  });
  const { data: nowPlaying } = useQuery({
    queryKey: ['now-playing'], queryFn: () => getNowPlayingMovies(), staleTime: 5 * 60 * 1000,
  });
  const { data: upcoming } = useQuery({
    queryKey: ['upcoming'], queryFn: () => getUpcomingMovies(), staleTime: 10 * 60 * 1000,
  });
  const { data: nollywoodMovies, isLoading: nollywoodLoading } = useQuery({
    queryKey: ['nollywood-movies'], queryFn: () => getNollywoodMovies(1), staleTime: 10 * 60 * 1000,
  });
  const { data: nollywoodShows } = useQuery({
    queryKey: ['nollywood-shows'], queryFn: () => getNollywoodShows(1), staleTime: 10 * 60 * 1000,
  });
  const { data: superheroMovies, isLoading: superheroLoading } = useQuery({
    queryKey: ['superhero-movies'], queryFn: () => getSuperheroMovies(1), staleTime: 10 * 60 * 1000,
  });
  const { data: superheroShows } = useQuery({
    queryKey: ['superhero-shows'], queryFn: () => getSuperheroShows(1), staleTime: 10 * 60 * 1000,
  });
  const { data: trendingAnime, isLoading: animeLoading } = useQuery({
    queryKey: ['trending-anime'], queryFn: () => getTrendingAnime(1, 24), staleTime: 10 * 60 * 1000,
  });
  const { data: popularAnime } = useQuery({
    queryKey: ['popular-anime'], queryFn: () => getPopularAnime(1, 24), staleTime: 10 * 60 * 1000,
  });
  const { data: liveChannels, isLoading: liveLoading } = useQuery({
    queryKey: ['home-live-tv'], queryFn: () => liveTvApi.channels({ limit: 14, sort: 'quality' }), staleTime: 10 * 60 * 1000,
  });

  // ─── Hero items ──────────────────────────────────────────
  const heroItems = (trending?.results || [])
    .filter((item) => item.backdrop_path && (item.media_type === 'movie' || item.media_type === 'tv'))
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      type: (item.media_type === 'tv' ? 'tv' : 'movie') as ContentType,
      title: item.title || item.name || '',
      overview: item.overview || '',
      backdropPath: item.backdrop_path,
      posterPath: item.poster_path,
      rating: item.vote_average,
      releaseYear: getYear(item.release_date || item.first_air_date),
      genres: [],
    }));

  // ─── Transform helpers ───────────────────────────────────
  const toCineverseItems = (results: Array<{
    id: number; title?: string; name?: string;
    poster_path: string | null; backdrop_path?: string | null;
    vote_average: number; release_date?: string; first_air_date?: string;
    genre_ids?: number[];
  }>, type: ContentType): CineverseItem[] =>
    results.map((item) => ({
      id: item.id,
      type,
      title: item.title || item.name || '',
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      rating: item.vote_average,
      releaseYear: getYear(item.release_date || item.first_air_date),
      genre: item.genre_ids?.length ? getGenreName(item.genre_ids[0]) : undefined,
    }));

  const movieItems      = toCineverseItems(popularMovies?.results      || [], 'movie');
  const showItems       = toCineverseItems(popularShows?.results       || [], 'tv');
  const nowPlayingItems = toCineverseItems(nowPlaying?.results         || [], 'movie');
  const upcomingItems   = toCineverseItems(upcoming?.results           || [], 'movie');

  // Nollywood items
  const nollywoodItems: CineverseItem[] = [
    ...toCineverseItems(nollywoodMovies?.results || [], 'movie'),
    ...toCineverseItems(nollywoodShows?.results  || [], 'tv'),
  ].slice(0, 14);

  // Superhero items
  const superheroItems: CineverseItem[] = [
    ...toCineverseItems(superheroMovies?.results || [], 'movie'),
    ...toCineverseItems(superheroShows?.results  || [], 'tv'),
  ].slice(0, 14);

  // Anime items
  const animeItems: CineverseItem[] = (trendingAnime || []).map((a) => ({
    id: a.id,
    type: 'anime' as ContentType,
    title: a.title.english || a.title.romaji,
    posterPath: a.coverImage.large || a.coverImage.medium,
    backdropPath: a.bannerImage,
    rating: a.averageScore ? a.averageScore / 10 : 0,
    releaseYear: String(a.seasonYear || ''),
    genre: a.genres?.[0] || undefined,
  }));

  const popularAnimeItems: CineverseItem[] = (popularAnime || []).map((a) => ({
    id: a.id,
    type: 'anime' as ContentType,
    title: a.title.english || a.title.romaji,
    posterPath: a.coverImage.large || a.coverImage.medium,
    backdropPath: a.bannerImage,
    rating: a.averageScore ? a.averageScore / 10 : 0,
    releaseYear: String(a.seasonYear || ''),
    genre: a.genres?.[0] || undefined,
  }));

  // Continue watching
  const continueWatching = historyItems
    .filter((h) => h.progress_seconds > 30 && h.duration_seconds > 0 && (h.progress_seconds / h.duration_seconds) < 0.9)
    .slice(0, 10);

  const isMainLoading = trendingLoading || moviesLoading || showsLoading;

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* ═══════════════ HERO SECTION ═══════════════ */}
      <CineverseHero items={heroItems} isLoading={trendingLoading} />

      {/* ═══════════════ CONTENT SECTIONS ═══════════════ */}
      <div className="relative z-10 pt-6 space-y-8 pb-safe">

        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <section>
            <div className="flex items-center gap-2 px-4 md:px-6 lg:px-8 mb-3">
              <Clock size={16} className="text-primary-400" />
              <h2 className="text-base font-bold text-white">Continue Watching</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto px-4 md:px-6 lg:px-8 pb-2 scroll-row">
              {continueWatching.map((item) => (
                <ContinueWatchingCard
                  key={item.id}
                  id={item.content_id}
                  type={item.content_type}
                  title={item.title}
                  posterPath={item.backdrop_path || item.poster_path}
                  progress={(item.progress_seconds / item.duration_seconds) * 100}
                  episodeInfo={
                    item.season_number
                      ? `S${item.season_number} E${item.episode_number}`
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Popular Series */}
        <CineverseContentRow
          title="Popular Series"
          items={showItems}
          isLoading={showsLoading}
          viewAllHref="/browse/tv"
          icon={<Tv size={16} />}
          accentColor="#FF2D2D"
        />

        {/* Popular Movies */}
        <CineverseContentRow
          title="Popular Movies"
          items={movieItems}
          isLoading={moviesLoading}
          viewAllHref="/browse/movies"
          icon={<Film size={16} />}
          accentColor="#22D3EE"
        />

        {/* In Theatres Now */}
        {nowPlayingItems.length > 0 && (
          <CineverseContentRow
            title="In Theatres Now"
            subtitle="Currently playing in cinemas"
            items={nowPlayingItems}
            viewAllHref="/browse/movies"
            icon={<Zap size={16} />}
            accentColor="#FCD34D"
          />
        )}

        {/* Upcoming */}
        {upcomingItems.length > 0 && (
          <CineverseContentRow
            title="Coming Soon"
            subtitle="Upcoming releases"
            items={upcomingItems}
            viewAllHref="/browse/movies"
            icon={<Sparkles size={16} />}
            accentColor="#A78BFA"
          />
        )}

        {/* Nollywood */}
        <CineverseContentRow
          title="Nollywood"
          items={nollywoodItems}
          isLoading={nollywoodLoading}
          viewAllHref="/browse/movies"
          icon={<MapPin size={16} />}
          accentColor="#00D97E"
        />

        {/* Superhero */}
        <CineverseContentRow
          title="Superhero Series"
          items={superheroItems}
          isLoading={superheroLoading}
          viewAllHref="/browse/tv"
          icon={<Shield size={16} />}
          accentColor="#7B6FF0"
        />

        {/* Live TV */}
        <ChannelRow
          title="Live TV"
          icon={<Radio size={14} />}
          channels={liveChannels?.items ?? []}
          loading={liveLoading}
          linkTo="/live"
        />

        {/* Trending Anime */}
        <CineverseContentRow
          title="Trending Anime"
          items={animeItems}
          isLoading={animeLoading}
          viewAllHref="/browse/anime"
          icon={<Flame size={16} />}
          accentColor="#EC4899"
        />

        {/* Popular Anime */}
        <CineverseContentRow
          title="Popular Anime"
          items={popularAnimeItems}
          isLoading={animeLoading}
          viewAllHref="/browse/anime"
          icon={<Star size={16} />}
          accentColor="#2DD4BF"
        />

        {/* Trending Now (mixed) */}
        <CineverseContentRow
          title="Trending Now"
          items={[
            ...movieItems.slice(0, 5),
            ...showItems.slice(0, 5),
            ...animeItems.slice(0, 4),
          ].sort(() => Math.random() - 0.5)}
          isLoading={isMainLoading}
          viewAllHref="/browse/trending"
          icon={<TrendingUp size={16} />}
          accentColor="#FF2D2D"
        />

        {/* Dev Credits */}
        <DevCreditsSection />
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────

function getGenreName(genreId: number): string {
  const map: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
    53: 'Thriller', 10752: 'War', 37: 'Western',
    // TV genres
    10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
    10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
    10767: 'Talk', 10768: 'War & Politics',
  };
  return map[genreId] || '';
}
