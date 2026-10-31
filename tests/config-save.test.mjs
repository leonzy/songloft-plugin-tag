import assert from 'node:assert/strict';
import test from 'node:test';
import { browserHarness } from './browser-harness.mjs';

function setup(t, response) {
 const h=browserHarness(async (url,options)=>url.pathname.endsWith('/config')&&options.method==='PUT'?response():null);
 t.after(h.close);
 h.w.S.cfg={qqmusic_api_url:'https://old.test/qq'};
 h.w.uiCfg();h.w.document.getElementById('cfgModal').classList.add('open');
 return h;
}

test('HTTP 400 keeps the entered URL and modal open, without a false saved toast',async t=>{
 const h=setup(t,()=>({ok:false,status:400,json:async()=>({error:'URL 不允许：指向内网地址'})}));
 const w=h.w;w.document.getElementById('cfg_qu').value='http://192.168.1.5/qq';
 const notices=[];w.toast=m=>notices.push(m);let closed=false;w.closeCfg=()=>{closed=true};
 await w.saveCfg();
 assert.equal(closed,false);assert.equal(w.document.getElementById('cfg_qu').value,'http://192.168.1.5/qq');
 assert.equal(w.S.cfg.qqmusic_api_url,'https://old.test/qq');
 assert.match(w.document.getElementById('cfgSaveError').textContent,/内网地址/);
 assert.ok(notices.every(m=>m!=='已保存'));
 assert.equal(h.calls.filter(c=>c.options.method==='GET').length,0);
});

test('bare QQ API keys explain that an address is required and send no request',async t=>{
 const h=setup(t,()=>assert.fail('must validate locally'));h.w.document.getElementById('cfg_qu').value='test-key-not-a-url';
 await h.w.saveCfg();
 assert.match(h.w.document.getElementById('cfgSaveError').textContent,/不能填写 API Key/);
 assert.equal(h.calls.length,0);
});

test('successful save applies the server configuration and closes once',async t=>{
 const config={qqmusic_api_url:'https://new.test/qq',enable_qqmusic:true};
 const h=setup(t,()=>({ok:true,status:200,json:async()=>({status:'ok',config})}));
 h.w.document.getElementById('cfg_qu').value=config.qqmusic_api_url;
 let closed=0;h.w.closeCfg=()=>{closed++};await h.w.saveCfg();
 assert.equal(h.w.S.cfg.enable_qqmusic,true);assert.equal(closed,1);
 assert.equal(h.w.document.getElementById('cfgSaveBtn').disabled,false);
});

test('network failure preserves inputs and makes save retryable',async t=>{
 const h=setup(t,()=>{throw new Error('network unavailable')});
 await h.w.saveCfg();assert.match(h.w.document.getElementById('cfgSaveError').textContent,/network unavailable/);
 assert.equal(h.w.document.getElementById('cfgSaveBtn').disabled,false);
});
