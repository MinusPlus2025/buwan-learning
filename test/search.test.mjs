import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSearch,searchEndpoint,searchProvider,searchScope,braveSearchEndpoint} from '../search.mjs';

test('search uses only the fixed Wikimedia endpoint and sanitizes excerpt HTML',async()=>{
  let request;
  const service=createSearch(async(url,options)=>{
    request={url:String(url),options};
    return Response.json({pages:[{key:'口琴',title:'口琴',excerpt:'<span class="searchmatch">口琴</span> &amp; 页面'}]});
  });
  const result=await service.search({queries:['口琴'],interest:'乐器'});
  assert.equal(request.url.startsWith(searchEndpoint),true);
  assert.equal(new URL(request.url).hostname,'zh.wikipedia.org');
  assert.equal(request.options.headers['User-Agent'],'BuwanLearning/1.0 (learning-resource-search)');
  assert.equal(request.options.signal.aborted,false);
  assert.match(result.searchId,/^[\da-f-]{36}$/u);
  assert.deepEqual(result.results,[{title:'口琴',snippet:'口琴 & 页面',url:'https://zh.wikipedia.org/wiki/%E5%8F%A3%E7%90%B4',provider:searchProvider,scope:searchScope}]);
});

test('search caps concurrency at three and returns partial results',async()=>{
  let active=0;let peak=0;let call=0;
  const service=createSearch(async()=>{
    call+=1;const current=call;active+=1;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,10));active-=1;
    if(current===2)throw new Error('temporary failure');
    return Response.json({pages:[{key:`Page_${current}`,title:`Page ${current}`,excerpt:'摘要'}]});
  });
  const result=await service.search({queries:['甲','乙','丙'],interest:'丁'});
  assert.equal(peak,3);
  assert.equal(call,4);
  assert.equal(result.results.length,3);
  assert.equal(result.configured,true);
});

test('search returns a configured no-results response after bounded timeout',async()=>{
  const service=createSearch(()=>new Promise(()=>{}),{timeoutMs:20});
  const started=Date.now();
  const result=await service.search({queries:['超时']});
  assert.ok(Date.now()-started<500);
  assert.equal(result.configured,true);
  assert.deepEqual(result.results,[]);
});

test('search also times out when response headers arrive but the JSON body stalls',async()=>{
  const service=createSearch(async()=>({ok:true,json:()=>new Promise(()=>{})}),{timeoutMs:20});
  const started=Date.now();
  const result=await service.search({queries:['响应体超时']});
  assert.ok(Date.now()-started<500);
  assert.deepEqual(result.results,[]);
});

test('searchId exposes only server-held resources and expires',async()=>{
  const realNow=Date.now;let now=1000;Date.now=()=>now;
  try{
    const service=createSearch(async()=>Response.json({pages:[{key:'A',title:'A',excerpt:'摘要'}]}));
    const result=await service.search({queries:['A']});
    assert.equal(service.getResources(result.searchId)[0].title,'A');
    assert.deepEqual(service.getResources('guessed-id'),[]);
    now+=10*60*1000;
    assert.deepEqual(service.getResources(result.searchId),[]);
  }finally{Date.now=realNow;}
});

const braveKey='test-brave-secret-not-real';
const webPage=(id='guide')=>({title:`教程 ${id}`,url:`https://learn.example/${id}`,description:'<b>练习</b> &amp; 指南'});
const wikiPage={key:'口琴',title:'口琴',excerpt:'百科摘要'};

