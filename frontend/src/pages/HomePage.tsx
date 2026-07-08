import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  TrendingUp, Flame, Tv, Film, Star,
  Sparkles, Clock, Zap, Globe, Radio,
} from 'lucide-react';
import HeroCarousel from '@/components/ui/HeroCarousel';
import ContentRow from '@/components/ui/ContentRow';
import { ContinueWatchingCard } from '@/components/ui/ContentCard';
import ChannelRow from '@/components/livetv/ChannelRow';
import DevCreditsSection from '@/components/about/DevCreditsSection';
import {
  getTrending, getPopularMovies, getPopularShows, getTopRatedMovies,
  getUpcomingMovies, getNowPlayingMovies, getAiringShows, getTopRatedShows,
  getYear,
} from '@/services/tmdb';
import { getTrendingAnime, getPopularAnime, getSeasonalAnime } from '@/services/anilist';
import { liveTvApi } from '@/services/iptv';
import { useHistoryStore } from '@/store/useHistoryStore';
import type { ContentType } from '@/types';

interface ContentItem {
  id: number | string;
  type: ContentType;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string;
  rating?: number;
  releaseYear?: string;
  episodeCount?: number;
  format?: string;
  accentColor?: string | null;
}

export default function HomePage() {
  const { items: historyItems } = useHistoryStore();

  const { data: trending, isLoading: trendingLoading } = useQuery({
    queryKey: ['trending'], queryFn: () => getTrending('week'), staleTime: 5 * 60 * 1000,
  });
  const { data: popularMovies, isLoading: moviesLoading } = useQuery({
    queryKey: ['popular-movies'], queryFn: () => getPopularMovies(), staleTime: 5 * 60 * 1000,
  });
  const { data: popularShows, isLoading: showsLoading } = useQuery({
    queryKey: ['popular-shows'], queryFn: () => getPopularShows(), staleTime: 5 * 60 * 1000,
  });
  const { data: topRatedMovies } = useQuery({
    queryKey: ['top-rated-movies'], queryFn: () => getTopRatedMovies(), staleTime: 10 * 60 * 1000,
  });
  const { data: topRatedShows } = useQuery({
    queryKey: ['top-rated-shows'], queryFn: () => getTopRatedShows(), staleTime: 10 * 60 * 1000,
  });
  const { data: nowPlaying } = useQuery({
    queryKey: ['now-playing'], queryFn: () => getNowPlayingMovies(), staleTime: 5 * 60 * 1000,
  });
  const { data: upcoming } = useQuery({
    queryKey: ['upcoming'], queryFn: () => getUpcomingMovies(), staleTime: 10 * 60 * 1000,
  });
  const { data: airingShows } = useQuery({
    queryKey: ['airing'], queryFn: () => getAiringShows(), staleTime: 5 * 60 * 1000,
  });
  const { data: trendingAnime, isLoading: animeLoading } = useQuery({
    queryKey: ['trending-anime'], queryFn: () => getTrendingAnime(1, 24), staleTime: 10 * 60 * 1000,
  });
  const { data: popularAnime } = useQuery({
    queryKey: ['popular-anime'], queryFn: () => getPopularAnime(1, 24), staleTime: 10 * 60 * 1000,
  });
  const { data: seasonalAnime } = useQuery({
    queryKey: ['seasonal-anime'], queryFn: () => getSeasonalAnime(), staleTime: 10 * 60 * 1000,
  });
  const { data: liveChannels, isLoading: liveLoading } = useQuery({
    queryKey: ['home-live-tv'], queryFn: () => liveTvApi.channels({ limit: 14, sort: 'quality' }), staleTime: 10 * 60 * 1000,
  });

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

  const movieItems: ContentItem[] = (popularMovies?.results || []).map((m) => ({
    id: m.id, type: 'movie', title: m.title, posterPath: m.poster_path, backdropPath: m.backdrop_path,
    overview: m.overview, rating: m.vote_average, releaseYear: getYear(m.release_date),
  }));
  const topMovieItems: ContentItem[] = (topRatedMovies?.results || []).map((m) => ({
    id: m.id, type: 'movie', title: m.title, posterPath: m.poster_path, backdropPath: m.backdrop_path,
    overview: m.overview, rating: m.vote_average, releaseYear: getYear(m.release_date),
  }));
  const nowPlayingItems: ContentItem[] = (nowPlaying?.results || []).map((m) => ({
    id: m.id, type: 'movie', title: m.title, posterPath: m.poster_path, backdropPath: m.backdrop_path,
    overview: m.overview, rating: m.vote_average, releaseYear: getYear(m.release_date),
  }));
  const upcomingItems: ContentItem[] = (upcoming?.results || []).map((m) => ({
    id: m.id, type: 'movie', title: m.title, posterPath: m.poster_path, backdropPath: m.backdrop_path,
    rating: m.vote_average, releaseYear: getYear(m.release_date),
  }));
  const showItems: ContentItem[] = (popularShows?.results || []).map((s) => ({
    id: s.id, type: 'tv', title: s.name, posterPath: s.poster_path, backdropPath: s.backdrop_path,
    overview: s.overview, rating: s.vote_average, releaseYear: getYear(s.first_air_date),
  }));
  const topShowItems: ContentItem[] = (topRatedShows?.results || []).map((s) => ({
    id: s.id, type: 'tv', title: s.name, posterPath: s.poster_path, backdropPath: s.backdrop_path,
    rating: s.vote_average, releaseYear: getYear(s.first_air_date),
  }));
  const airingItems: ContentItem[] = (airingShows?.results || []).map((s) => ({
    id: s.id, type: 'tv', title: s.name, posterPath: s.poster_path, backdropPath: s.backdrop_path,
    rating: s.vote_average, releaseYear: getYear(s.first_air_date),
  }));
  const trendingAnimeItems: ContentItem[] = (trendingAnime || []).map((a) => ({
    id: a.id, type: 'anime', title: a.title.english || a.title.romaji,
    posterPath: a.coverImage.large || a.coverImage.medium, backdropPath: a.bannerImage,
    rating: a.averageScore ? a.averageScore / 10 : 0, releaseYear: String(a.seasonYear || ''),
    episodeCount: a.episodes || undefined, format: a.format?.replace('_', ' '), accentColor: a.coverImage.color,
  }));
  const popularAnimeItems: ContentItem[] = (popularAnime || []).map((a) => ({
    id: a.id, type: 'anime', title: a.title.english || a.title.romaji,
    posterPath: a.coverImage.large || a.coverImage.medium, backdropPath: a.bannerImage,
    rating: a.averageScore ? a.averageScore / 10 : 0, releaseYear: String(a.seasonYear || ''),
    episodeCount: a.episodes || undefined, format: a.format, accentColor: a.coverImage.color,
  }));
  const seasonalAnimeItems: ContentItem[] = (seasonalAnime || []).map((a) => ({
    id: a.id, type: 'anime', title: a.title.english || a.title.romaji,
    posterPath: a.coverImage.large, backdropPath: a.bannerImage,
    rating: a.averageScore ? a.averageScore / 10 : 0, releaseYear: String(a.seasonYear || ''),
    episodeCount: a.episodes || undefined, accentColor: a.coverImage.color,
  }));

  const continueWatching = historyItems
    .filter((h) => h.progress_seconds > 30 && h.duration_seconds > 0 && (h.progress_seconds / h.duration_seconds) < 0.9)
    .slice(0, 10);

  const isMainLoading = trendingLoading || moviesLoading || showsLoading;

  return (
    <div className="min-h-dvh bg-zx-bg aurora-bg">
      {/* Hero */}
      <HeroCarousel items={heroItems} isLoading={trendingLoading} />

      {/* Content sections */}
      <div className="relative z-10 mt-4 space-y-10 md:space-y-14 pb-safe">

        {/* Continue Watching */}
        {continueWatching.length > 0 && (
          <section>
            <div className="flex items-center gap-2 px-4 md:px-6 lg:px-8 mb-3">
              <Clock size={18} className="text-primary-400" />
              <h2 className="section-title">Continue Watching</h2>
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

        <ContentRow
          title="Trending Now"
          items={[...movieItems.slice(0, 4), ...showItems.slice(0, 4), ...trendingAnimeItems.slice(0, 4)].sort(() => Math.random() - 0.5).slice(0, 20)}
          isLoading={isMainLoading}
          viewAllHref="/browse/trending"
          icon={<TrendingUp size={18} />}
        />

        <ContentRow
          title="Popular Movies"
          items={movieItems}
          isLoading={moviesLoading}
          viewAllHref="/browse/movies"
          icon={<Film size={18} />}
        />

        {nowPlayingItems.length > 0 && (
          <ContentRow
            title="In Theatres Now"
            subtitle="Currently playing in cinemas"
            items={nowPlayingItems}
            viewAllHref="/browse/movies"
            icon={<Zap size={18} />}
          />
        )}

        <ContentRow
          title="Popular TV Shows"
          items={showItems}
          isLoading={showsLoading}
          viewAllHref="/browse/tv"
          icon={<Tv size={18} />}
        />

        <ChannelRow
          title="Live TV"
          icon={<Radio size={16} />}
          channels={liveChannels?.items ?? []}
          loading={liveLoading}
          linkTo="/live"
        />

        <ContentRow
          title="Trending Anime"
          items={trendingAnimeItems}
          isLoading={animeLoading}
          viewAllHref="/browse/anime"
          icon={<Flame size={18} />}
        />

        {seasonalAnimeItems.length > 0 && (
          <ContentRow
            title="This Season"
            subtitle="Currently airing"
            items={seasonalAnimeItems}
            viewAllHref="/browse/anime"
            icon={<Globe size={18} />}
          />
        )}

        {topMovieItems.length > 0 && (
          <ContentRow
            title="Top Rated Movies"
            subtitle="All-time classics"
            items={topMovieItems}
            viewAllHref="/browse/movies"
            icon={<Star size={18} />}
            showRanking
          />
        )}

        {topShowItems.length > 0 && (
          <ContentRow
            title="Top Rated TV Shows"
            items={topShowItems}
            viewAllHref="/browse/tv"
            icon={<Star size={18} />}
            showRanking
          />
        )}

        {popularAnimeItems.length > 0 && (
          <ContentRow
            title="Most Popular Anime"
            items={popularAnimeItems}
            viewAllHref="/browse/anime"
            icon={<Sparkles size={18} />}
          />
        )}

        {upcomingItems.length > 0 && (
          <ContentRow
            title="Coming Soon"
            subtitle="Upcoming releases"
            items={upcomingItems}
            viewAllHref="/browse/movies"
            icon={<Clock size={18} />}
          />
        )}

        {airingItems.length > 0 && (
          <ContentRow
            title="Currently Airing"
            subtitle="On air this week"
            items={airingItems}
            viewAllHref="/browse/tv"
            icon={<Zap size={18} />}
          />
        )}

        {/* Dev credits + community links */}
        <div className="divider-gradient mx-4 md:mx-8" />
        <DevCreditsSection />

        {/* Footer */}
        <div className="divider-gradient mx-4 md:mx-8" />

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center py-6 px-4"
        >
          <p className="text-xs text-gray-600">
            Powered by TMDB & AniList · Zentrix Streaming Platform
          </p>
        </motion.div>
      </div>
    </div>
  );
}
