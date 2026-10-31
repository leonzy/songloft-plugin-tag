import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(name, dependencies = {}, globals = {}) {
  const context = vm.createContext({ exports: {}, Error, ...globals, require: name => dependencies[name] || {} });
  vm.runInContext(ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const scoring = load('scoring');
const conflicts = load('fingerprint-match', { './scoring': scoring });
const original = { artist: '孙楠', title: '风往北吹' };
const wrong = { artist: 'Connirae Andreas, PH.D.', title: 'Track 16', album: 'Advanced Language Patterns', score: 0.99, source: 'acoustid' };

test('fingerprint confidence cannot override complete disagreement with known labels', () => {
  assert.equal(conflicts.fingerprintConflicts([original], wrong), true);
  assert.equal(conflicts.fingerprintConflicts([original], original), false);
  assert.equal(conflicts.fingerprintConflicts([{ artist: '', title: '' }], wrong), false);
});

async function run({ manual = true, cached = null } = {}) {
  const reasons = []; let textQueries = 0, writes = 0;
  const scraper = load('scraper', {
    './fingerprint-match': conflicts, './scoring': scoring, './scrape-diagnostics': load('scrape-diagnostics'),
    './sources': { extractCandidates: () => [original], searchAcoustid: async () => [wrong],
      searchQQMusic: async () => { textQueries++; return [{ ...original, source: 'qqmusic', score: 0 }]; },
      enrichFromChineseSources: () => assert.fail('conflicting fingerprint must not be enriched') },
    './t2s': { toSimplified: s => s }, './cache': { cacheGet: async () => cached, cacheSet: async () => { writes++; } },
    './ratelimit': { rateLimitWait: async () => {} }, './circuit': { circuitIsOpen: () => false, circuitFailure() {}, circuitSuccess() {} },
  }, { songloft: { songs: { getById: async () => ({ type: 'local', fingerprint: 'test', duration: 292 }) }, log: { info() {}, warn() {} } } });
  const result = await scraper.doScrape(42, { enable_acoustid: true, enable_qqmusic: true, qqmusic_api_url: 'https://example.test', score_threshold: 0.7 },
    { allowLowScore: manual, onDiagnostic: s => reasons.push(s) });
  return { result, reasons, textQueries, writes };
}

test('manual conflict previews continue text search and disclose both sides, without caching', async () => {
  const { result, reasons, textQueries, writes } = await run();
  assert.equal(result.title, original.title); assert.equal(result.source, 'qqmusic');
  assert.equal(textQueries, 1); assert.equal(writes, 0);
  assert.match(reasons.join('\n'), /指纹相似度 99.*Track 16.*不是标签正确率/);
});

test('automatic scraping abstains on strong fingerprint/text conflicts even with high text score', async () => {
  const { result, writes } = await run({ manual: false });
  assert.equal(result, null); assert.equal(writes, 0);
});

test('old high-score conflicting AcoustID caches are bypassed', async () => {
  const { result, textQueries } = await run({ cached: wrong });
  assert.equal(result.title, original.title); assert.equal(textQueries, 1);
});
