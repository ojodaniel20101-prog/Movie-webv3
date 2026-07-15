// ─── Live TV helper utilities ───────────────────────────────────────

/** Deterministic hue (0-359) from a string — used for per-channel
 *  gradient/initials colors when no logo is available. */
export function strHue(s: string): number {
  let h = 5381;
  for (const c of s) h = (((h << 5) - h) + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 360;
}

export function initials(name: string): string {
  return name.split(/[\s\-/]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

/**
 * Logo URL sources to try in order:
 * 1. The logo from M3U (if provided)
 * 2. Wikimedia Commons ( iptv-org database source )
 * 3. i.imgur (common fallback host in iptv-org)
 */
const LOGO_OVERRIDES: Record<string, string> = {
  'DisneyJunior.us':  'https://upload.wikimedia.org/wikipedia/commons/e/e3/2024_Disney_Jr._Logo.svg',
  'DisneyXD.us':      'https://upload.wikimedia.org/wikipedia/commons/a/a8/2015_Disney_XD_logo.svg',
  'NickJr.us':        'https://upload.wikimedia.org/wikipedia/commons/3/3d/Nick_Jr._logo_2023.svg',
  'Nickelodeon.us':   'https://upload.wikimedia.org/wikipedia/commons/3/39/Nickelodeon_2023_logo_%28horizontal%29.svg',
  'Nicktoons.us':     'https://upload.wikimedia.org/wikipedia/commons/a/a8/Nicktoons_%28TV_channel%29_logo.svg',
  'PBSKids.us':       'https://upload.wikimedia.org/wikipedia/commons/3/30/PBS_Kids_logo_%282022%29.svg',
  'FoxNewsChannel.us':'https://upload.wikimedia.org/wikipedia/commons/6/67/Fox_News_Channel_logo.svg',
  'NBCSportsNOW.us':  'https://upload.wikimedia.org/wikipedia/commons/7/78/NBC_Sports_logo.svg',
  'MrBean.uk':        'https://upload.wikimedia.org/wikipedia/commons/4/4c/Mr._Bean_%28character%29.png',
  'AnandTV.in':       'https://i.imgur.com/AnandTV.png',
  'HotWheels.us':     'https://upload.wikimedia.org/wikipedia/commons/9/9e/Hot_Wheels_logo.svg',
  'KartoonChannel.us':'https://upload.wikimedia.org/wikipedia/commons/8/8a/Kartoon_Channel_logo.png',
  'ToonGoggles.us':   'https://i.imgur.com/ToonGoggles.png',
  'ToonGogglesJunior.us': 'https://i.imgur.com/ToonGoggles.png',
  'beINSPORTSXTRA.us':    'https://upload.wikimedia.org/wikipedia/commons/8/8d/BeIN_SPORTS_logo.svg',
  'beINSPORTSXTRATubi.us':'https://upload.wikimedia.org/wikipedia/commons/8/8d/BeIN_SPORTS_logo.svg',
};

export function logoUrls(logo: string, tvgId: string): string[] {
  const urls: string[] = [];
  // 1. M3U-provided logo (if valid http URL)
  if (logo && logo.startsWith('http')) urls.push(logo);
  // 2. Hard-coded Wikimedia Commons / known-good URLs
  if (tvgId && LOGO_OVERRIDES[tvgId]) urls.push(LOGO_OVERRIDES[tvgId]);
  // 3. Try iptv-org API CDN (PNG thumbnails of SVGs)
  if (tvgId) {
    urls.push(`https://iptv-org.github.io/api/logos/${tvgId}.png`);
    const base = tvgId.split('@')[0];
    if (base !== tvgId) urls.push(`https://iptv-org.github.io/api/logos/${base}.png`);
  }
  return urls;
}

export function fmtChannelCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function qualityColor(q: string): { bg: string; text: string } {
  const n = parseInt(q, 10);
  if (n >= 1080) return { bg: 'rgba(59,130,246,0.85)',  text: '#DBEAFE' };
  if (n >= 720)  return { bg: 'rgba(16,185,129,0.85)',  text: '#D1FAE5' };
  return { bg: 'rgba(255,255,255,0.18)', text: 'rgba(255,255,255,0.75)' };
}

/** Genuine ISO country-flag emoji from a 2-letter code — the correct,
 *  universal way to represent a country (kept deliberately, same
 *  convention used elsewhere; this is content, not a UI chrome icon). */
export function countryFlag(code: string): string {
  if (!code || code.length < 2) return '🌐';
  try {
    return [...code.toUpperCase().slice(0, 2)]
      .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
      .join('');
  } catch {
    return '🌐';
  }
}
