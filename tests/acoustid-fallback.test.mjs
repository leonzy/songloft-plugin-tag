import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(fetch) {
  const context = vm.createContext({ exports: {}, Error, fetch, encodeURIComponent,
    require: () => ({}), songloft: { log: { warn() {}, info() {} } } });
  vm.runInContext(ts.transpileModule(readFileSync(new URL('../src/sources.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}

test('AcoustID uses a bounded timeout, makes one failed request and permits text fallback', async () => {
  let requests = 0;
  const reasons = [];
  const sources = load(async (_url, options) => {
    requests++; assert.equal(options.headers['X-Fetch-Timeout-Ms'], '4000');
    throw new Error('request timed out');
  });
  assert.equal((await sources.searchAcoustid('fingerprint', 100, 'test', r => reasons.push(r))).length, 0);
  assert.equal(requests, 1);
  assert.match(reasons.join(' '), /音频指纹.*timed out.*继续文字搜索/);
});

test('AcoustID rejected credentials produce an actionable separate diagnostic', async () => {
  const reasons = [];
  const sources = load(async () => ({ ok: false, status: 400, json: async () => ({ status: 'error', error: { code: 4, message: 'invalid API key' } }) }));
  assert.equal((await sources.searchAcoustid('fingerprint', 100, 'test', r => reasons.push(r))).length, 0);
  assert.match(reasons.join(' '), /应用 API Key 无效.*错误码 4.*Application API Key.*User API Key/);
});

test('AcoustID malformed input errors remain distinct from invalid credentials', async () => {
  const reasons = [];
  const sources = load(async () => ({ ok: false, status: 400, json: async () => ({ status: 'error', error: { code: 3 } }) }));
  await sources.searchAcoustid('fingerprint', 100, 'test', r => reasons.push(r));
  assert.match(reasons.join(' '), /HTTP 400，业务错误码 3/);
  assert.doesNotMatch(reasons.join(' '), /Key 无效/);
});