test('Brave uses the fixed official endpoint, strict search and token header only',async()=>{
  const calls=[];
  const service=createSearch(async(url,options)=>{
    calls.push({url:new URL(url),options});
    return Response.json({web:{results:[webPage()]}});
  },{braveApiKey:braveKey});
  const result=await service.search({queries:['口琴'],url:'https://attacker.example',braveApiKey:'client-key'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url.origin+calls[0].url.pathname,braveSearchEndpoint);
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams),{q:'口琴',count:'3',safesearch:'strict'});
  assert.equal(calls[0].options.headers['X-Subscription-Token'],braveKey);
  assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.signal.aborted,false);
  assert.equal(service.webSearchConfigured,true);
  assert.equal(service.provider,'Brave');
  assert.match(service.scope,/全网网页检索/);
  assert.equal(result.provider,'Brave');
  assert.equal(result.results[0].snippet,'练习 & 指南');
  assert.equal(result.results[0].provider,'Brave');
  assert.equal(JSON.stringify(result).includes(braveKey),false);
  assert.equal(String(calls[0].url).includes(braveKey),false);
  assert.deepEqual(service.getResources(result.searchId),result.results);
  const resources=service.getResources(result.searchId);resources[0].provider='伪造';
  assert.equal(service.getResources(result.searchId)[0].provider,'Brave');
});

test('Brave filters unsafe URLs, credentials and malformed results',async()=>{
  const invalidUrls=['javascript:alert(1)','data:text/html,hello','file:///etc/passwd','ftp://example.com/a','https://user:pass@example.com','https://user@example.com','/relative','not a url'];
  const service=createSearch(async()=>Response.json({web:{results:[
    ...invalidUrls.map(url=>({...webPage(),url})),null,{},
    {...webPage(),title:' '},{...webPage(),description:''},
    {...webPage(),url:'https://safe.example/a'},
    {...webPage(),url:'http://safe.example/b'}
  ]}}),{braveApiKey:braveKey});
  const result=await service.search({queries:['URL过滤']});
  assert.deepEqual(result.results.map(item=>item.url),['https://safe.example/a','http://safe.example/b']);
});

test('Brave deduplicates queries and URLs, caps concurrency at three and results at twelve',async()=>{
  let active=0;let peak=0;const calls=[];
  const service=createSearch(async url=>{
    const term=new URL(url).searchParams.get('q');calls.push(term);
    active+=1;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,5));active-=1;
    return Response.json({web:{results:Array.from({length:20},(_,i)=>webPage(`${term}-${i}`))}});
  },{braveApiKey:braveKey});
  const result=await service.search({queries:['甲','乙','丙'],interest:'丁'});
  assert.equal(peak,3);assert.equal(calls.length,4);
  assert.equal(result.results.length,12);
  assert.equal(service.getResources(result.searchId).length,6);
  const duplicate=await service.search({queries:['甲','甲','乙'],interest:'乙'});
  assert.equal(calls.length,6);
  assert.equal(duplicate.results.length,6);
  const samePage=createSearch(async()=>Response.json({web:{results:[webPage(),webPage()]}}),{braveApiKey:braveKey});
  assert.equal((await samePage.search({queries:['甲','乙']})).results.length,1);
});

test('partial Brave failure falls back per query and preserves actual resource providers',async()=>{
  const calls=[];
  const service=createSearch(async(url,options)=>{
    const target=new URL(url);calls.push(target);
    const term=target.searchParams.get('q');
    if(target.hostname==='api.search.brave.com'){
      if(term==='失败')return new Response('',{status:429});
      return Response.json({web:{results:[webPage()]}});
    }
    assert.equal(options.headers['X-Subscription-Token'],undefined);
    return Response.json({pages:[wikiPage]});
  },{braveApiKey:braveKey});
  const result=await service.search({queries:['成功','失败']});
  assert.equal(calls.length,3);
  assert.equal(result.provider,'Brave + Wikipedia');
  assert.match(result.scope,/部分.*Wikipedia/);
  assert.match(result.note,/1 个查询失败.*降级/);
  assert.deepEqual(new Set(result.results.map(item=>item.provider)),new Set(['Brave','Wikipedia']));
  assert.deepEqual(service.getResources(result.searchId),result.results);
});

test('all Brave failures report Wikipedia rather than a successful web search',async()=>{
  const service=createSearch(async url=>{
    if(new URL(url).hostname==='api.search.brave.com')throw new Error(`upstream ${braveKey}`);
    return Response.json({pages:[wikiPage]});
  },{braveApiKey:braveKey});
  const result=await service.search({queries:['甲','乙']});
  assert.equal(result.provider,'Wikipedia');
  assert.equal(result.scope,searchScope);
  assert.match(result.note,/2 个查询失败.*降级/);
  assert.equal(JSON.stringify(result).includes(braveKey),false);
  assert.equal(service.getResources(result.searchId)[0].provider,'Wikipedia');
});

