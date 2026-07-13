import type { AniListMedia } from '@/types';

const ANILIST_URL = 'https://graphql.anilist.co';

const MEDIA_FRAGMENT = `
  fragment MediaFields on Media {
    id idMal
    title { romaji english native }
    coverImage { extraLarge large medium color }
    bannerImage
    description(asHtml: false)
    averageScore meanScore popularity trending
    episodes duration status season seasonYear format genres
    studios { nodes { id name isAnimationStudio } }
    trailer { id site thumbnail }
    nextAiringEpisode { airingAt episode timeUntilAiring }
    streamingEpisodes { title thumbnail site }
  }
`;

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

async function anilistQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const cacheKey = query + JSON.stringify(variables || {});
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data as T;
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`AniList ${response.status}`);
  const json = await response.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AniList error');
  cache.set(cacheKey, { data: json.data, timestamp: Date.now() });
  return json.data as T;
}

// ─── Paged queries ────────────────────────────────────────────────────────────

export const getTrendingAnime = async (page = 1, perPage = 20): Promise<AniListMedia[]> => {
  const q = `${MEDIA_FRAGMENT} query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(sort:TRENDING_DESC,type:ANIME,isAdult:false){...MediaFields}}}`;
  return (await anilistQuery<{ Page: { media: AniListMedia[] } }>(q, { page, perPage })).Page.media;
};

export const getPopularAnime = async (page = 1, perPage = 20): Promise<AniListMedia[]> => {
  const q = `${MEDIA_FRAGMENT} query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(sort:POPULARITY_DESC,type:ANIME,isAdult:false){...MediaFields}}}`;
  return (await anilistQuery<{ Page: { media: AniListMedia[] } }>(q, { page, perPage })).Page.media;
};

export const getTopRatedAnime = async (page = 1, perPage = 20): Promise<AniListMedia[]> => {
  const q = `${MEDIA_FRAGMENT} query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(sort:SCORE_DESC,type:ANIME,isAdult:false,minimumTagRank:60){...MediaFields}}}`;
  return (await anilistQuery<{ Page: { media: AniListMedia[] } }>(q, { page, perPage })).Page.media;
};

export const getSeasonalAnime = async (season?: string, year?: number, page = 1, perPage = 20): Promise<AniListMedia[]> => {
  const month = new Date().getMonth();
  const seas  = season || ['WINTER', 'SPRING', 'SUMMER', 'FALL'][Math.floor(month / 3)];
  const yr    = year   || new Date().getFullYear();
  const q = `${MEDIA_FRAGMENT} query($season:MediaSeason,$year:Int,$page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(season:$season,seasonYear:$year,sort:POPULARITY_DESC,type:ANIME,isAdult:false){...MediaFields}}}`;
  return (await anilistQuery<{ Page: { media: AniListMedia[] } }>(q, { season: seas, year: yr, page, perPage })).Page.media;
};

export const getAnimeByGenre = async (genre: string, page = 1, perPage = 20): Promise<AniListMedia[]> => {
  const q = `${MEDIA_FRAGMENT} query($genre:String,$page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(genre:$genre,sort:POPULARITY_DESC,type:ANIME,isAdult:false){...MediaFields}}}`;
  return (await anilistQuery<{ Page: { media: AniListMedia[] } }>(q, { genre, page, perPage })).Page.media;
};

export const getAnimeSpecials = async (page = 1, perPage = 30): Promise<AniListMedia[]> => {
  const q = `${MEDIA_FRAGMENT} query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(format_in:[OVA,SPECIAL,MOVIE],sort:POPULARITY_DESC,type:ANIME,isAdult:false){...MediaFields}}}`;
  return (await anilistQuery<{ Page: { media: AniListMedia[] } }>(q, { page, perPage })).Page.media;
};

export const searchAnime = async (search: string, page = 1, perPage = 20): Promise<AniListMedia[]> => {
  if (!search.trim()) return [];
  const q = `${MEDIA_FRAGMENT} query($search:String,$page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(search:$search,type:ANIME,isAdult:false){...MediaFields}}}`;
  return (await anilistQuery<{ Page: { media: AniListMedia[] } }>(q, { search, page, perPage })).Page.media;
};

// ─── Anime by ID with full relations ─────────────────────────────────────────

export const getAnimeById = async (id: number): Promise<AniListMedia | null> => {
  const q = `
    ${MEDIA_FRAGMENT}
    query($id:Int){
      Media(id:$id,type:ANIME){
        ...MediaFields
        relations {
          edges {
            relationType
            node {
              id format episodes status
              nextAiringEpisode { airingAt episode timeUntilAiring }
              title { romaji english }
              coverImage { large medium color }
            }
          }
        }
      }
    }
  `;
  try {
    return (await anilistQuery<{ Media: AniListMedia }>(q, { id })).Media;
  } catch { return null; }
};

export const getAnimeByMalId = async (malId: number): Promise<AniListMedia | null> => {
  const q = `${MEDIA_FRAGMENT} query($idMal:Int){Media(idMal:$idMal,type:ANIME){...MediaFields}}`;
  try { return (await anilistQuery<{ Media: AniListMedia }>(q, { idMal: malId })).Media; }
  catch { return null; }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const formatAniListScore = (score: number | null): string => {
  if (!score) return 'N/A';
  return (score / 10).toFixed(1);
};

export const getAniListFormat = (format: string): string => {
  const formats: Record<string, string> = {
    TV: 'TV Series', TV_SHORT: 'TV Short', MOVIE: 'Movie',
    SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music',
  };
  return formats[format] || format;
};

export const getAniListStatus = (status: string): string => {
  const statuses: Record<string, string> = {
    FINISHED: 'Finished', RELEASING: 'Airing', NOT_YET_RELEASED: 'Upcoming',
    CANCELLED: 'Cancelled', HIATUS: 'On Hiatus',
  };
  return statuses[status] || status;
};
