import { scoreMatch } from './scoring';

/** Fingerprint similarity does not validate the attached MusicBrainz labels. */
export function fingerprintConflicts(
  candidates: { artist: string; title: string }[],
  result: { artist: string; title: string },
): boolean {
  const known = candidates.filter(c => c.title);
  if (!known.length) return false;
  // Use text-only scoring without source bonuses or duration penalties. Allow
  // moderate differences (versions, transliteration), flag near-total disagreement.
  return Math.max(...known.map(c => scoreMatch(c, { ...result, source: 'netease' }))) < 0.25;
}
