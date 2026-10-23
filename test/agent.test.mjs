import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {createServer} from '../server.mjs';

let server;
let base;
let searchId;

before(async()=>{
  const probe=net.createServer();
  await new Promise((resolve,reject)=>probe.listen(0,'127.0.0.1',resolve).once('error',reject));
  const {port}=probe.address();
  await new Promise(resolve=>probe.close(resolve));
  base=`http://127.0.0.1:${port}`;
  server=createServer({searchOptions:{braveApiKey:''},fetchImpl:async url=>{
    assert.equal(new URL(url).origin,'https://zh.wikipedia.org');
    assert.equal(new URL(url).pathname,'/w/rest.php/v1/search/page');
    return Response.json({pages:[{key:'口琴',title:'口琴',excerpt:'<span class="searchmatch">口琴</span> 页面摘要'}]});
  }});
  await new Promise((resolve,reject)=>server.listen(port,'127.0.0.1',resolve).once('error',reject));
});

after(()=>new Promise(resolve=>server?.close(resolve)));

const post=(path,body,headers={})=>fetch(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json',origin:base,...headers},body:typeof body==='string'?body:JSON.stringify(body)});

test('health reports the 不晚 service without legacy rules metadata',async()=>{
  const response=await fetch(`${base}/api/health`);
  assert.equal(response.status,200);
  const health=await response.json();
  assert.equal(health.status,'up');
  assert.equal(health.product,'不晚');
  assert.equal(health.searchConfigured,true);
  assert.equal(health.webSearchConfigured,false);
  assert.equal(health.searchProvider,'Wikipedia');
  assert.match(health.searchScope,/不是全网或课程搜索/);
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

test('search rejects empty terms and does not accept custom source URLs',async()=>{
  for(const queries of [[],['   '],[`绘画`.repeat(201)]])assert.equal((await post('/api/search',{queries})).status,400);
  const response=await post('/api/search',{queries:['口琴'],url:'https://attacker.example'});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.provider,'Wikipedia');
  assert.match(result.scope,/不是全网或课程搜索/);
  assert.match(result.results[0].url,/^https:\/\/zh\.wikipedia\.org\/wiki\//);
  searchId=result.searchId;
});

const validResult={
  title:'从今天开始练习',
  story:'你已经明确了想学的事，也知道可以从小步开始。',
  goal:'建立每周稳定练习的节奏。',
  worry:'担心没有基础、容易中途放弃。',
  answer:'先把目标缩小到今天能完成的一次练习，再按反馈逐步调整。',
  first_lesson:'今天用十分钟完成一次基础练习，并记录完成后的感受。',
  share_text:'我从今天的一次小练习开始。',
  plan4:Array.from({length:4},(_,i)=>({title:`第${i+1}周`,action:`第${i+1}周完成一次可记录的练习，并根据结果调整下一步。`}))
};

test('validate-result binds resources to server search results and removes examples',async()=>{
  const fake={title:'伪造标题',name:'伪造名称',description:'伪造描述',snippet:'伪造摘要',url:'https://attacker.example'};
  const response=await post('/api/validate-result',{searchId,results:[{url:'https://attacker.example'}],result:{...validResult,examples:['未经核验案例'],resources:[fake]}});
  assert.equal(response.status,200);
  const {result}=await response.json();
  assert.equal(result.title,validResult.title);
  assert.equal(result.plan4.length,4);
  assert.equal('examples' in result,false);
  assert.deepEqual(result.resources,[{title:'口琴',snippet:'口琴 页面摘要',url:'https://zh.wikipedia.org/wiki/%E5%8F%A3%E7%90%B4',provider:'Wikipedia',scope:'Wikipedia 公开知识页面检索，不是全网或课程搜索'}]);
});

test('validate-result ignores client resources when searchId is invalid',async()=>{
  const response=await post('/api/validate-result',{searchId:'expired-or-guessed',result:{...validResult,resources:[{title:'伪造',url:'https://attacker.example'}]}});
  assert.equal(response.status,200);
  assert.equal('resources' in (await response.json()).result,false);
});

test('validate-result accepts legacy plan goal/task format',async()=>{
  const plan=validResult.plan4.map(item=>({goal:item.title,task:item.action}));
  const response=await post('/api/validate-result',{result:{...validResult,plan,plan4:undefined}});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).result.plan4,validResult.plan4);
});

test('validate-result rejects empty core text and incomplete plans with 422',async()=>{
  for(const field of ['title','story','goal','worry','answer','first_lesson']){
    const response=await post('/api/validate-result',{result:{...validResult,[field]:'   '}});
    assert.equal(response.status,422,field);
  }
  const fiveWeekPlan=[...validResult.plan4,{title:'第5周',action:'第五周完成一次可记录的练习，并根据结果调整下一步。'}];
  for(const [count,plan4] of [[3,validResult.plan4.slice(0,3)],[5,fiveWeekPlan]]){
    const response=await post('/api/validate-result',{result:{...validResult,plan4}});
    assert.equal(response.status,422,`${count}周`);
  }
});

test('validate-result rejects wrong types and oversized actions without truncating',async()=>{
  for(const value of [null,[],42,{...validResult,plan4:'四周'}]){
    const response=await post('/api/validate-result',{result:value});
    assert.equal(response.status,422);
  }
  const longAction='有效动作'.repeat(400);
  const response=await post('/api/validate-result',{result:{...validResult,plan4:validResult.plan4.map((item,index)=>index?item:{...item,action:longAction})}});
  assert.equal(response.status,422);
});

test('validate-result applies server-side swimming safety rules',async()=>{
  const safe={...validResult,first_lesson:'不要独自下水，也不要进行憋气训练。',plan4:validResult.plan4.map(item=>({...item,action:'避免独自下水和憋气练习。'}))};
  const safeResponse=await post('/api/validate-result',{interest:'游泳',result:safe});
  assert.equal(safeResponse.status,200);
  const safeResult=(await safeResponse.json()).result;
  assert.match(safeResult.first_lesson,/正规.*(?:教练|救生员).*陪同/);
  assert.ok(safeResult.plan4.every(item=>/正规.*(?:教练|救生员).*陪同/.test(item.action)));

  const unsafe={...validResult,first_lesson:'今天独自下水练习。'};
  const unsafeResponse=await post('/api/validate-result',{interest:'游泳',result:unsafe});
  assert.equal(unsafeResponse.status,422);
  for(const first_lesson of ['不要紧张，然后独自下水。','不要独自下水，但是练习憋气。','练习憋气十秒钟。']){
    const response=await post('/api/validate-result',{result:{...validResult,title:'游泳起步',first_lesson}});
    assert.equal(response.status,422,first_lesson);
  }
  const detected=await post('/api/validate-result',{result:{...validResult,plan4:validResult.plan4.map(item=>({...item,action:'学习游泳，先联系教练。'}))}});
  assert.equal(detected.status,200);
  assert.match((await detected.json()).result.first_lesson,/正规.*陪同/);
});

test('rejects oversized request bodies with 413',async()=>{
  const response=await post('/api/validate-result',{result:{title:'x'.repeat(40*1024)}});
  assert.equal(response.status,413);
});

test('capabilities describes Wikipedia fallback without claiming avatar functionality',async()=>{
  const response=await fetch(`${base}/api/capabilities`);
  assert.equal(response.status,200);
  const capabilities=await response.json();
  assert.deepEqual(Object.keys(capabilities),['search','avatar']);
  assert.equal(capabilities.avatar.configured,false);
  assert.equal(capabilities.search.configured,true);
  assert.equal(capabilities.search.provider,'Wikipedia');
  assert.equal(capabilities.search.webSearchConfigured,false);
  assert.match(capabilities.search.scope,/不是全网/);
});

async function startSearchServer(t,options){
  const instance=createServer(options);
  await new Promise((resolve,reject)=>instance.listen(0,'127.0.0.1',resolve).once('error',reject));
  t.after(()=>new Promise(resolve=>instance.close(resolve)));
  const origin=`http://127.0.0.1:${instance.address().port}`;
  return {
    get:path=>fetch(`${origin}${path}`),
    post:(path,value)=>fetch(`${origin}${path}`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)})
  };
}

