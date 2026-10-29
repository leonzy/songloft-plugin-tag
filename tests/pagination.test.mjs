import assert from 'node:assert/strict';
import test from 'node:test';
import {browserHarness} from './browser-harness.mjs';

test('a 70518-song library loads and renders only one page and one directory level',async t=>{
 const h=browserHarness();t.after(h.close);await h.w.loadSongs();
 const w=h.w;
 assert.equal(w.S._total,70518);assert.equal(w.S._allSongs.length,100);
 assert.equal(w.document.querySelectorAll('#songList .song-card').length,100);
 assert.ok(w.document.querySelectorAll('#treeContainer .b-tn').length<=101);
 assert.equal(h.calls.filter(c=>c.url.pathname.endsWith('/browse')).length,1);
 assert.ok(h.calls.every(c=>!c.url.pathname.endsWith('/songs')));
 assert.match(w.document.getElementById('browsePager').textContent,/706/);
 w.S._page=1;await w.loadSongs();assert.equal(w.S.songs[0].id,101);assert.equal(w.S.songs.length,100);
 w.S._curPath='album-4';w.S._page=0;await w.loadSongs();
 assert.equal(w.S._allSongs.length,35);assert.equal(w.S._total,35);
 assert.equal(h.calls.filter(c=>c.url.pathname.endsWith('/browse')).at(-1).url.searchParams.get('path'),'album-4');
});
test('a late response cannot replace a newer page',async t=>{
 let release;let first=true;
 const h=browserHarness(async url=>{
  if(url.pathname.endsWith('/browse')&&first){first=false;return new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({songs:[{id:1,type:'local'}],total:70518,folders:[]})})})}
 });t.after(h.close);
 const old=h.w.loadSongs();await new Promise(setImmediate);
 h.w.S._page=1;await h.w.loadSongs();release();await old;
 assert.equal(h.w.S.songs[0].id,101);
});
test('select-all selects the current page and selected metadata survives page changes',async t=>{
 const h=browserHarness();t.after(h.close);const w=h.w;await w.loadSongs();w.selAll();assert.equal(w.S.sel.size,100);
 w.S._page=1;await w.loadSongs();assert.equal(w.S.songs.length,100);assert.equal(w.findSong(1).id,1);
 w.tgl(101);assert.equal(w.S.sel.size,101);
 for(let page=2;page<8;page++){w.S._page=page;await w.loadSongs();assert.equal(w.S.songs.length,100)}
 assert.ok(w.S._songCache.size<=500);assert.equal(w.findSong(1).id,1);
 w.selNone();assert.equal(w.S.sel.size,0);
});
test('failed requests preserve the previous page instead of displaying partial data',async t=>{
 let fail=false;const h=browserHarness(url=>{if(fail&&url.pathname.endsWith('/browse'))return {ok:false,status:500}});t.after(h.close);
 await h.w.loadSongs();const previous=h.w.S.songs;fail=true;h.w.S._page=1;await h.w.loadSongs();assert.equal(h.w.S.songs,previous);
 assert.match(h.w.document.getElementById('barInfo').textContent,/加载失败/);
});
test('review and organize views also keep their song DOM bounded',async t=>{
 const h=browserHarness();t.after(h.close);const w=h.w;
 w.S._tab='failed';w.S._triage='red';await w.renderReview();assert.equal(w.S._reviewSongs.length,1);
 assert.equal(w.document.getElementById('tr-cnt').textContent,'1');
 w.S._tab='organize';await w.loadOrgSongs();assert.ok(w.document.querySelectorAll('#orgList .song-card').length<=100);
});
