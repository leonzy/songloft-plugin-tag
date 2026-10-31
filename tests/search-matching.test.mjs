import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(name) {
  const context = vm.createContext({ exports: {}, Error, SyntaxError, Number, String });
  vm.runInContext(ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const { extractCandidates } = load('candidates');
const { scoreMatch } = load('scoring');
const { searchQQ } = load('qq-search');
const { formatSourceDiagnostic } = load('scrape-diagnostics');
const candidates = (path, tags) => JSON.parse(JSON.stringify(extractCandidates(path, tags)));

test('reported filename splits track number, spaced underscore, artist and title', () => {
  assert.deepEqual(candidates('/music/07.Arnica Montana _ Sea, Sand And Sun.wav'), [
    { artist: 'Arnica Montana', title: 'Sea, Sand And Sun' },
    { artist: 'Sea, Sand And Sun', title: 'Arnica Montana' },
  ]);
});

test('promotional artist tags cannot override the artist and title in the reported filename', () => {
  assert.deepEqual(candidates('058.宋祖英-浏阳河【玄音Music 无损音质】.flac', {
    title: '宋祖英-浏阳河', artist: '惠普正版车载音乐',
  })[0], { artist: '宋祖英', title: '浏阳河' });
});
test('download promotion and track numbers are removed without damaging artist underscores', () => {
  assert.deepEqual(candidates('08 Candy_Wind - 青空[抖音：小G音乐][FLAC].flac')[0], { artist: 'Candy_Wind', title: '青空' });
  assert.deepEqual(candidates('221小伙伴 - 遥远的你 (正式版) 抖音：小G音乐.mp3')[0], { artist: '221小伙伴', title: '遥远的你 (正式版)' });
});
test('versions, meaningful numbers and hyphens are preserved', () => {
  assert.equal(candidates('AC-DC - Thunderstruck (Live).flac')[0].artist, 'AC-DC');
  assert.equal(candidates('Artist — Song (Remix).mp3')[0].title, 'Song (Remix)');
  assert.equal(candidates('21 Guns.mp3')[0].title, '21 Guns');
  assert.equal(candidates('1984.mp3', { artist: 'Artist', title: '1984' })[0].title, '1984');
});
test('valid tags take priority, garbage tags fall back to the filename, title-only tags work', () => {
  assert.deepEqual(candidates('wrong-file.mp3', { artist: 'Queen', title: 'Bohemian Rhapsody' }), [{ artist: 'Queen', title: 'Bohemian Rhapsody' }]);
  assert.equal(candidates('Sea And Sun.wav', { artist: 'Unknown', title: 'Track 01' })[0].title, 'Sea And Sun');
  assert.equal(candidates('', { title: 'Sea And Sun' })[0].title, 'Sea And Sun');
  assert.equal(candidates('Track 01.wav')[0].title, '');
});
test('missing artist no longer caps an exact title match below the configured threshold', () => {
  assert.equal(scoreMatch({ artist: '', title: '晴天' }, { artist: '周杰伦', title: '晴天', source: 'qqmusic' }), 0.95);
  assert.equal(scoreMatch({ artist: '', title: '' }, { artist: '周杰伦', title: '晴天', source: 'qqmusic' }), 0);
});
test('artist mismatch and duration mismatch still reduce the score', () => {
  const result = { artist: 'Correct artist', title: 'Exact title', source: 'qqmusic', duration: 300 };
  const exact = scoreMatch({ artist: result.artist, title: result.title, duration: 300 }, result);
  assert.ok(scoreMatch({ artist: 'Other person', title: result.title, duration: 300 }, result) < exact);
  assert.ok(scoreMatch({ artist: result.artist, title: result.title, duration: 100 }, result) < exact);
});

test('known legacy QQ URL uses the verified modern search protocol and response fields', async () => {
  const result = await searchQQ('周杰伦 晴天', 'https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp', async (url, init) => {
    assert.equal(url, 'https://u.y.qq.com/cgi-bin/musicu.fcg');
    assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body);
    assert.equal(body.search.param.query, '周杰伦 晴天');
    return { json: async () => ({ code: 0, search: { code: 0, data: { body: { song: { list: [
      { name: '晴天', singer: [{ name: '周杰伦' }], album: { name: '叶惠美', mid: 'album-mid' }, mid: 'song-mid', interval: 269 },
    ] } } } } }) };
  });
  assert.equal(result[0].title, '晴天'); assert.equal(result[0].artist, '周杰伦');
  assert.equal(result[0].album, '叶惠美'); assert.equal(result[0].duration, 269); assert.equal(result[0].sourceId, 'song-mid');
});
test('custom QQ URLs retain authentication parameters and support the legacy result structure', async () => {
  const result = await searchQQ('test song', 'https://api.example/search?key=example&w=old', async (url, init) => {
    assert.match(url, /key=example/); assert.match(url, /w=test%20song/); assert.doesNotMatch(url, /w=old|\?[^?]*\?/);
    assert.equal(init.method, undefined);
    return { json: async () => ({ code: 0, data: { song: { list: [{ singer: [{ name: 'Artist' }], songname: 'Song', albumname: 'Album' }] } } }) };
  });
  assert.equal(result[0].album, 'Album');
});
test('QQ HTTP-success business errors are reported as errors, not empty search results', async () => {
  await assert.rejects(searchQQ('song', 'https://api.example/search', async () => ({ json: async () => ({ code: 500001 }) })), /业务错误码 500001/);
  await assert.rejects(searchQQ('song', 'https://u.y.qq.com/cgi-bin/musicu.fcg', async () => ({ json: async () => ({ code: 0, search: { code: 2000 } }) })), /搜索业务错误码 2000/);
});
test('QQ empty lists, invalid JSON and incompatible schemas remain distinguishable', async () => {
  assert.equal((await searchQQ('song', 'https://api.example/search', async () => ({ json: async () => ({ data: { song: { list: [] } } }) }))).length, 0);
  await assert.rejects(searchQQ('song', 'https://api.example/search', async () => ({ json: async () => ({ data: {} }) })), /响应格式不兼容/);
  await assert.rejects(searchQQ('song', 'https://api.example/search', async () => ({ json: async () => { throw new SyntaxError('HTML'); } })), /不是有效 JSON/);
});
test('source-specific diagnostics distinguish failures, no results and low scores', () => {
  assert.match(formatSourceDiagnostic('qqmusic', { count: 0, score: 0, error: '业务错误码 500001' }, 0.7), /QQ音乐：接口失败.*500001/);
  assert.equal(formatSourceDiagnostic('qqmusic', { count: 0, score: 0 }, 0.7), 'QQ音乐：搜索成功，但没有候选歌曲');
  assert.equal(formatSourceDiagnostic('migu', { count: 3, score: 0.26 }, 0.7), '咪咕：候选最高得分 0.26，低于阈值 0.70');
});
