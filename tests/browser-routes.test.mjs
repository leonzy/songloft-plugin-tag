import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../src/browser.ts',import.meta.url),'utf8');
function harness(hostResponse,storage={}) {
 const routes=new Map(),calls=[],router={get:(path,handler)=>routes.set(path,handler)};
 const context=vm.createContext({exports:{},require:()=>({jsonResponse:(data,statusCode=200)=>({statusCode,body:JSON.stringify(data)})}),URLSearchParams,songloft:{plugin:{getHostUrl:async()=>'http://host',getToken:async()=>'test-token'},storage:{get:async key=>storage[key]}},fetch:async input=>{const url=new URL(input);calls.push(url);return {ok:true,json:async()=>hostResponse(url)}}});
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 context.exports.registerBrowseRoutes(router);
 return {calls,clear:()=>context.exports.clearBrowseCache(),request:async(path,query='')=>{const r=await routes.get(path)({query});assert.equal(r.statusCode,200,r.body);return JSON.parse(r.body)}};
}
test('root browsing asks for a bounded song page instead of traversing the library',async()=>{
 const h=harness(url=>url.pathname.endsWith('/folders')?{music_path:'music',folders:[{name:'Album',path:'album',song_count:70518}],songs:[]}:{total:70518,songs:Array.from({length:100},(_,i)=>({id:i+1,type:'local',file_path:`music/album/song${i}.flac`,fingerprint:'x'.repeat(8192)}))});
 const page=await h.request('/browse','limit=100000&offset=0');assert.equal(page.total,70518);assert.equal(page.songs.length,100);assert.equal(page.folders.length,1);assert.ok(!('fingerprint' in page.songs[0]));
 assert.equal(h.calls.find(u=>u.pathname==='/api/v1/songs').searchParams.get('limit'),'100');
});
test('directory pages and search are scoped on the server',async()=>{
 const direct=Array.from({length:350},(_,i)=>({id:i+1,type:'local'}));
 const h=harness(url=>url.pathname.endsWith('/folders')?{music_path:'music',folders:[],songs:direct,total_songs:350}:{songs:[{id:99,type:'local'}],total:1});
 const page=await h.request('/browse','path=Artist%2FAlbum&limit=100&offset=100');assert.equal(page.songs.length,100);assert.equal(page.songs[0].id,101);assert.equal(page.total,350);
 const search=await h.request('/browse','q=music%20%26%20more');assert.equal(search.songs.length,1);assert.equal(h.calls.at(-1).searchParams.get('keyword'),'music & more');
});
test('review reads only one metadata page while retaining whole-library counters',async()=>{
 const h=harness(url=>{
  if(url.pathname.endsWith('/ids'))return Array.from({length:70518},(_,i)=>i+1);
  if(url.pathname.endsWith('/batch'))return {songs:url.searchParams.get('ids').split(',').reverse().map(id=>({id:Number(id),type:'local'}))};
 },{scraped_done:[1,2],failed_songs:JSON.stringify([{id:3}])});
 const page=await h.request('/browse/review','kind=yellow&offset=1000&limit=100');
 assert.equal(page.songs.length,100);assert.equal(page.total,70515);assert.deepEqual(page.counts,{green:2,red:1,yellow:70515});
 assert.equal(page.songs[0].id,1004);assert.equal(h.calls.find(u=>u.pathname.endsWith('/batch')).searchParams.get('ids').split(',').length,100);
});
test('remote and radio pages are complete at their boundary without loading either source in full',async()=>{
 const h=harness(url=>{const remote=url.searchParams.get('type')==='remote',total=remote?120:30,offset=Number(url.searchParams.get('offset')),limit=Number(url.searchParams.get('limit'));return {total,songs:Array.from({length:Math.max(0,Math.min(total-offset,limit))},(_,i)=>({id:(remote?0:120)+offset+i+1,type:remote?'remote':'radio'}))}});
 const page=await h.request('/browse','view=remote&offset=100&limit=100');assert.equal(page.total,150);assert.equal(page.songs.length,50);assert.equal(page.songs[0].id,101);assert.equal(page.songs.at(-1).id,150);
 assert.ok(h.calls.every(u=>Number(u.searchParams.get('limit'))<=100));
});

test('paging reuses a small directory response, and writes can invalidate it',async()=>{
 const h=harness(url=>url.pathname.endsWith('/folders')?{music_path:'music',folders:[],songs:[]}:{total:70518,songs:[]});
 await h.request('/browse','offset=0');await h.request('/browse','offset=100');
 assert.equal(h.calls.filter(u=>u.pathname.endsWith('/folders')).length,1);
 h.clear();await h.request('/browse','offset=200');
 assert.equal(h.calls.filter(u=>u.pathname.endsWith('/folders')).length,2);
});