test('a failed Wikipedia fallback leaves successful Brave results with an explicit failure note',async()=>{
  const service=createSearch(async url=>{
    const target=new URL(url);
    if(target.hostname==='api.search.brave.com'&&target.searchParams.get('q')==='成功')return Response.json({web:{results:[webPage()]}});
    throw new Error('离线失败');
  },{braveApiKey:braveKey});
  const result=await service.search({queries:['成功','失败']});
  assert.equal(result.provider,'Brave');
  assert.equal(result.results.length,1);
  assert.match(result.note,/失败.*降级尝试/);
});

test('both providers failing returns no searchId and a truthful fallback note',async()=>{
  const service=createSearch(async()=>{throw new Error(braveKey);},{braveApiKey:braveKey});
  const result=await service.search({queries:['失败']});
  assert.equal(result.provider,'Wikipedia');
  assert.equal(result.scope,searchScope);
  assert.match(result.note,/降级.*没有检索到/);
  assert.deepEqual(result.results,[]);
  assert.equal(result.searchId,undefined);
  assert.equal(JSON.stringify(result).includes(braveKey),false);
});

test('Brave header and body stalls abort within the timeout and fall back to Wikipedia',async()=>{
  for(const bodyStalls of [false,true]){
    let signal;
    const service=createSearch(async(url,options)=>{
      if(new URL(url).hostname==='api.search.brave.com'){
        signal=options.signal;
        return bodyStalls?{ok:true,json:()=>new Promise(()=>{})}:new Promise(()=>{});
      }
      return Response.json({pages:[wikiPage]});
    },{braveApiKey:braveKey,timeoutMs:20});
    const started=Date.now();
    const result=await service.search({queries:['超时']});
    assert.ok(Date.now()-started<500);
    assert.equal(signal.aborted,true);
    assert.equal(result.provider,'Wikipedia');
    assert.match(result.note,/失败.*降级/);
  }
});

test('malformed Brave bodies fall back but a valid empty search remains empty',async()=>{
  for(const value of [null,{}, {web:{results:'invalid'}}]){
    const service=createSearch(async url=>new URL(url).hostname==='api.search.brave.com'?Response.json(value):Response.json({pages:[wikiPage]}),{braveApiKey:braveKey});
    assert.equal((await service.search({queries:['格式']})).provider,'Wikipedia');
  }
  let calls=0;
  const service=createSearch(async()=>{calls+=1;return Response.json({web:{results:[]}});},{braveApiKey:braveKey});
  const result=await service.search({queries:['无结果']});
  assert.equal(calls,1);assert.equal(result.provider,'Brave');assert.deepEqual(result.results,[]);
});

test('upstream data cannot echo the configured secret into results or cached resources',async()=>{
  const service=createSearch(async()=>Response.json({web:{results:[
    {...webPage(),title:braveKey},{...webPage(),description:braveKey},
    {...webPage(),url:`https://learn.example/${braveKey}`},webPage()
  ]}}),{braveApiKey:braveKey});
  const result=await service.search({queries:['保密']});
  assert.equal(result.results.length,1);
  assert.equal(JSON.stringify(result).includes(braveKey),false);
  assert.equal(JSON.stringify(service.getResources(result.searchId)).includes(braveKey),false);
});

test('no key or a blank key never invokes the paid Brave API',async()=>{
  for(const options of [{},{braveApiKey:''},{braveApiKey:'   '}]){
    let calls=0;
    const service=createSearch(async(url,request)=>{
      calls+=1;assert.equal(new URL(url).origin,'https://zh.wikipedia.org');
      assert.equal(request.headers['X-Subscription-Token'],undefined);
      return Response.json({pages:[wikiPage]});
    },options);
    const result=await service.search({queries:['无密钥']});
    assert.equal(calls,1);assert.equal(service.webSearchConfigured,false);
    assert.equal(result.provider,'Wikipedia');assert.equal(result.scope,searchScope);
  }
});
