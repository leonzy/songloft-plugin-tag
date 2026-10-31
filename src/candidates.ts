export interface Candidate { artist: string; title: string }

const GARBAGE_TITLE = /^(?:trad\s*\d*|track\s*\d*|unknown|audio\s*track\s*\d*|cd\s*track\s*\d*|data\s*track\s*\d*|未知|未命名|\d+)$/i;
const GARBAGE_ARTIST = /^(?:unknown|various(?: artists)?|未知(?:歌手)?|佚名)$/i;

/** Remove release/download noise, preserving meaningful versions such as Live/Remix. */
export function cleanFilenameNoise(value: string): string {
  return value
    .replace(/[【\[]\s*(?:FLAC|MP3|WAV|APE|WMA|OGG|DSF|320k?(?:bps)?|128k?(?:bps)?|192k?(?:bps)?|256k?(?:bps)?|HQ|SQ|Hi[-\s]?Res|无损|高音质|MV)\s*[】\]]/gi, '')
    .replace(/[【\[(（](?:抖音|快手|公众号|微信公众号|下载地址|音乐下载|更多音乐)\s*[:：][^\]】)）]*[\]】)）]/gi, '')
    .replace(/\s+(?:抖音|快手|公众号)\s*[:：].*$/i, '')
    .replace(/\s+/g, ' ').trim();
}

function stripTrack(value: string, paired: boolean): string {
  let result = value.replace(/^(?:(?:CD|DISC)\s*\d+\s*[-_. ]\s*)?(?:\d{1,3}[.、)]\s*|(?:track|曲目)\s*\d+\s*[-_. ]\s*)(?=\D)/i, '');
  // A bare numeric prefix is ambiguous (e.g. “21 Guns”); strip only in a paired filename.
  if (paired) result = result.replace(/^\d{1,2}\s+(?=\D)/, '');
  return result.trim();
}

function usableTitle(value: string): string { return GARBAGE_TITLE.test(value) ? '' : value; }

export function extractCandidates(filePath: string, tags?: { artist?: string; title?: string }): Candidate[] {
  const artist = cleanFilenameNoise(tags?.artist || '');
  const title = cleanFilenameNoise(tags?.title || '');
  if (artist && title && !GARBAGE_ARTIST.test(artist) && (!GARBAGE_TITLE.test(title) || /^\d+$/.test(title))) {
    return [{ artist, title }];
  }
  const filename = cleanFilenameNoise(filePath.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, ''));
  // Underscores within artist names remain intact; a spaced underscore is a separator.
  const split = filename.match(/^(.+?)(?:\s+[-–—_]\s+|\s*[–—]\s*)(.+)$/)
    || filename.match(/^(.+?)\s*-\s*(.+)$/);
  if (split) {
    const a = stripTrack(split[1], true), b = stripTrack(split[2], false);
    const candidates = [{ artist: a, title: usableTitle(b) }, { artist: b, title: usableTitle(a) }]
      .filter(c => c.artist && c.title);
    if (candidates.length) return candidates.filter((c, i) => !i || c.artist !== candidates[0].artist || c.title !== candidates[0].title);
  }
  const fallback = usableTitle(stripTrack(usableTitle(title) || filename, false));
  return [{ artist: GARBAGE_ARTIST.test(artist) ? '' : artist, title: fallback }];
}

export function extractCandidate(filePath: string, tags?: { artist?: string; title?: string }): Candidate {
  return extractCandidates(filePath, tags)[0];
}
