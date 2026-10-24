import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createServer} from '../server.mjs';

const avatarOptions={appId:'proxy-test-app',appSecret:'proxy-test-secret'};

async function serve(t){
  const server=createServer({fetchImpl:async()=>({ok:true,json:async()=>({})}),searchOptions:{braveApiKey:''},avatarOptions});
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return server.address().port;
}

// 用裸 HTTP 请求精确控制 Host / X-Forwarded-Host，模拟部署网关改写 Host 的场景。
function raw(port,headers){
  return new Promise((resolve,reject)=>{
    const request=http.request({host:'127.0.0.1',port,path:'/api/avatar/config',method:'POST',headers:{'content-type':'application/json',...headers}},(response)=>{
      let body='';
      response.on('data',chunk=>{body+=chunk;});
      response.on('end',()=>resolve({status:response.statusCode,body}));
    });
    request.on('error',reject);
    request.end('{}');
  });
}

test('部署网关改写 Host 时，同源浏览器请求不被误拦',async t=>{
  const port=await serve(t);
  const publicHost='buwan-learning.app.workbuddy.host';
  // 网关把 Host 改成内部名，用 X-Forwarded-Host 保留公网域名；浏览器 Origin 指向公网域名。
  const result=await raw(port,{host:'internal.container:8080','x-forwarded-host':publicHost,origin:`https://${publicHost}`});
  assert.notEqual(result.status,403,'同源请求不应被来源校验拦截');
  assert.doesNotMatch(result.body,/来源不允许/);
});

test('直连场景（无转发头）同源请求仍然通过',async t=>{
  const port=await serve(t);
  const origin=`http://127.0.0.1:${port}`;
  const result=await raw(port,{host:`127.0.0.1:${port}`,origin});
  assert.notEqual(result.status,403,'本地同源请求不应被拦截');
});

test('跨源 Origin 仍然被拦截',async t=>{
  const port=await serve(t);
  const result=await raw(port,{host:`127.0.0.1:${port}`,origin:'https://evil.example.com'});
  assert.equal(result.status,403);
  assert.match(result.body,/来源不允许/);
});

test('sec-fetch-site 为 cross-site 时仍然被拦截',async t=>{
  const port=await serve(t);
  const result=await raw(port,{host:`127.0.0.1:${port}`,origin:`http://127.0.0.1:${port}`,'sec-fetch-site':'cross-site'});
  assert.equal(result.status,403);
});

test('缺少 Origin 与 Referer 时仍然被拦截',async t=>{
  const port=await serve(t);
  const result=await raw(port,{host:`127.0.0.1:${port}`});
  assert.equal(result.status,403);
});

test('X-Forwarded-Host 与 Origin 不一致时仍然被拦截',async t=>{
  const port=await serve(t);
  const result=await raw(port,{host:'internal.container:8080','x-forwarded-host':'other.example.com',origin:'https://buwan-learning.app.workbuddy.host'});
  assert.equal(result.status,403);
});
