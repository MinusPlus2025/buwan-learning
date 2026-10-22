import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';

const root=new URL('../',import.meta.url);
let child;
let base;

before(async()=>{
  const probe=net.createServer();
  await new Promise((resolve,reject)=>probe.listen(0,'127.0.0.1',resolve).once('error',reject));
  const {port}=probe.address();
  await new Promise(resolve=>probe.close(resolve));
  base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,['server.mjs'],{cwd:new URL(root).pathname,env:{...process.env,PORT:String(port)},stdio:['ignore','ignore','inherit']});
  for(let attempt=0;attempt<60;attempt++){
    if(child.exitCode!==null)throw new Error(`server exited with ${child.exitCode}`);
    try{if((await fetch(`${base}/api/health`)).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error('server did not become ready');
});

after(()=>{child?.kill();});

const post=(path,body,headers={})=>fetch(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json',origin:base,...headers},body:typeof body==='string'?body:JSON.stringify(body)});

test('health reports the 不晚 service without legacy rules metadata',async()=>{
  const response=await fetch(`${base}/api/health`);
  assert.equal(response.status,200);
  const health=await response.json();
  assert.equal(health.status,'up');
  assert.equal(health.product,'不晚');
  assert.equal(health.searchConfigured,false);
  assert.equal('rulesAvailable' in health,false);
});

test('legacy scenarios and evaluate routes return 404',async()=>{
  for(const [path,options] of [['/api/scenarios',{}],['/api/evaluate',{method:'POST'}]]){
    assert.equal((await fetch(`${base}${path}`,options)).status,404);
  }
});

test('rejects cross-origin and missing-origin POST requests',async()=>{
  assert.equal((await post('/api/search',{queries:['学钢琴']},{origin:'https://elsewhere.example'})).status,403);
  assert.equal((await fetch(`${base}/api/search`,{method:'POST',headers:{'content-type':'application/json'},body:'{"queries":[]}'})).status,403);
});

test('requires JSON content type',async()=>{
  assert.equal((await post('/api/search','{}',{'content-type':'text/plain'})).status,415);
});

test('search remains unavailable with 503',async()=>{
  const response=await post('/api/search',{queries:['如何开始学画画']});
  assert.equal(response.status,503);
  assert.deepEqual((await response.json()).results,[]);
});

test('validate-result removes resources and examples from untrusted client input',async()=>{
  const response=await post('/api/validate-result',{results:[{url:'https://trusted.example'}],result:{title:'开始学习',examples:['真人案例 https://trusted.example/case','我身边的真人故事'],resources:[{title:'资源',url:'https://trusted.example'}]}});
  assert.equal(response.status,200);
  const {result}=await response.json();
  assert.deepEqual(result.examples,['当前没有可核验的真人案例；请勿将示例内容视为真人经历。']);
  assert.deepEqual(result.resources,[]);
});

test('validate-result preserves four-week plan4 title/action protocol',async()=>{
  const plan4=Array.from({length:4},(_,i)=>({title:`第${i+1}周`,action:`第${i+1}周的行动`}));
  const response=await post('/api/validate-result',{result:{plan4}});
  assert.equal(response.status,200);
  const result=(await response.json()).result;
  assert.equal(result.plan4.length,4);
  assert.deepEqual(result.plan4,plan4);
});

test('rejects oversized request bodies with 413',async()=>{
  const response=await post('/api/validate-result',{result:{title:'x'.repeat(40*1024)}});
  assert.equal(response.status,413);
});
