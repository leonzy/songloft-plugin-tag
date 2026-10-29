import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
export const html=readFileSync(new URL('../static/index.html',import.meta.url),'utf8');
export function browserHarness(override) {
 const dom=new JSDOM(html,{url:'http://test/api/v1/jsplugin/tag/',runScripts:'outside-only'});
 const w=dom.window,calls=[];
 w.fetch=async (input,options={})=>{
  const url=new URL(input,w.location.href);calls.push({url,options});
  if(override){const result=await override(url,options);if(result)return result}
  let data={};
  if(url.pathname.endsWith('/browse/stats')) data={total:70518,green:2,red:1,yellow:70515};
  else if(url.pathname.endsWith('/browse')){
   const offset=Number(url.searchParams.get('offset')),limit=Number(url.searchParams.get('limit')),path=url.searchParams.get('path');
   const total=path?35:70518;
   data={total,music_path:'music',folders:Array.from({length:path?0:1000},(_,i)=>({name:`Album ${i}`,path:`album-${i}`,song_count:35})),songs:Array.from({length:Math.max(0,Math.min(limit,total-offset))},(_,i)=>({id:offset+i+1,type:'local',title:`Song ${offset+i+1}`,file_path:`music/${path||'album-0'}/song${offset+i+1}.flac`}))};
  } else if(url.pathname.endsWith('/browse/review')) data={songs:[{id:3,type:'local',title:'Review',file_path:'music/album-0/song3.flac'}],total:1,counts:{green:2,red:1,yellow:70515}};
  return {ok:true,status:200,json:async()=>data};
 };
 w.confirm=()=>false;
 for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if(script[1].trim())w.eval(script[1]);
 w.onload=null;
 return {w,calls,close:()=>dom.window.close()};
}
