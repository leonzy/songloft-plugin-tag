import type { SearchResult } from './sources';

const MODERN_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const SERVICE = 'music.search.SearchCgiService';

function checkCode(data: any, label: string): void {
  if (data?.code !== undefined && String(data.code) !== '0' && String(data.code) !== '200') {
    // Do not echo arbitrary upstream messages: they may contain configured secrets.
    const code = String(data.code).replace(/[^\w-]/g, '').slice(0, 24);
    throw new Error(`QQ音乐${label}业务错误码 ${code}，不是“无匹配结果”`);
  }
}

/** Preserve configured authentication/query parameters, replacing only search parameters. */
function searchUrl(apiUrl: string, keyword: string): string {
  const [base, query = ''] = apiUrl.split('#')[0].split('?');
  const retained = query.split('&').filter(p => p && !/^(?:w|format|n)=/.test(p));
  return base + '?' + [...retained, `w=${encodeURIComponent(keyword)}`, 'format=json', 'n=10'].join('&');
}

export async function searchQQ(keyword: string, apiUrl: string, request: (url: string, init?: any) => Promise<any>): Promise<SearchResult[]> {
  // Only migrate the known official legacy search routes; custom service URLs stay untouched.
  const legacy = /^https?:\/\/c\.y\.qq\.com\/soso\/fcgi-bin\/(?:search_for_qq_cp|client_search_cp)(?:[?#]|$)/i.test(apiUrl);
  const modern = /^https?:\/\/u\.y\.qq\.com\/cgi-bin\/musicu\.fcg(?:[?#]|$)/i.test(apiUrl);
  const headers = { Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json' };
  let data: any;
  try {
    const resp = await request(legacy ? MODERN_URL : modern ? apiUrl : searchUrl(apiUrl, keyword),
      modern || legacy ? { method: 'POST', headers, body: JSON.stringify({
        comm: { ct: 19, cv: 1859, uin: 0 },
        search: { module: SERVICE, method: 'DoSearchForQQMusicDesktop', param: {
          search_type: 0, query: keyword, page_num: 1, num_per_page: 10,
        } },
      }) } : { headers });
    data = await resp.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('QQ音乐响应不是有效 JSON，请检查 API 地址');
    throw error;
  }
  checkCode(data, '');
  const envelope = data?.search || data?.[SERVICE] || data?.req_0;
  if (envelope) checkCode(envelope, '搜索');
  const payload = envelope?.data || data?.data || data;
  checkCode(payload, '数据');
  const songs = payload?.body?.song?.list ?? payload?.song?.list ?? payload?.list;
  if (!Array.isArray(songs)) throw new Error('QQ音乐响应缺少歌曲列表，API 响应格式不兼容');
  return songs.map((s: any) => ({
    artist: (s.singer || []).map((a: any) => a.name).filter(Boolean).join(' / '),
    title: s.name || s.songname || '', album: s.album?.name || s.albumname || '',
    cover_url: (s.album?.mid || s.albummid) ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${s.album?.mid || s.albummid}.jpg` : undefined,
    sourceId: s.mid || s.songmid || undefined,
    duration: Number(s.interval) > 0 ? Number(s.interval) : undefined,
    genre: '', year: s.time_public?.slice(0, 4) || '', track: s.index_album ? String(s.index_album) : s.index ? String(s.index) : '',
    score: 0, source: 'qqmusic',
  })).filter((s: SearchResult) => s.artist && s.title);
}
