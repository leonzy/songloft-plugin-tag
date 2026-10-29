/// <reference types="@songloft/plugin-sdk" />
import { createRouter, jsonResponse } from '@songloft/plugin-sdk';

const PAGE_SIZE = 100;
type Row = Record<string, any>;
const directoryCache = new Map<string, { at: number; value: any }>();
export function clearBrowseCache() { directoryCache.clear(); }
async function directoryPage(path: string) {
  const cached = directoryCache.get(path);
  if (cached && Date.now() - cached.at < 30000) return cached.value;
  const value = await hostJSON(`/api/v1/songs/folders?path=${encodeURIComponent(path)}`);
  // Avoid retaining large legacy-host direct-song responses in memory.
  if ((value.songs || []).length <= 200) {
    if (directoryCache.size >= 16) directoryCache.delete(directoryCache.keys().next().value!);
    directoryCache.set(path, { at: Date.now(), value });
  }
  return value;
}
function pageOptions(query: string) {
  const q = new URLSearchParams(query || '');
  const number = (key: string, fallback: number) => {
    const value = Number(q.get(key));
    return q.has(key) && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
  };
  return { q, offset: number('offset', 0), limit: Math.max(1, Math.min(PAGE_SIZE, number('limit', PAGE_SIZE))) };
}
async function hostJSON(path: string): Promise<any> {
  const [host, token] = await Promise.all([songloft.plugin.getHostUrl(), songloft.plugin.getToken()]);
  const response = await fetch(`${host}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`宿主目录接口 HTTP ${response.status}`);
  return response.json();
}
async function songPage(type: string, keyword: string, offset: number, limit: number) {
  return hostJSON(`/api/v1/songs?type=${encodeURIComponent(type)}&keyword=${encodeURIComponent(keyword)}&offset=${offset}&limit=${limit}`);
}
async function displaySongs(rows: Row[]) {
  const token = await songloft.plugin.getToken();
  return rows.map(s => {
    let cover = String(s.cover_url || '');
    if (cover && !/^https?:\/\//.test(cover)) cover += `${cover.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
    return { id: s.id, type: s.type, title: s.title || '', artist: s.artist || '', album: s.album || '',
      file_path: s.file_path || '', format: s.format || '', duration: s.duration || 0, cover_url: cover,
      has_lyrics: !!s.lyric_url, genre: s.genre || '', year: s.year || '', track: s.track || '' };
  });
}
function arrayValue(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw) { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch {} }
  return [];
}
async function reviewIndex(keyword = '') {
  const [idsResult, failedRaw, scrapedRaw] = await Promise.all([
    hostJSON(`/api/v1/songs/ids?type=local&keyword=${encodeURIComponent(keyword)}`),
    songloft.storage.get('failed_songs'), songloft.storage.get('scraped_done'),
  ]);
  const ids: number[] = arrayValue(Array.isArray(idsResult) ? idsResult : idsResult.ids).map(Number);
  const failed = new Set(arrayValue(failedRaw).map(v => Number(v.id)));
  const scraped = new Set(arrayValue(scrapedRaw).map(Number));
  const groups = { green: [] as number[], yellow: [] as number[], red: [] as number[] };
  for (const id of ids) groups[failed.has(id) ? 'red' : scraped.has(id) ? 'green' : 'yellow'].push(id);
  return groups;
}

export function registerBrowseRoutes(router: ReturnType<typeof createRouter>) {
  // Browser state and response size stay bounded; only the selected directory/page is loaded.
  router.get('/browse', async req => {
    try {
      const { q, offset, limit } = pageOptions(req.query || '');
      const path = q.get('path') || '', keyword = q.get('q') || '', remote = q.get('view') === 'remote';
      let rows: Row[] = [], total = 0, folders: Row[] = [], musicPath = '';
      if (remote) {
        const [r, radio] = await Promise.all([songPage('remote', keyword, 0, 1), songPage('radio', keyword, 0, 1)]);
        const remoteCount = Number(r.total || 0), radioCount = Number(radio.total || 0);
        if (offset < remoteCount) {
          const page = await songPage('remote', keyword, offset, limit); rows = page.songs || [];
        }
        if (rows.length < limit && offset + limit > remoteCount) {
          const page = await songPage('radio', keyword, Math.max(0, offset - remoteCount), limit - rows.length);
          rows = rows.concat(page.songs || []);
        }
        total = remoteCount + radioCount;
      } else {
        if (!path || keyword) {
          const [directory, page] = await Promise.all([directoryPage(path), songPage('local', keyword, offset, limit)]);
          folders = directory.folders || []; musicPath = directory.music_path || '';
          rows = page.songs || []; total = Number(page.total || 0);
        } else {
          const directory = await directoryPage(path);
          folders = directory.folders || []; musicPath = directory.music_path || '';
          const direct = directory.songs || [];
          total = Number(directory.total_songs ?? direct.length); rows = direct.slice(offset, offset + limit);
        }
      }
      return jsonResponse({ songs: await displaySongs(rows.slice(0, limit)), folders, music_path: musicPath, total, offset, limit, path });
    } catch (e: any) { return jsonResponse({ error: e.message || String(e) }, 500); }
  });
  router.get('/browse/stats', async () => {
    try {
      const groups = await reviewIndex();
      return jsonResponse({ total: groups.green.length + groups.yellow.length + groups.red.length,
        green: groups.green.length, yellow: groups.yellow.length, red: groups.red.length });
    } catch (e: any) { return jsonResponse({ error: e.message || String(e) }, 500); }
  });
  router.get('/browse/review', async req => {
    try {
      const { q, offset, limit } = pageOptions(req.query || '');
      const groups = await reviewIndex(q.get('q') || '');
      const kind = q.get('kind') || 'green';
      const ids = groups[kind as keyof typeof groups] || groups.green;
      const page = ids.slice(offset, offset + limit);
      const result = page.length ? await hostJSON(`/api/v1/songs/batch?ids=${page.join(',')}`) : { songs: [] };
      const rows: Row[] = Array.isArray(result) ? result : result.songs || [];
      const byID = new Map(rows.map(row => [Number(row.id), row]));
      const ordered = page.map(id => byID.get(id)).filter(Boolean) as Row[];
      return jsonResponse({ songs: await displaySongs(ordered), total: ids.length, offset, limit,
        counts: { green: groups.green.length, yellow: groups.yellow.length, red: groups.red.length } });
    } catch (e: any) { return jsonResponse({ error: e.message || String(e) }, 500); }
  });
}
