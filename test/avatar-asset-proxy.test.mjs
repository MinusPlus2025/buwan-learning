import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
import {rewriteAssetUrls} from '../avatar.mjs';

const credentials={appId:'test-avatar-app',appSecret:'test-avatar-secret-only-on-server'};
const aliyun='https://public-xmov.oss-cn-hangzhou.aliyuncs.com/avatar_sdk_prod';

async function client(t,fetchImpl,avatarOptions=credentials){
  const server=createServer({fetchImpl,searchOptions:{braveApiKey:''},avatarOptions});
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const origin=`http://127.0.0.1:${server.address().port}`;
  return {
    origin,server,
    get:path=>fetch(origin+path),
    request:(path,method,value={},headers={},extra={})=>fetch(origin+path,{method,headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(value),...extra}),
    async config(){const response=await this.request('/api/avatar/config','POST');assert.equal(response.status,200);return response.json();}
  };
}

test('URL改写：阿里云资源地址改写到本地代理，其余域名与普通字符串不动',()=>{
  const value={
    resource_pack:{
      body_data_dir:aliyun+'/body_ani/F_CN12/look/AF034/1080x1920_fullbody/',
      face_ani_char_data:aliyun+'/face_ani/AF034/1080x1920_fullbody/char_data.bin',
      offline_idle:[{n:'stand_by',aef:24}]
    },
    config:{init_events:[{image:'https://media.xingyun3d.com/avatar_sdk_material/preview.png'}]},
    socket_io_url:'https://ttsa-gateway-lite.xingyun3d.com',
    note:'没有URL的普通字符串',
    count:42,
    flag:true,
    nothing:null
  };
  const rewritten=rewriteAssetUrls(value);
  assert.equal(rewritten.resource_pack.body_data_dir,'/api/avatar/asset/avatar_sdk_prod/body_ani/F_CN12/look/AF034/1080x1920_fullbody/');
  assert.equal(rewritten.resource_pack.face_ani_char_data,'/api/avatar/asset/avatar_sdk_prod/face_ani/AF034/1080x1920_fullbody/char_data.bin');
  assert.deepEqual(rewritten.resource_pack.offline_idle,[{n:'stand_by',aef:24}]);
  assert.equal(rewritten.config.init_events[0].image,'https://media.xingyun3d.com/avatar_sdk_material/preview.png');
  assert.equal(rewritten.socket_io_url,'https://ttsa-gateway-lite.xingyun3d.com');
  assert.equal(rewritten.note,'没有URL的普通字符串');
  assert.equal(rewritten.count,42);
  assert.equal(rewritten.flag,true);
  assert.equal(rewritten.nothing,null);
});

test('URL改写支持目录前缀拼接：SDK在改写后的目录后追加文件名仍是合法代理路径',()=>{
  const dir=rewriteAssetUrls(aliyun+'/body_ani/F_CN12/look/AF034/1080x1920_fullbody/');
  const joined=dir+'char_data.bin';
  assert.equal(joined,'/api/avatar/asset/avatar_sdk_prod/body_ani/F_CN12/look/AF034/1080x1920_fullbody/char_data.bin');
  assert.equal(new URL(joined,'http://localhost').pathname,joined);
});

