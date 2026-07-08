// ─── Live TV (IPTV) Types ──────────────────────────────────────────
// Integrated from the standalone IPTVHub project. Channel data is
// parsed server-side from bundled M3U playlists and served from
// backend/routes/iptv.js (same Express process as the rest of the API).

export interface Channel {
  id:          string;
  tvgId:       string;
  name:        string;
  fullName:    string;
  quality:     string;
  resNum:      number;
  label:       string;
  url:         string;
  logo:        string;
  groupTitle:  string;
  category:    string;
  referer:     string;
  userAgent:   string;
  country:     string;
  countryCode: string;
  platform:    string | null;
}

export interface LiveCountry {
  code:  string;
  count: number;
  flag:  string;
}

export interface LiveCategory {
  id:    string;
  icon:  string;
  label: string;
  count: number;
}

export interface ChannelsResponse {
  total:  number;
  offset: number;
  limit:  number;
  items:  Channel[];
}

export interface LiveHealthResponse {
  status:    string;
  channels:  number;
  countries: number;
  logos:     number;
  error?:    string;
}

export type LiveSortMode = 'name' | 'quality';
