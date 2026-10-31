import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function harness({ title = '', fingerprint = 'audio-fingerprint', matches = [] } = {}) {
  const calls = { lookup: 0, cache: 0, text: 0, reasons: [] };
  const source = readFileSync(new URL('../src/scraper.ts', import.meta.url), 'utf8');
  const context = vm.createContext({ exports: {},
    songloft: { songs: { getById: async () => ({ type: 'local', fingerprint, duration: 123 }) },
      log: { info() {}, warn() {} } },
    require: name => ({
      './sources': {
        extractCandidates: () => [{ artist: '', title }],
        searchAcoustid: async (fp, duration) => {
          calls.lookup++; assert.equal(fp, fingerprint); assert.equal(duration, 123); return matches;
        },
        enrichFromChineseSources: async (_artist, _title, candidate) => {
          assert.equal(candidate.title, 'Identified song'); return {};
        },
        searchNetease: async () => { calls.text++; return []; },
      },
      './t2s': { toSimplified: value => value },
      './fingerprint-match': { fingerprintConflicts: () => false },
      './cache': { cacheGet: async () => { calls.cache++; return null; },
        cacheSet: async () => { calls.cache++; } },
      './ratelimit': { rateLimitWait: async () => {} },
      './circuit': { circuitIsOpen: () => false, circuitSuccess() {}, circuitFailure() {} },
    }[name] || {}),
  });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, context);
  return { calls, run: () => context.exports.doScrape(42,
    { enable_acoustid: true, acoustid_api_key: 'test', score_threshold: 0.7, enable_netease: true },
    { onDiagnostic: reason => calls.reasons.push(reason) }) };
}

const match = { artist: 'Identified artist', title: 'Identified song', album: 'Album', source: 'acoustid', score: 0.95 };

test('fingerprint identifies a song without any textual keyword, without empty-key caching', async () => {
  const { run, calls } = harness({ matches: [match] });
  const result = await run();
  assert.equal(result.title, match.title);
  assert.equal(calls.lookup, 1);
  assert.equal(calls.cache, 0);
  assert.equal(calls.text, 0);
});

test('unrecognized untitled audio reports failure after attempting fingerprint', async () => {
  const { run, calls } = harness();
  assert.equal(await run(), null);
  assert.equal(calls.lookup, 1);
  assert.equal(calls.cache, 0);
  assert.equal(calls.text, 0);
  assert.match(calls.reasons.join(' '), /音频指纹未能识别.*搜索关键词/);
});

test('missing fingerprint and missing keywords report both prerequisites', async () => {
  const { run, calls } = harness({ fingerprint: '' });
  assert.equal(await run(), null);
  assert.equal(calls.lookup, 0);
  assert.match(calls.reasons.join(' '), /尚无音频指纹/);
  assert.match(calls.reasons.join(' '), /搜索关键词/);
});

test('named songs retain fingerprint recognition and keyword cache behavior', async () => {
  const { run, calls } = harness({ title: 'Original title', matches: [match] });
  assert.equal((await run()).title, match.title);
  assert.equal(calls.lookup, 1);
  assert.equal(calls.cache, 2);
});
