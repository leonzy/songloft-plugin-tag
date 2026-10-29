import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=readFileSync(new URL('../static/index.html',import.meta.url),'utf8');
const loader=html.slice(html.indexOf('async function loadSongs()'),html.indexOf('function doSearch()'));
test('directory loading preserves every song across multiple pages',async()=>{
 const songs=Array.from({length:2503},(_,i)=>({id:i+1,type:i===2502?'remote':'local',file_path:`music/album/song${i}.flac`}));
 const calls=[],label={},context=vm.createContext({S:{},E:()=>label,render(){},log(message){throw new Error(message)},af:async url=>{
 calls.push(url);const query=new URL('http://test/'+url).searchParams;const offset=Number(query.get('offset')),limit=Number(query.get('limit'));
 return {ok:true,json:async()=>({songs:songs.slice(offset,offset+limit)})};
 }});
 vm.runInContext(loader,context);await vm.runInContext('loadSongs()',context);
 assert.equal(context.S._allSongs.length,2502);assert.equal(context.S._remoteSongs.length,1);
 assert.equal(new Set(context.S._allSongs.map(s=>s.id)).size,2502);
 assert.deepEqual(calls,['./songs?limit=1000&offset=0','./songs?limit=1000&offset=1000','./songs?limit=1000&offset=2000']);
});
test('failed page keeps the previous complete list',async()=>{
 const previous=[{id:99}],errors=[];
 const context=vm.createContext({S:{_allSongs:previous},E:()=>({}),render(){},log:message=>errors.push(message),af:async()=>({ok:false,status:500})});
 vm.runInContext(loader,context);await vm.runInContext('loadSongs()',context);
 assert.equal(context.S._allSongs,previous);assert.match(errors[0],/HTTP 500/);
});
