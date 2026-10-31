import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function sources(fetch) {
  const context = vm.createContext({ exports: {}, fetch, encodeURIComponent, require: () => ({}),
    songloft: { log: { warn() {}, info() {} } } });
  vm.runInContext(ts.transpileModule(readFileSync(new URL('../src/sources.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}

test('Migu copyright status and service song ID are never published as year or track', async () => {
  const api = sources(async url => {
    assert.match(decodeURIComponent(url), /text=宋祖英 浏阳河/);
    return { ok: true, json: async () => ({ songResultData: { result: [{ name: '浏阳河', singers: [{ name: '宋祖英' }], copyright: '1', songId: '600000123' }] } }) };
  });
  const [result] = await api.searchMiGu('宋祖英 浏阳河');
  assert.equal(result.artist, '宋祖英');
  assert.equal(result.title, '浏阳河');
  assert.equal(result.year, '');
  assert.equal(result.track, '');
});

test('Kugou chapter metadata is never mistaken for a release year', async () => {
  const api = sources(async () => ({ ok: true, json: async () => ({ data: { lists: [{ SongName: 'Song', SingerName: 'Artist', Chapter: '1' }] } }) }));
  const [result] = await api.searchKuGou('Song', 'https://example.test/search');
  assert.equal(result.year, '');
});

test('Migu absolute cover URLs are not prefixed with the host a second time', async () => {
  const api = sources(async () => ({ ok: true, json: async () => ({ songResultData: { result: [
    { name: 'Song', imgItems: [{ img: 'https://d.musicapp.migu.cn/cover.jpg' }] },
    { name: 'Song', imgItems: [{ img: '/cover.jpg' }] },
    { name: 'Song', imgItems: [{ img: '//d.musicapp.migu.cn/cover.jpg' }] },
  ] } }) }));
  const result = await api.searchMiGu('Song');
  assert.ok(result.every(s => s.cover_url === 'https://d.musicapp.migu.cn/cover.jpg'));
});
