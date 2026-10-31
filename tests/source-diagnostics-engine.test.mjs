import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function module(name, dependencies = {}, globals = {}) {
  const context = vm.createContext({ exports: {}, Error, ...globals, require: name => dependencies[name] || {} });
  vm.runInContext(ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}

async function run(qq, allowLowScore = false) {
  const queries = [], reasons = [];
  const scraper = module('scraper', {
    './sources': { ...module('candidates'), searchQQMusic: async kw => { queries.push(kw); return qq(kw); },
      searchMiGu: async () => [{ artist: 'Different artist', title: 'Different song', source: 'migu' }] },
    './scoring': { scoreMatch: () => 0.26 },
    './t2s': { toSimplified: s => s },
    './cache': { cacheSet: async () => {} },
    './ratelimit': { rateLimitWait: async () => {} },
    './circuit': { circuitIsOpen: () => false, circuitSuccess() {}, circuitFailure() {} },
    './scrape-diagnostics': module('scrape-diagnostics'),
  }, { songloft: { songs: { getById: async () => ({ type: 'local', file_path: '07.Arnica Montana _ Sea, Sand And Sun.wav' }) }, log: { info() {}, warn() {} } } });
  const result = await scraper.doScrape(42, { enable_qqmusic: true, qqmusic_api_url: 'https://example.test', enable_migu: true, score_threshold: 0.7 },
    { skipCache: true, allowLowScore, onDiagnostic: r => reasons.push(r) });
  if (!allowLowScore) assert.equal(result, null);
  return { queries, reasons, result };
}

test('engine reports QQ failure and Migu score on separate lines across reversed queries', async () => {
  const { queries, reasons } = await run(() => { throw new Error('QQ音乐业务错误码 500001'); });
  assert.equal(queries[0], 'Arnica Montana Sea, Sand And Sun');
  assert.equal(queries.length, 2);
  assert.equal(reasons.filter(s => s.startsWith('QQ音乐：')).length, 1);
  assert.match(reasons.join('\n'), /QQ音乐：接口失败.*500001/);
  assert.match(reasons.join('\n'), /咪咕：候选最高得分 0.26，低于阈值 0.70/);
  assert.match(reasons.join('\n'), /最佳候选来自咪咕/);
});

test('manual preview returns low-score candidates while automatic scraping still rejects them', async () => {
  const { result } = await run(() => [], true);
  assert.equal(result.score, 0.26);
  assert.equal(result.source, 'migu');
  assert.equal((await run(() => [])).result, null);
});

test('QQ business error 2001 retries once with title while preserving diagnostics', async () => {
  const { queries, reasons } = await run(kw => {
    if (kw.includes('Arnica Montana ') || kw.startsWith('Sea, Sand And Sun ')) throw new Error('QQ音乐搜索业务错误码 2001');
    return [];
  });
  assert.deepEqual(queries.slice(0, 2), ['Arnica Montana Sea, Sand And Sun', 'Sea, Sand And Sun']);
  assert.ok(reasons.some(r => r.includes('已改用歌名重试')));
});

test('engine distinguishes an empty successful QQ search from low-scoring Migu candidates', async () => {
  const { reasons } = await run(() => []);
  assert.ok(reasons.includes('QQ音乐：搜索成功，但没有候选歌曲'));
  assert.ok(reasons.some(r => r.startsWith('咪咕：候选最高得分')));
  assert.ok(!reasons.some(r => r.includes('接口失败')));
});
