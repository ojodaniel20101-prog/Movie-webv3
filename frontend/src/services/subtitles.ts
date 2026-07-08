/**
 * Subtitle Service
 * ─────────────────────────────────────────────────────────────────
 * Comprehensive subtitle handling: SRT/VTT parsing, conversion,
 * fetching, styling, and LocalStorage persistence.
 * Matches cinverse subtitle appearance and functionality.
 */

// ─── Types ───────────────────────────────────────────────────

export interface SubtitleTrack {
  id: string;
  lan: string;       // language code (en, es, fr, ...)
  lanName: string;   // display name (English, Spanish, ...)
  url: string;       // subtitle file URL
  size?: number;     // file size in bytes
  delay?: number;    // delay in milliseconds
}

export interface ParsedCue {
  id: number;
  startTime: number;  // in seconds
  endTime: number;    // in seconds
  text: string;
}

export type SubtitleFontSize = 'small' | 'medium' | 'large' | 'xl';
export type SubtitleTextColor = 'white' | 'yellow';
export type SubtitleBackground = 'none' | 'semi' | 'full';

export interface SubtitleStyleSettings {
  fontSize: SubtitleFontSize;
  textColor: SubtitleTextColor;
  background: SubtitleBackground;
  enabled: boolean;
}

// ─── Constants ───────────────────────────────────────────────

const STORAGE_KEY = 'zentrix_subtitle_settings';

const DEFAULT_SETTINGS: SubtitleStyleSettings = {
  fontSize: 'medium',
  textColor: 'white',
  background: 'semi',
  enabled: true,
};