test('会话响应中的阿里云资源地址被改写，网关与预览图地址保持原样',async t=>{
  const upstreamResponse={error_code:0,data:{
    session_id:'session-a',
    resource_pack:{
      body_data_dir:aliyun+'/body_ani/F_CN12/look/AF034/1080x1920_fullbody/',
      face_ani_char_data:aliyun+'/face_ani/AF034/1080x1920_fullbody/char_data.bin'
    },
    config:{init_events:[{image:'https://media.xingyun3d.com/avatar_sdk_material/F_CN12.png'}]},
    socket_io_url:'https://ttsa-gateway-lite.xingyun3d.com'
  }};
  const fetchImpl=async(url,options)=>{
    assert.match(String(url),/nebula-agent\.xingyun3d\.com/);
    assert.equal(options.method,'POST');
    return {ok:true,status:200,json:async()=>structuredClone(upstreamResponse)};
  };
  const api=await client(t,fetchImpl);
  const config=await api.config();
  const token=config.headers['X-Buwan-Avatar-Token'];
  const session=await (await api.request('/api/avatar/session','POST',{request_id:'rewrite-1'},{'x-buwan-avatar-token':token})).json();
  assert.equal(session.data.resource_pack.body_data_dir,'/api/avatar/asset/avatar_sdk_prod/body_ani/F_CN12/look/AF034/1080x1920_fullbody/');
  assert.equal(session.data.resource_pack.face_ani_char_data,'/api/avatar/asset/avatar_sdk_prod/face_ani/AF034/1080x1920_fullbody/char_data.bin');
  assert.equal(session.data.socket_io_url,'https://ttsa-gateway-lite.xingyun3d.com');
  assert.equal(session.data.config.init_events[0].image,'https://media.xingyun3d.com/avatar_sdk_material/F_CN12.png');
  assert.equal(JSON.stringify(session).includes(aliyun),false);
});

test('资源代理：放行白名单前缀、透传状态码与Range、流式返回上游内容',async t=>{
  const body='char-binary-content';
  const fetchImpl=async(url,options)=>{
    const target=String(url);
    assert.ok(target.startsWith(aliyun+'/'),'代理目标必须是阿里云资源域名');
    if(target.endsWith('/missing.bin'))return {ok:false,status:404,headers:new Headers()};
    const range=options?.headers?.Range;
    return {
      ok:true,status:range?206:200,
      headers:new Headers({'content-type':'application/octet-stream','content-length':String(body.length),...(range?{'content-range':`bytes 0-4/${body.length}`}:{})}),
      body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(body));controller.close();}})
    };
  };
  const api=await client(t,fetchImpl);
  const response=await api.get('/api/avatar/asset/avatar_sdk_prod/face_ani/AF034/char_data.bin');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/octet-stream');
  assert.equal(response.headers.get('accept-ranges'),'bytes');
  assert.equal(await response.text(),body);

  const ranged=await fetch(api.origin+'/api/avatar/asset/avatar_sdk_prod/face_ani/AF034/char_data.bin',{headers:{Range:'bytes=0-4'}});
  assert.equal(ranged.status,206);
  assert.equal(ranged.headers.get('content-range'),`bytes 0-4/${body.length}`);

  const missing=await api.get('/api/avatar/asset/avatar_sdk_prod/missing.bin');
  assert.equal(missing.status,404);
});

test('资源代理：拒绝路径穿越、其它路径与非GET方法',async t=>{
  const fetchImpl=async()=>assert.fail('被拒绝的请求不应到达上游');
  const api=await client(t,fetchImpl);
  for(const path of [
    '/api/avatar/asset/avatar_sdk_prod/../../../etc/passwd',
    '/api/avatar/asset/avatar_sdk_prod/%2e%2e/%2e%2e/etc/passwd',
    '/api/avatar/asset/other_bucket/file.bin',
    '/api/avatar/asset/'
  ]){
    const response=await api.get(path);
    assert.ok([400,403,404].includes(response.status),`${path} 应被拒绝，实际 ${response.status}`);
  }
  const post=await api.request('/api/avatar/asset/avatar_sdk_prod/file.bin','POST',{});
  assert.ok([403,404,405].includes(post.status));
});

test('资源代理：上游失败返回502且不泄露内部地址',async t=>{
  const fetchImpl=async()=>{throw new Error('network down');};
  const api=await client(t,fetchImpl);
  const response=await api.get('/api/avatar/asset/avatar_sdk_prod/face_ani/AF034/char_data.bin');
  assert.equal(response.status,502);
  const text=await response.text();
  assert.equal(text.includes('aliyuncs'),false);
  assert.equal(text.includes('network down'),false);
});
