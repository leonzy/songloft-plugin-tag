import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function harness(scrape) {
  const routes = new Map();
  const source = readFileSync(new URL('../src/manual-scrape.ts', import.meta.url), 'utf8');
  const context = vm.createContext({ exports: {}, Error, Set,
    require: name => name === './scraper' ? { doScrape: scrape }
      : name === './sources' ? { loadConfig: async () => ({ score_threshold: 0.8 }) }
        : { jsonResponse: (data, statusCode = 200) => ({ statusCode, body: JSON.stringify(data) }) },
  });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.exports.registerManualScrapeRoutes({ post: (path, handler) => routes.set(path, handler) });
  return id => routes.get('/scrape/prepare/:id')({}, { id: String(id) });
}

test('prepare calls read-only engine and returns result without auto-save', async () => {
  const preview = { songId: 42, title: 'match', score: 0.49 };
  const run = harness(async (id, cfg, opts) => {
    assert.equal(id, 42); assert.equal(cfg.score_threshold, 0.8); assert.equal(opts.skipCache, true);
    assert.equal(opts.allowLowScore, true);
    return preview;
  });
  const response = await run(42);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { result: { ...preview, score_threshold: 0.8, below_threshold: true, diagnostics: [] } });
});

test('failed scrape preserves source reasons and removes credentials', async () => {
  const run = harness(async (_id, _cfg, opts) => {
    opts.onDiagnostic('netease: HTTP 503 https://api.test/search?token=secret');
    return null;
  });
  const response = await run(42);
  assert.equal(response.statusCode, 422);
  assert.match(response.body, /HTTP 503/);
  assert.doesNotMatch(response.body, /secret|api.test/);
});

test('unexpected provider failure is visible instead of a false success', async () => {
  const response = await harness(async () => { throw new Error('request timed out'); })(42);
  assert.equal(response.statusCode, 502);
  assert.match(response.body, /request timed out/);
});

test('invalid song IDs never invoke a scraper', async () => {
  const run = harness(() => assert.fail('must not scrape'));
  assert.equal((await run('42oops')).statusCode, 400);
});