/** Common subtitle language options (12+ languages matching cinverse) */
export const SUBTITLE_LANGUAGES: { code: string; name: string }[] = [
  { code: 'off', name: 'Off' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'tr', name: 'Turkish' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' },
  { code: 'cs', name: 'Czech' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'et', name: 'Estonian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'ga', name: 'Irish' },
  { code: 'sq', name: 'Albanian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'mt', name: 'Maltese' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'cy', name: 'Welsh' },
  { code: 'eu', name: 'Basque' },
  { code: 'ca', name: 'Catalan' },
  { code: 'gl', name: 'Galician' },
  { code: 'ast', name: 'Asturian' },
  { code: 'oc', name: 'Occitan' },
  { code: 'br', name: 'Breton' },
  { code: 'wa', name: 'Walloon' },
  { code: 'co', name: 'Corsican' },
];

// ─── LocalStorage Persistence ────────────────────────────────

export function loadSubtitleSettings(): SubtitleStyleSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SubtitleStyleSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSubtitleSettings(settings: SubtitleStyleSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function resetSubtitleSettings(): SubtitleStyleSettings {
  saveSubtitleSettings(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}

// ─── CSS Variable Application ────────────────────────────────

const FONT_SIZE_MAP: Record<SubtitleFontSize, string> = {
  small: '14px',
  medium: '18px',
  large: '22px',
  xl: '26px',
};

const TEXT_COLOR_MAP: Record<SubtitleTextColor, string> = {
  white: '#FFFFFF',
  yellow: '#FFD060',
};

const BACKGROUND_MAP: Record<SubtitleBackground, string> = {
  none: 'transparent',
  semi: 'rgba(0,0,0,0.55)',
  full: 'rgba(0,0,0,0.85)',
};

/**
 * Apply subtitle style settings to CSS custom properties.
 * Call this whenever settings change.
 */
export function applySubtitleStyles(settings: SubtitleStyleSettings): void {
  const root = document.documentElement;
  root.style.setProperty('--sub-font-size', FONT_SIZE_MAP[settings.fontSize]);
  root.style.setProperty('--sub-text-color', TEXT_COLOR_MAP[settings.textColor]);
  root.style.setProperty('--sub-bg', BACKGROUND_MAP[settings.background]);
  root.style.setProperty('--sub-enabled', settings.enabled ? '1' : '0');
}

/**
 * Initialize subtitle styles from LocalStorage on app boot.
 */
export function initSubtitleStyles(): void {
  const settings = loadSubtitleSettings();
  applySubtitleStyles(settings);
}

// ─── SRT Parser ──────────────────────────────────────────────

/**
 * Parse SRT subtitle content into cue objects.
 */
export function parseSRT(content: string): ParsedCue[] {
  const cues: ParsedCue[] = [];
  // Normalize line endings and split into blocks
  const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // First line is the cue ID
    const idMatch = lines[0].match(/^\d+$/);
    if (!idMatch) continue;
    const id = parseInt(lines[0], 10);

    // Second line is the time range
    const timeMatch = lines[1].match(
      /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!timeMatch) continue;

    const startTime =
      parseInt(timeMatch[1], 10) * 3600 +
      parseInt(timeMatch[2], 10) * 60 +
      parseInt(timeMatch[3], 10) +
      parseInt(timeMatch[4], 10) / 1000;

    const endTime =
      parseInt(timeMatch[5], 10) * 3600 +
      parseInt(timeMatch[6], 10) * 60 +
      parseInt(timeMatch[7], 10) +
      parseInt(timeMatch[8], 10) / 1000;

    // Remaining lines are the text
    const text = lines.slice(2).join('\n').trim();
    if (!text) continue;

    cues.push({ id, startTime, endTime, text });
  }

  return cues;
}

// ─── VTT Parser ──────────────────────────────────────────────

/**
 * Parse WebVTT subtitle content into cue objects.
 */
export function parseVTT(content: string): ParsedCue[] {
  const cues: ParsedCue[] = [];
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Skip WEBVTT header
  let i = 0;
  if (lines[0]?.startsWith('WEBVTT')) {
    i = 1;
    // Skip any header metadata
    while (i < lines.length && lines[i].trim() !== '') i++;
    i++; // Skip the blank line
  }

  while (i < lines.length) {
    // Skip blank lines
    if (lines[i].trim() === '') {
      i++;
      continue;
    }

    // Optional cue ID
    let cueId = 0;
    const timeLineIndex = i;
    if (!lines[i].includes('-->')) {
      cueId = parseInt(lines[i], 10) || 0;
      i++;
    }

    if (i >= lines.length) break;

    // Time line
    const timeMatch = lines[i].match(
      /^(\d{1,2}:)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!timeMatch) {
      i++;
      continue;
    }

    let startTime: number;
    let endTime: number;

    if (timeMatch[1]) {
      // HH:MM:SS format
      startTime =
        parseInt(timeMatch[1].replace(':', ''), 10) * 3600 +
        parseInt(timeMatch[2], 10) * 60 +
        parseInt(timeMatch[3], 10) +
        parseInt(timeMatch[4], 10) / 1000;
    } else {
      // MM:SS format
      startTime =
        parseInt(timeMatch[2], 10) * 60 +
        parseInt(timeMatch[3], 10) +
        parseInt(timeMatch[4], 10) / 1000;
    }

    if (timeMatch[5]) {
      endTime =
        parseInt(timeMatch[5].replace(':', ''), 10) * 3600 +
        parseInt(timeMatch[6], 10) * 60 +
        parseInt(timeMatch[7], 10) +
        parseInt(timeMatch[8], 10) / 1000;
    } else {
      endTime =
        parseInt(timeMatch[6], 10) * 60 +
        parseInt(timeMatch[7], 10) +
        parseInt(timeMatch[8], 10) / 1000;
    }

    i++;

    // Collect text lines
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }

    const text = textLines.join('\n').trim();
    if (text) {
      cues.push({ id: cueId || cues.length + 1, startTime, endTime, text });
    }

    i++;
  }

  return cues;
}

// ─── SRT to WebVTT Converter ─────────────────────────────────

/**
 * Convert SRT content to WebVTT format.
 * Browsers natively support WebVTT in <track> elements.
 */
export function srtToVtt(srtContent: string): string {
  let vtt = 'WEBVTT\n\n';

  const blocks = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Check if first line is a number (cue ID)
    const hasId = /^\d+$/.test(lines[0]);
    const timeLine = hasId ? lines[1] : lines[0];
    const textStart = hasId ? 2 : 1;

    // Convert time format from 00:00:00,000 --> 00:00:00,000
    // to 00:00:00.000 --> 00:00:00.000
    const convertedTime = timeLine
      .replace(/,(\d{3})/g, '.$1')
      .replace(\n    ///g, ' ');

    const text = lines.slice(textStart).join('\n');
    if (!text.trim()) continue;

    if (hasId) {
      vtt += lines[0] + '\n';
    }
    vtt += convertedTime + '\n';
    vtt += text + '\n\n';
  }

  return vtt;
}

// ─── Subtitle Fetcher with Fallback ──────────────────────────

/**
 * Fetch subtitle file from URL with CORS proxy fallback.
 * Automatically converts SRT to VTT if needed.
 */
export async function fetchSubtitle(
  url: string,
  proxyUrl?: string
): Promise<{ vtt: string; cues: ParsedCue[] }> {
  let content: string;
  let isSrt = false;

  // Try direct fetch first
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    content = await res.text();
    isSrt = !content.trim().startsWith('WEBVTT');
  } catch (directErr) {
    // Try proxy fallback
    if (proxyUrl) {
      try {
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
        content = await res.text();
        isSrt = !content.trim().startsWith('WEBVTT');
      } catch {
        throw new Error(`Failed to fetch subtitle: ${(directErr as Error).message}`);
      }
    } else {
      throw directErr;
    }
  }

  // Convert SRT to VTT if needed
  const vtt = isSrt ? srtToVtt(content) : content;
  const cues = isSrt ? parseSRT(content) : parseVTT(content);

  return { vtt, cues };
}

/**
 * Create a Blob URL for VTT content that can be used in <track src="...">
 */
export function createVttBlobUrl(vttContent: string): string {
  const blob = new Blob([vttContent], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

/**
 * Revoke a previously created Blob URL to prevent memory leaks.
 */
export function revokeVttBlobUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

// ─── Cue Lookup (for custom subtitle rendering) ──────────────

/**
 * Find the active cue(s) for a given playback time.
 */
export function findActiveCues(cues: ParsedCue[], currentTime: number): ParsedCue[] {
  return cues.filter(c => currentTime >= c.startTime && currentTime <= c.endTime);
}

/**
 * Format cue text for display (handle basic SRT formatting tags).
 */
export function formatCueText(text: string): string {
  return text
    .replace(/<b>(.*?)<\/b>/gi, '<strong>$1</strong>')
    .replace(/<i>(.*?)<\/i>/gi, '<em>$1</em>')
    .replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>')
    .replace(/\{\\b1\}(.*?)\{\\b0\}/g, '<strong>$1</strong>')
    .replace(/\{\\i1\}(.*?)\{\\i0\}/g, '<em>$1</em>')
    .replace(/\{\\.*?(\}|$)/g, '') // Remove unsupported ASS tags
    .replace(/<font[^>]*>(.*?)<\/font>/gi, '$1')
    .replace(/<\/?[^>]+(>|$)/g, ''); // Strip remaining HTML for safety
}

// ─── Language Name Helper ────────────────────────────────────

/**
 * Get human-readable language name from language code.
 */
export function getLanguageName(code: string): string {
  const lang = SUBTITLE_LANGUAGES.find(l => l.code === code);
  return lang?.name || code.toUpperCase();
}

// ─── Font Size Label Helper ──────────────────────────────────

export function getFontSizeLabel(size: SubtitleFontSize): string {
  switch (size) {
    case 'small': return 'Small';
    case 'medium': return 'Medium';
    case 'large': return 'Large';
    case 'xl': return 'Extra Large';
  }
}

export function getBackgroundLabel(bg: SubtitleBackground): string {
  switch (bg) {
    case 'none': return 'None';
    case 'semi': return 'Semi-Transparent';
    case 'full': return 'Full';
  }
}

// ─── Default Export ──────────────────────────────────────────

export default {
  parseSRT,
  parseVTT,
  srtToVtt,
  fetchSubtitle,
  createVttBlobUrl,
  revokeVttBlobUrl,
  findActiveCues,
  formatCueText,
  loadSubtitleSettings,
  saveSubtitleSettings,
  resetSubtitleSettings,
  applySubtitleStyles,
  initSubtitleStyles,
  getLanguageName,
  getFontSizeLabel,
  getBackgroundLabel,
  SUBTITLE_LANGUAGES,
  DEFAULT_SETTINGS,
};
