import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Star, Clock, Calendar, Bookmark, BookmarkCheck,
  Heart, ChevronDown, ChevronRight, ExternalLink,
  Info, Tv, Film, List, Users, ArrowLeft, Loader2, Layers, AlertTriangle
} from 'lucide-react';
import {
  getMovieDetails, getShowDetails, getSeasonDetails,
  getPosterUrl, getBackdropUrl, getProfileUrl,
  getYear, formatRuntime, getTrailerKey, findAnimeTMDBId,
} from '@/services/tmdb';
import { getAnimeById } from '@/services/anilist';
import { useWatchlistStore } from '@/store/useWatchlistStore';
import { SkeletonDetails } from '@/components/ui/SkeletonCard';
import ContentRow from '@/components/ui/ContentRow';
import DownloadSection from '@/components/DownloadSection';
import type { ContentType, Season, Episode } from '@/types';

type DetailType = 'movie' | 'tv' | 'anime';

/* Synthetic episodes fallback when TMDB has no data */
function makeSyntheticEpisodes(count: number, duration?: number | null): Episode[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Episode ${i + 1}`,
    overview: '',
    still_path: null,
    air_date: '',
    episode_number: i + 1,
    season_number: 1,
    vote_average: 0,
    runtime: duration ?? undefined,
  }));
}

export default function DetailsPage() {
  const { type, id } = useParams<{ type: DetailType; id: string }>();
  const navigate     = useNavigate();

  const [activeTab,        setActiveTab]        = useState<'overview' | 'episodes' | 'similar'>('overview');
  const [selectedSeason,   setSelectedSeason]   = useState(1);
  const [showFullOverview, setShowFullOverview] = useState(false);

  const {
    addToWatchlist, removeFromWatchlist, isInWatchlist,
    addToFavorites, removeFromFavorites, isInFavorites,
  } = useWatchlistStore();

  const contentId   = String(id);
  const contentType = type as ContentType;
  const inWatchlist = isInWatchlist(contentId, contentType);
  const inFavorites = isInFavorites(contentId, contentType);

  // ── Movie ────────────────────────────────────────────────
  const { data: movie, isLoading: movieLoading } = useQuery({
    queryKey: ['movie', id],
    queryFn:  () => getMovieDetails(Number(id)),
    enabled:  type === 'movie',
  });

  // ── TV Show ──────────────────────────────────────────────
  const { data: show, isLoading: showLoading } = useQuery({
    queryKey: ['show', id],
    queryFn:  () => getShowDetails(Number(id)),
    enabled:  type === 'tv',
  });

  // ── TV season ────────────────────────────────────────────
  const { data: seasonData } = useQuery({
    queryKey: ['season', id, selectedSeason],
    queryFn:  () => getSeasonDetails(Number(id), selectedSeason),
    enabled:  type === 'tv' && !!show,
  });

  // ── AniList anime ────────────────────────────────────────
  const { data: anime, isLoading: animeLoading } = useQuery({
    queryKey: ['anime', id],
    queryFn:  () => getAnimeById(Number(id)),
    enabled:  type === 'anime',
  });

  // ── Resolve TMDB ID from title ───────────────────────────
  const { data: animeTmdbId, isLoading: tmdbLookupLoading } = useQuery({
    queryKey: ['anime-tmdb-id', anime?.title.english, anime?.title.romaji],
    queryFn:  () => findAnimeTMDBId(anime?.title.english || anime?.title.romaji || ''),
    enabled:  type === 'anime' && !!anime,
    staleTime: 60 * 60 * 1000,
  });

  // ── Full TMDB show for anime (gives us all seasons) ──────
  // This is the KEY fix: treat the anime as a TMDB TV show so we
  // get the real season list and episode data just like TV shows.
  const { data: animeTmdbShow } = useQuery({
    queryKey: ['anime-tmdb-show', animeTmdbId],
    queryFn:  () => getShowDetails(animeTmdbId!),
    enabled:  type === 'anime' && !!animeTmdbId,
    staleTime: 30 * 60 * 1000,
  });

  // ── TMDB season for anime (uses selectedSeason) ──────────
  const { data: animeTmdbSeason } = useQuery({
    queryKey: ['anime-season', animeTmdbId, selectedSeason],
    queryFn:  () => getSeasonDetails(animeTmdbId!, selectedSeason),
    enabled:  type === 'anime' && !!animeTmdbId,
    staleTime: 15 * 60 * 1000,
  });

  const isLoading = movieLoading || showLoading || animeLoading;

  // ── Derived values ───────────────────────────────────────
  const title = movie?.title || show?.name
              || anime?.title.english || anime?.title.romaji || '';
  const overview = movie?.overview || show?.overview
                 || anime?.description?.replace(/<[^>]*>/g, '') || '';
  const posterPath  = movie?.poster_path  || show?.poster_path
                    || anime?.coverImage.extraLarge || anime?.coverImage.large || null;
  const backdropPath = movie?.backdrop_path || show?.backdrop_path
                     || anime?.bannerImage || null;
  const rating = movie?.vote_average || show?.vote_average
               || (anime?.averageScore ? anime.averageScore / 10 : 0) || 0;
  const releaseYear = getYear(movie?.release_date || show?.first_air_date || '')
                    || String(anime?.seasonYear || '');
  const runtime = movie?.runtime            ? formatRuntime(movie.runtime)
                : show?.episode_run_time?.[0] ? `${show.episode_run_time[0]}m/ep`
                : anime?.duration             ? `${anime.duration}m/ep`
                : '';
  const genres = movie?.genres?.map(g => g.name)
               || show?.genres?.map(g => g.name)
               || anime?.genres || [];
  const trailerKey = getTrailerKey(movie?.videos || show?.videos);
  const cast = movie?.credits?.cast?.slice(0, 16)
             || show?.credits?.cast?.slice(0, 16) || [];

  const posterUrl   = getPosterUrl(posterPath, 'w500');
  const backdropUrl = getBackdropUrl(backdropPath, 'original');

  // ── Season list for the episodes tab ─────────────────────
  // TV  → use TMDB show seasons directly
  // Anime → use animeTmdbShow seasons (fetched via resolved TMDB ID)
  const seasonsList: Season[] =
    type === 'tv'
      ? (show?.seasons?.filter(s => s.season_number > 0) || [])
      : type === 'anime'
        ? (animeTmdbShow?.seasons?.filter(s => s.season_number > 0) || [])
        : [];

  // ── Episodes to display ──────────────────────────────────
  const episodesToShow: Episode[] =
    type === 'tv'
      ? (seasonData?.episodes || [])
      : type === 'anime'
        ? (animeTmdbSeason?.episodes?.length
            ? animeTmdbSeason.episodes
            : makeSyntheticEpisodes(anime?.episodes || 0, anime?.duration))
        : [];

  // ── Season/episode counts for meta display ───────────────
  const displaySeasonCount =
    type === 'tv'    ? show?.number_of_seasons
    : type === 'anime' ? (animeTmdbShow?.number_of_seasons || (anime?.episodes ? 1 : undefined))
    : undefined;

  const displayEpisodeCount =
    type === 'tv'    ? show?.number_of_episodes
    : type === 'anime' ? anime?.episodes
    : undefined;

  // ── Recommendations ──────────────────────────────────────
  const recommendations = [
    ...(movie?.recommendations?.results || []).slice(0, 18).map(m => ({
      id: m.id, type: 'movie' as ContentType, title: m.title || '',
      posterPath: m.poster_path, rating: m.vote_average, releaseYear: getYear(m.release_date),
    })),
    ...(show?.recommendations?.results || []).slice(0, 18).map(s => ({
      id: s.id, type: 'tv' as ContentType, title: s.name || '',
      posterPath: s.poster_path, rating: s.vote_average, releaseYear: getYear(s.first_air_date),
    })),
  ];

  // ── Watch URLs ───────────────────────────────────────────
  // Anime: just anilist ID + episode number. No tmdbId / malId params needed.
  const watchUrl =
    contentType === 'movie'
      ? `/watch/movie/${id}`
      : contentType === 'anime'
        ? `/watch/anime/${id}?episode=1`
        : `/watch/tv/${id}?season=1&episode=1`;

  const epWatchUrl = (ep: Episode) =>
    contentType === 'anime'
      ? `/watch/anime/${id}?episode=${ep.episode_number}`
      : `/watch/tv/${id}?season=${ep.season_number}&episode=${ep.episode_number}`;

  // ── Loading / error ──────────────────────────────────────
  if (isLoading) return <SkeletonDetails />;
  if (!movie && !show && !anime) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-display text-white mb-3">Content not found</p>
          <button onClick={() => navigate(-1)} className="btn-secondary">Go back</button>
        </div>
      </div>
    );
  }

  const handleWatchlist = () => {
    const p = {
      content_id: contentId, content_type: contentType, title,
      poster_path: posterPath, backdrop_path: backdropPath,
      overview, vote_average: rating, release_year: releaseYear,
    };
    inWatchlist ? removeFromWatchlist(contentId, contentType) : addToWatchlist(p);
  };

  const handleFavorite = () => {
    const p = {
      content_id: contentId, content_type: contentType, title,
      poster_path: posterPath, backdrop_path: backdropPath,
      overview, vote_average: rating, release_year: releaseYear,
    };
    inFavorites ? removeFromFavorites(contentId, contentType) : addToFavorites(p);
  };

  return (
    <div className="min-h-screen bg-zx-bg">

      {/* ── BACKDROP ─────────────────────────────────────── */}
      <div className="relative w-full h-[50vh] md:h-[65vh] overflow-hidden">
        {backdropUrl
          ? <img src={backdropUrl} alt={title} className="w-full h-full object-cover object-top" />
          : <div className="w-full h-full bg-zx-s1" />}
        <div className="absolute inset-0 bg-gradient-to-t from-zx-bg via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-zx-bg/60 to-transparent" />

        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-4 md:left-8 z-20 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/50 backdrop-blur-sm border border-white/10 text-sm text-white hover:bg-black/70 transition-all"
        >
          <ArrowLeft size={16} /> Back
        </button>

        {trailerKey && (
          <a
            href={`https://www.youtube.com/watch?v=${trailerKey}`}
            target="_blank" rel="noopener noreferrer"
            className="absolute bottom-6 right-4 md:right-8 z-20 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/50 backdrop-blur-sm border border-white/10 text-sm text-white hover:bg-black/70 transition-all"
          >
            <ExternalLink size={14} /> Trailer
          </a>
        )}
      </div>

      {/* ── MAIN ─────────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-4 md:px-8 -mt-36 md:mt-[-13rem] relative z-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-10">

          {/* Poster */}
          <motion.div
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }} className="flex-shrink-0 self-start"
          >
            <div className="w-36 md:w-52 lg:w-60 rounded-2xl overflow-hidden shadow-cinematic border border-white/10">
              {posterUrl
                ? <img src={posterUrl} alt={title} className="w-full aspect-[2/3] object-cover" />
                : <div className="w-full aspect-[2/3] bg-zx-s3 flex items-center justify-center">
                    <Film size={40} className="text-gray-700" />
                  </div>}
            </div>
            <div className="mt-3 text-center">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                contentType === 'movie' ? 'bg-accent-pink/20 text-accent-pink border border-accent-pink/30'
                : contentType === 'anime' ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                : 'bg-accent-teal/20 text-accent-teal border border-accent-teal/30'
              }`}>{contentType}</span>
            </div>
          </motion.div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="font-display font-black text-3xl md:text-4xl lg:text-5xl text-white leading-tight"
            >
              {title}
            </motion.h1>

            {anime?.title.romaji && anime.title.english && (
              <p className="text-gray-500 text-sm mt-1">{anime.title.romaji}</p>
            )}

            {/* Meta */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-wrap items-center gap-3 mt-4"
            >
              {rating > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rating/10 border border-rating/20">
                  <Star size={14} fill="#FFD700" className="text-rating" />
                  <span className="text-sm font-bold text-rating">{rating.toFixed(1)}</span>
                  <span className="text-xs text-gray-500">/10</span>
                </div>
              )}
              {releaseYear && (
                <span className="flex items-center gap-1.5 text-gray-400 text-sm">
                  <Calendar size={13} />{releaseYear}
                </span>
              )}
              {runtime && (
                <span className="flex items-center gap-1.5 text-gray-400 text-sm">
                  <Clock size={13} />{runtime}
                </span>
              )}
              {displaySeasonCount && (
                <span className="flex items-center gap-1.5 text-gray-400 text-sm">
                  <Layers size={13} />{displaySeasonCount} Season{displaySeasonCount > 1 ? 's' : ''}
                </span>
              )}
              {displayEpisodeCount && (
                <span className="flex items-center gap-1.5 text-gray-400 text-sm">
                  <List size={13} />{displayEpisodeCount} eps
                </span>
              )}
              {anime?.status && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  anime.status === 'RELEASING' ? 'bg-green-500/15 text-green-400'
                  : anime.status === 'FINISHED' ? 'bg-gray-500/15 text-gray-400'
                  : 'bg-yellow-500/15 text-yellow-400'
                }`}>
                  {anime.status === 'RELEASING' ? 'Airing'
                    : anime.status === 'FINISHED' ? 'Completed' : anime.status}
                </span>
              )}

              {/* Stream status badge */}
              {type === 'anime' && tmdbLookupLoading && (
                <span className="flex items-center gap-1 text-xs text-gray-600">
                  <Loader2 size={11} className="animate-spin" /> Finding stream…
                </span>
              )}
              {type === 'anime' && animeTmdbId && !tmdbLookupLoading && (
                <span className="text-xs text-green-500/70 flex items-center gap-1">
                  <Tv size={11} /> TMDB seasons loaded
                </span>
              )}
              {type === 'anime' && !animeTmdbId && !tmdbLookupLoading && anime && (
                <span className="text-xs text-yellow-500/70 flex items-center gap-1">
                  <AlertTriangle size={11} /> Use Server 1 or 2
                </span>
              )}
            </motion.div>

            {/* Genres */}
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {genres.map(g => <span key={g} className="genre-chip">{g}</span>)}
              </div>
            )}

            {/* CTA buttons */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap items-center gap-3 mt-6"
            >
              <Link to={watchUrl}>
                <motion.button
                  className="btn-primary text-base px-7 py-3.5"
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                >
                  <Play size={18} fill="white" />
                  {contentType === 'movie' ? 'Watch Movie' : 'Watch Now'}
                </motion.button>
              </Link>

              <motion.button
                onClick={handleWatchlist}
                className="btn-secondary text-sm py-3.5 px-5"
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              >
                {inWatchlist
                  ? <BookmarkCheck size={16} className="text-primary-400" />
                  : <Bookmark size={16} />}
                {inWatchlist ? 'In List' : 'Watchlist'}
              </motion.button>

              <motion.button
                onClick={handleFavorite} className="btn-icon w-12 h-12"
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9, rotate: -10 }}
              >
                {inFavorites
                  ? <Heart size={18} fill="currentColor" className="text-accent-pink" />
                  : <Heart size={18} className="text-gray-400" />}
              </motion.button>
            </motion.div>
          </div>
        </div>

        {/* ── TABS ─────────────────────────────────────────── */}
        <div className="mt-10 md:mt-14">
          <div className="flex gap-1 border-b border-white/[0.07] mb-8 overflow-x-auto">
            {([
              { key: 'overview', label: 'Overview', icon: Info },
              ...(contentType !== 'movie' ? [{ key: 'episodes', label: 'Episodes', icon: List }] : []),
              { key: 'similar',  label: 'Similar',  icon: Film },
            ] as { key: typeof activeTab; label: string; icon: React.FC<{ size: number }> }[])
              .map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap -mb-px ${
                    activeTab === key
                      ? 'border-primary-400 text-white'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Icon size={15} />{label}
                </button>
              ))}
          </div>

          <AnimatePresence mode="wait">

            {/* ── OVERVIEW ─────────────────────────────────── */}
            {activeTab === 'overview' && (
              <motion.div key="overview"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                {/* Synopsis */}
                <div>
                  <h3 className="font-display font-bold text-lg text-white mb-3">Synopsis</h3>
                  <p className={`text-gray-300 text-sm md:text-base leading-relaxed ${!showFullOverview ? 'line-clamp-4' : ''}`}>
                    {overview || 'No synopsis available.'}
                  </p>
                  {overview && overview.length > 300 && (
                    <button
                      onClick={() => setShowFullOverview(!showFullOverview)}
                      className="flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300 mt-2 transition-colors"
                    >
                      {showFullOverview ? 'Show less' : 'Read more'}
                      <ChevronDown size={14} className={`transition-transform ${showFullOverview ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>

                {/* Anime info grid */}
                {anime && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Format', value: anime.format?.replace('_', ' ') },
                      { label: 'Season', value: anime.season ? `${anime.season} ${anime.seasonYear}` : String(anime.seasonYear || '') },
                      { label: 'Status', value: anime.status === 'RELEASING' ? 'Airing' : anime.status === 'FINISHED' ? 'Completed' : anime.status },
                      { label: 'Studio', value: anime.studios.nodes.find(s => s.isAnimationStudio)?.name || anime.studios.nodes[0]?.name },
                    ].filter(i => i.value).map(({ label, value }) => (
                      <div key={label} className="glass-card p-4">
                        <p className="text-xs text-gray-500 mb-1">{label}</p>
                        <p className="text-sm font-semibold text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cast */}
                {cast.length > 0 && (
                  <div>
                    <h3 className="font-display font-bold text-lg text-white mb-4 flex items-center gap-2">
                      <Users size={18} className="text-primary-400" /> Cast
                    </h3>
                    <div className="flex gap-3 overflow-x-auto pb-2 scroll-row">
                      {cast.map(member => {
                        const profileUrl = getProfileUrl(member.profile_path);
                        return (
                          <div key={member.id} className="flex-shrink-0 w-[80px] text-center">
                            <div className="w-16 h-16 rounded-full overflow-hidden mx-auto bg-zx-s3 border-2 border-white/5">
                              {profileUrl
                                ? <img src={profileUrl} alt={member.name} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xl font-bold">{member.name[0]}</div>}
                            </div>
                            <p className="text-[10px] text-white font-medium mt-1.5 leading-tight truncate">{member.name}</p>
                            <p className="text-[9px] text-gray-600 truncate">{member.character}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Collection */}
                {movie?.belongs_to_collection && (
                  <div className="glass-card p-5 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                      {movie.belongs_to_collection.poster_path
                        ? <img src={getPosterUrl(movie.belongs_to_collection.poster_path, 'w185') || ''} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-zx-s3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5">Part of</p>
                      <p className="text-white font-semibold truncate">{movie.belongs_to_collection.name}</p>
                    </div>
                    <ChevronRight size={18} className="text-gray-600 flex-shrink-0" />
                  </div>
                )}
              </motion.div>
            )}

            {/* ── EPISODES ─────────────────────────────────── */}
            {activeTab === 'episodes' && contentType !== 'movie' && (
              <motion.div key="episodes"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}
              >
                {/* Season selector — shown for both TV and anime (when TMDB data available) */}
                {seasonsList.length > 1 && (
                  <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scroll-row">
                    {seasonsList.map(season => (
                      <button
                        key={season.id}
                        onClick={() => setSelectedSeason(season.season_number)}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          selectedSeason === season.season_number
                            ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                            : 'bg-zx-s3 text-gray-400 border border-white/[0.07] hover:text-white'
                        }`}
                      >
                        {season.name}
                        <span className="ml-1.5 text-xs opacity-60">({season.episode_count})</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Hint when using Server 1/2 for multi-season anime */}
                {type === 'anime' && seasonsList.length > 1 && (
                  <div className="flex items-start gap-2 mb-4 px-1 py-2 rounded-xl bg-primary-500/[0.06] border border-primary-500/15">
                    <Info size={13} className="text-primary-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-400 leading-relaxed">
                      <span className="text-primary-300 font-semibold">Servers 3–6</span> use the season &amp; episode above.
                      <span className="text-primary-300 font-semibold"> Servers 1–2</span> always use the AniList ID — use the episode number that matches the AniList entry.
                    </p>
                  </div>
                )}

                {/* Synthetic-episode note */}
                {type === 'anime' && !animeTmdbSeason?.episodes?.length && (anime?.episodes || 0) > 0 && !tmdbLookupLoading && (
                  <p className="text-xs text-gray-600 mb-4 px-1 flex items-center gap-1.5">
                    <Info size={11} />
                    No TMDB episode details — showing {anime?.episodes} episodes
                  </p>
                )}

                {/* Loading episodes */}
                {type === 'anime' && tmdbLookupLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Loader2 size={14} className="animate-spin" /> Loading season data…
                  </div>
                )}

                {/* Episode list */}
                <div className="space-y-3">
                  {episodesToShow.length > 0 ? (
                    episodesToShow.map(ep => {
                      const stillUrl = ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null;
                      return (
                        <Link key={ep.id} to={epWatchUrl(ep)}>
                          <motion.div
                            className="flex items-start gap-4 p-3 rounded-xl bg-zx-s2 border border-white/[0.05] hover:bg-zx-s3 hover:border-white/10 transition-all cursor-pointer group"
                            whileHover={{ x: 2 }}
                          >
                            <div className="relative flex-shrink-0 w-28 h-16 rounded-lg overflow-hidden bg-zx-s3">
                              {stillUrl
                                ? <img src={stillUrl} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center"><Play size={20} className="text-gray-600" /></div>}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                                <Play size={20} fill="white" className="text-white" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-primary-400 tabular-nums">EP {ep.episode_number}</span>
                                {ep.vote_average > 0 && (
                                  <span className="flex items-center gap-0.5 text-[10px] text-rating">
                                    <Star size={9} fill="currentColor" />{ep.vote_average.toFixed(1)}
                                  </span>
                                )}
                                {ep.runtime && <span className="text-[10px] text-gray-600">{ep.runtime}m</span>}
                              </div>
                              <p className="text-sm font-semibold text-white truncate">{ep.name}</p>
                              {ep.overview && (
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ep.overview}</p>
                              )}
                            </div>
                          </motion.div>
                        </Link>
                      );
                    })
                  ) : (
                    <p className="text-center text-gray-600 py-8">
                      {type === 'anime' && !anime?.episodes
                        ? 'Episode count unknown'
                        : 'No episodes available for this season'}
                    </p>
                  )}
                </div>

                {/* ── DOWNLOAD SECTION ─────────────────────────── */}
                {(contentType === 'anime' || contentType === 'tv') && episodesToShow.length > 0 && (
                  <DownloadSection
                    contentType={contentType}
                    contentId={contentId}
                    title={title}
                    episodes={episodesToShow}
                    animeId={anime?.id}
                  />
                )}
              </motion.div>
            )}

            {/* ── SIMILAR ──────────────────────────────────── */}
            {activeTab === 'similar' && (
              <motion.div key="similar"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}
              >
                {recommendations.length > 0
                  ? <ContentRow title="You May Also Like" items={recommendations} />
                  : <p className="text-center text-gray-600 py-8">No recommendations found</p>}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      <div className="h-24" />
    </div>
  );
}
