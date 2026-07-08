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

export function logoUrls(logo: string, tvgId: string): string[] {
  const urls: string[] = [];
  if (logo) urls.push(logo);
  if (tvgId) {
    urls.push(`https://iptv-org.github.io/iptv/logos/${tvgId}.png`);
    const base = tvgId.split('@')[0];
    if (base !== tvgId) urls.push(`https://iptv-org.github.io/iptv/logos/${base}.png`);
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