test('Brave server exposes accurate defaults, safe results and server-held resource provenance',async t=>{
  const key='test-server-secret-not-real';let calls=0;
  const client=await startSearchServer(t,{searchOptions:{braveApiKey:key},fetchImpl:async(url,options)=>{
    calls+=1;
    assert.equal(new URL(url).origin+new URL(url).pathname,'https://api.search.brave.com/res/v1/web/search');
    assert.equal(options.headers['X-Subscription-Token'],key);
    return Response.json({web:{results:[
      {title:'不安全',url:'javascript:alert(1)',description:'不安全摘要'},
      {title:'含凭据',url:'https://user:password@learn.example',description:'含凭据摘要'},
      {title:'网页教程',url:'https://learn.example/guide',description:'真实网页摘要'}
    ]}});
  }});
  for(const path of ['/api/health','/api/capabilities']){
    const response=await client.get(path);const text=await response.text();
    assert.equal(text.includes(key),false);
    const data=JSON.parse(text);const status=data.search||data;
    assert.equal(data.search?status.provider:status.searchProvider,'Brave');
    assert.match(data.search?status.scope:status.searchScope,/全网网页检索/);
    assert.equal(status.webSearchConfigured,true);
    if(data.search)assert.equal(data.avatar.configured,false);
  }
  assert.equal(calls,0);
  const response=await client.post('/api/search',{queries:['教程'],url:'https://attacker.example',braveApiKey:'client-token',searchOptions:{braveApiKey:'client-token'}});
  assert.equal(response.status,200);
  const raw=await response.text();assert.equal(raw.includes(key),false);
  const searched=JSON.parse(raw);
  assert.equal(searched.provider,'Brave');assert.equal(searched.results.length,1);
  const validated=await client.post('/api/validate-result',{searchId:searched.searchId,result:{...validResult,resources:[{provider:'伪造',url:'https://attacker.example'}]}});
  const result=(await validated.json()).result;
  assert.deepEqual(result.resources,searched.results);
  assert.equal(result.resources[0].provider,'Brave');
  assert.equal(JSON.stringify(result).includes(key),false);
  assert.equal(calls,1);
});

