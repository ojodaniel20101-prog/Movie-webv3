// ─── Subtitle Service ──────────────────────────────────────
// Fetches and parses subtitles matching cinverse's approach

export interface SubtitleTrack {
  id: string;
  lan: string;
  lanName: string;
  url: string;
  size: string;
  delay: number;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

// ─── Free subtitle APIs ────────────────────────────────────
const SUBTITLE_APIS = {
  // OpenSubtitles.com API (free tier)
  opensubtitles: 'https://api.opensubtitles.com/api/v1',
  // Subtitle API via TMDB
  subdl: 'https://sub.woka.tv',
  // Fallback: direct subtitle search
  fallback: 'https://rest.opensubtitles.org',
};

// ─── Parse SRT to WebVTT ───────────────────────────────────
export function srtToVtt(srtContent: string): string {
  const vtt = 'WEBVTT\n\n' + srtContent
    .replace(/^(\d{2}:\d{2}:\d{2}),(\d{3})/gm, '$1.$2')
    .replace(/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/gm, '$1 --> $2')
    .replace(/\{\\[a-zA-Z]+\d*\}/g, '')
    .replace(/<\/?(font|b|i|u)(\s+[^>]*)?>/gi, (m) => m.toLowerCase());
  return vtt;
}

// ─── Parse SRT to cues ─────────────────────────────────────
export function parseSrt(srtContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = srtContent.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Find the timing line (skip index line)
    let timingLine = '';
    let textLines: string[] = [];
    let foundTiming = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(trimmed)) {
        timingLine = trimmed;
        foundTiming = true;
        continue;
      }
      if (foundTiming) {
        textLines.push(trimmed);
      }
    }

    if (!timingLine || textLines.length === 0) continue;

    const match = timingLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!match) continue;

    const start =
      parseInt(match[1]) * 3600 +
      parseInt(match[2]) * 60 +
      parseInt(match[3]) +
      parseInt(match[4]) / 1000;
    const end =
      parseInt(match[5]) * 3600 +
      parseInt(match[6]) * 60 +
      parseInt(match[7]) +
      parseInt(match[8]) / 1000;

    const text = textLines
      .join('\n')
      .replace(/\{\\[a-zA-Z]+\d*\}/g, '')
      .replace(/<\/?(font)(\s+[^>]*)?>/gi, '')
      .trim();

    if (text) {
      cues.push({ start, end, text });
    }
  }

  return cues;
}

// ─── Parse WebVTT to cues ──────────────────────────────────
export function parseVtt(vttContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = vttContent.trim().split('\n');
  let i = 0;

  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) i++;

  while (i < lines.length) {
    const timingMatch = lines[i].match(
      /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/
    );
    if (!timingMatch) { i++; continue; }

    const start = parseTime(timingMatch[1]);
    const end = parseTime(timingMatch[2]);
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
      textLines.push(lines[i].trim());
      i++;
    }

    if (textLines.length > 0) {
      cues.push({ start, end, text: textLines.join('\n') });
    }
    i++;
  }

  return cues;
}

function parseTime(timeStr: string): number {
  const parts = timeStr.split(':');
  const hours = parseFloat(parts[0]) || 0;
  const minutes = parseFloat(parts[1]) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// ─── Fetch subtitle file ───────────────────────────────────
export async function fetchSubtitleFile(url: string): Promise<SubtitleCue[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = await response.text();

    if (url.endsWith('.vtt') || content.trim().startsWith('WEBVTT')) {
      return parseVtt(content);
    }
    return parseSrt(content);
  } catch (error) {
    console.error('[Subtitles] Failed to fetch subtitle file:', error);
    return [];
  }
}

// ─── Generate dummy subtitle tracks for demo ───────────────
// In production, these would come from the backend API
export function generateSubtitleTracks(
  tmdbId: number,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number
): SubtitleTrack[] {
  // Return common subtitle languages
  return [
    { id: '1', lan: 'en', lanName: 'English', url: '', size: '0', delay: 0 },
    { id: '2', lan: 'es', lanName: 'Spanish', url: '', size: '0', delay: 0 },
    { id: '3', lan: 'fr', lanName: 'French', url: '', size: '0', delay: 0 },
    { id: '4', lan: 'de', lanName: 'German', url: '', size: '0', delay: 0 },
    { id: '5', lan: 'pt', lanName: 'Portuguese', url: '', size: '0', delay: 0 },
    { id: '6', lan: 'it', lanName: 'Italian', url: '', size: '0', delay: 0 },
    { id: '7', lan: 'ru', lanName: 'Russian', url: '', size: '0', delay: 0 },
    { id: '8', lan: 'ar', lanName: 'Arabic', url: '', size: '0', delay: 0 },
    { id: '9', lan: 'hi', lanName: 'Hindi', url: '', size: '0', delay: 0 },
    { id: '10', lan: 'ja', lanName: 'Japanese', url: '', size: '0', delay: 0 },
    { id: '11', lan: 'ko', lanName: 'Korean', url: '', size: '0', delay: 0 },
    { id: '12', lan: 'zh', lanName: 'Chinese', url: '', size: '0', delay: 0 },
  ];
}

// ─── Get subtitle from external source ─────────────────────
export async function searchSubtitles(
  imdbId: string,
  language: string = 'en'
): Promise<SubtitleTrack[]> {
  try {
    // Use opensubtitles REST API (no auth required for search)
    const response = await fetch(
      `${SUBTITLE_APIS.fallback}/search/imdbid-${imdbId.replace('tt', '')}/sublanguageid-${language}`,
      {
        headers: {
          'X-User-Agent': 'TemporaryUserAgent',
        },
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any, index: number) => ({
      id: String(index + 1),
      lan: item.ISO639 || language,
      lanName: item.LanguageName || language,
      url: item.SubDownloadLink || '',
      size: item.SubSize || '0',
      delay: 0,
    }));
  } catch (error) {
    console.error('[Subtitles] Search failed:', error);
    return [];
  }
}

// ─── Default subtitle styles (matching cinverse) ───────────
export interface SubtitleStyle {
  fontSize: 'small' | 'medium' | 'large' | 'xl';
  textColor: 'white' | 'yellow';
  background: 'none' | 'semi' | 'full';
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 'medium',
  textColor: 'white',
  background: 'semi',
};

export const FONT_SIZE_MAP = {
  small: '14px',
  medium: '18px',
  large: '22px',
  xl: '26px',
};

export const TEXT_COLOR_MAP = {
  white: '#FFFFFF',
  yellow: '#FFD700',
};

export const BACKGROUND_MAP = {
  none: 'transparent',
  semi: 'rgba(0, 0, 0, 0.5)',
  full: 'rgba(0, 0, 0, 0.8)',
};

// ─── Local storage helpers ─────────────────────────────────
const STORAGE_KEY = 'zentrix_subtitle_settings';

export function loadSubtitleStyle(): SubtitleStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_SUBTITLE_STYLE;
}

export function saveSubtitleStyle(style: SubtitleStyle): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
}
