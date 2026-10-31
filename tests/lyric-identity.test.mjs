import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(name, dependencies = {}, globals = {}) {
  const context = vm.createContext({ exports: {}, Error, ...globals, require: key => dependencies[key] || {} });
  const source = name === 'sources' && process.env.TAG_SOURCES_REV
    ? execFileSync('git', ['show', process.env.TAG_SOURCES_REV + ':src/sources.ts'], { encoding: 'utf8' })
    : readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const t2s = load('t2s');
function fixture({ title = '错', header = '错' } = {}) {
  const calls = [];
  const api = load('sources', { './t2s': t2s, './scoring': { scoreMatch: () => 0.42 },
    './ratelimit': { rateLimitWait: async () => {} },
    './circuit': { circuitIsOpen: () => false, circuitSuccess() {}, circuitFailure() {} } }, {
    songloft: { log: { warn() {}, info() {} } },
    fetch: async url => {
      calls.push(url);
      const data = url.includes('music.163.com') ? { lrc: { lyric: `[ti:${header}]\n[ar:崔健]\n[00:01.00]fixture` } }
        : { result: { songs: [{ id: 1, name: title, ar: [{ name: '崔健' }], al: { name: '一无所有' } }] } };
      return { ok: true, json: async () => data };
    },
  });
  return { api, calls };
}
const wanted = { artist: '崔健', title: '一无所有' };
const cfg = { enable_netease: true, netease_api_url: 'https://example.com/search' };

test('enrichment never borrows a different track just because its performer or album matches', async () => {
  const { api, calls } = fixture();
  const result = await api.enrichFromChineseSources(wanted.artist, wanted.title, wanted, cfg);
  assert.equal(result.lyrics || '', '');
  assert.equal(calls.length, 1);
});
test('enrichment rejects an explicitly conflicting downloaded LRC title', async () => {
  const { api } = fixture({ title: wanted.title, header: '错' });
  const result = await api.enrichFromChineseSources(wanted.artist, wanted.title, wanted, cfg);
  assert.equal(result.lyrics, '');
});
test('enrichment still accepts the correct song and traditional lyric headers', async () => {
  const { api } = fixture({ title: wanted.title, header: '一無所有' });
  const result = await api.enrichFromChineseSources(wanted.artist, wanted.title, wanted, cfg);
  assert.ok(result.lyrics);
});
test('complete artist and title identities prevent same-title or substring confusion', () => {
  const { api } = fixture();
  assert.equal(api.sameLyricSong(wanted, { artist: '其他歌手', title: wanted.title }), false);
  assert.equal(api.sameLyricSong({ artist: '李娜', title: '同名歌' }, { artist: '李娜娜', title: '同名歌' }), false);
  assert.equal(api.lyricsIdentityMatches('[ti:错]\n[ar:崔健]', wanted), false);
});