test('server reports Wikipedia after Brave failure while health retains configured default',async t=>{
  const key='test-fallback-secret-not-real';
  const client=await startSearchServer(t,{searchOptions:{braveApiKey:key},fetchImpl:async(url,options)=>{
    if(new URL(url).hostname==='api.search.brave.com')throw new Error(`secret ${key}`);
    assert.equal(options.headers['X-Subscription-Token'],undefined);
    return Response.json({pages:[{key:'口琴',title:'口琴',excerpt:'回退摘要'}]});
  }});
  const response=await client.post('/api/search',{queries:['口琴']});
  assert.equal(response.status,200);
  const raw=await response.text();assert.equal(raw.includes(key),false);
  const result=JSON.parse(raw);
  assert.equal(result.provider,'Wikipedia');assert.match(result.scope,/不是全网/);
  assert.match(result.note,/失败.*降级/);
  const validated=await client.post('/api/validate-result',{searchId:result.searchId,result:validResult});
  assert.equal((await validated.json()).result.resources[0].provider,'Wikipedia');
  const health=await (await client.get('/api/health')).json();
  assert.equal(health.searchProvider,'Brave');assert.equal(health.webSearchConfigured,true);
});

test('server hides upstream errors when both providers fail',async t=>{
  const key='test-offline-secret-not-real';
  const client=await startSearchServer(t,{searchOptions:{braveApiKey:key},fetchImpl:async()=>{throw new Error(key);}});
  const response=await client.post('/api/search',{queries:['失败']});
  assert.equal(response.status,503);
  const raw=await response.text();assert.equal(raw.includes(key),false);
  const result=JSON.parse(raw);
  assert.equal(result.configured,false);assert.equal(result.provider,'Wikipedia');
  assert.match(result.note,/降级.*没有检索到/);assert.deepEqual(result.results,[]);
});

test('upstream secrets never reach logs and sensitive server files are not served',async t=>{
  const key='test-log-secret-not-real';const logs=[];
  for(const method of ['log','error','warn'])t.mock.method(console,method,(...args)=>logs.push(args));
  const client=await startSearchServer(t,{searchOptions:{braveApiKey:key},fetchImpl:async()=>{throw new Error(`upstream ${key}`);}});
  const response=await client.post('/api/search',{queries:['日志保密']});
  assert.equal(response.status,503);
  assert.equal((await response.text()).includes(key),false);
  for(const path of ['/api/health','/api/capabilities','/.env','/.env.example','/search.mjs']){
    const response=await client.get(path);
    assert.equal(response.status,path.startsWith('/api/')?200:404);
    assert.equal((await response.text()).includes(key),false);
  }
  assert.deepEqual(logs,[]);
});

test('server reads the environment only by default and search options isolate tests',async t=>{
  const previous=process.env.BRAVE_SEARCH_API_KEY;
  const key='test-env-secret-not-real';
  process.env.BRAVE_SEARCH_API_KEY=key;
  try{
    const defaultClient=await startSearchServer(t,{fetchImpl:async(url,options)=>{
      assert.equal(new URL(url).hostname,'api.search.brave.com');
      assert.equal(options.headers['X-Subscription-Token'],key);
      return Response.json({web:{results:[{title:'教程',url:'https://learn.example/guide',description:'摘要'}]}});
    }});
    const response=await defaultClient.post('/api/search',{queries:['配置']});
    assert.equal(response.status,200);assert.equal((await response.json()).provider,'Brave');
    const isolated=await startSearchServer(t,{searchOptions:{},fetchImpl:async url=>{
      assert.equal(new URL(url).hostname,'zh.wikipedia.org');
      return Response.json({pages:[{key:'A',title:'A',excerpt:'摘要'}]});
    }});
    assert.equal((await (await isolated.post('/api/search',{queries:['隔离']})).json()).provider,'Wikipedia');
    const health=await (await isolated.get('/api/health')).json();
    assert.equal(health.webSearchConfigured,false);assert.equal(health.searchProvider,'Wikipedia');
  }finally{
    if(previous===undefined)delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY=previous;
  }
});
