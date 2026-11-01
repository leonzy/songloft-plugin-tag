import { scoreMatch } from './scoring';

/** Fingerprint similarity does not validate the attached MusicBrainz labels. */
export function fingerprintConflicts(
  candidates: { artist: string; title: string }[],
  result: { artist: string; title: string },
): boolean {
  const known = candidates.filter(c => {
    const text = /[?？\uFFFD]/.test(c.title) ? c.title.replace(/\b(?:inst\.?|instrumental|live|remix)\b/gi,'') : c.title;
    return /[\p{L}\p{N}]/u.test(text.replace(/\uFFFD/g,''));
  });
  if (!known.length) return false;
  // Use text-only scoring without source bonuses or duration penalties. Allow
  // moderate differences (versions, transliteration), flag near-total disagreement.
  return Math.max(...known.map(c => scoreMatch(c, { ...result, source: 'netease' }))) < 0.25;
}
