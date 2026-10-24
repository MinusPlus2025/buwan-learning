import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createAvatarService,signAvatarRequest,avatarEndpoint} from '../avatar.mjs';
import {createServer} from '../server.mjs';

const credentials={appId:'test-avatar-app',appSecret:'test-avatar-secret-only-on-server'};
const tokenOf=service=>service.issueConfig().value.headers['X-Buwan-Avatar-Token'];
const success=(session_id='session-a')=>({data:{session_id,resource_pack:{body_data_dir:'https://media.xingyun3d.com/body'},config:{}},error_code:0});
const plain=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

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

test('签名使用运行时时间、递归码点排序、数组顺序、非 ASCII 码元转义及普通空格删除',()=>{
  const payload={request_id:'请求 a',config:{'\ue000':1,'𐀀':2,z:[{b:'中 文\u007f 😀',a:'x y'},2,1]}};
  const result=signAvatarRequest(credentials.appId,credentials.appSecret,'POST',payload);
  const canonical='{"config":{"z":[{"a":"xy","b":"\\u4e2d\\u6587\\u007f\\ud83d\\ude00"},2,1],"\\ue000":1,"\\ud800\\udc00":2},"request_id":"\\u8bf7\\u6c42a"}';
  const timestamp=result.headers['X-TIMESTAMP'];
  assert.ok(Math.abs(Number(timestamp)-Math.floor(Date.now()/1000))<=1);
  assert.equal(result.headers['X-APP-ID'],credentials.appId);
  assert.equal(result.headers['X-TOKEN'],createHash('md5').update('/user/v1/ttsa/sessionpost'+canonical+credentials.appSecret+timestamp).digest('hex'));
  assert.deepEqual(Object.keys(result.data.config),['z','\ue000','𐀀']);
  assert.equal(result.data.config.z[0].b,'中 文\u007f 😀');
  assert.deepEqual(result.data.config.z.slice(1),[2,1]);
});

test('与下载参考 SDK 实际 headersNeedSign 函数逐项比较',async t=>{
  let source;
  try{source=await readFile(new URL('../../outputs/xmovAvatar-reference.js',import.meta.url),'utf8');}
  catch(error){if(error.code==='ENOENT')return t.skip('本机 SDK 参考文件不存在；独立签名断言仍会运行');throw error;}
  const helperStart=source.indexOf('function _createForOfIteratorHelperLoose(');
  const helperEnd=source.indexOf('function _extends(',helperStart);
  const signStart=source.indexOf('function escapeNonAsciiForPythonJson(');
  const signEnd=source.indexOf('var CacheManager=',signStart);
  assert.ok(helperStart>=0&&helperEnd>helperStart&&signStart>=0&&signEnd>signStart);
  const now=Date.now();
  const context=vm.createContext({URL,Date:class extends Date{static now(){return now;}},encodeWithMd5:value=>createHash('md5').update(value).digest('hex')});
  vm.runInContext(source.slice(helperStart,helperEnd)+source.slice(signStart,signEnd),context);
  for(const method of ['POST','DELETE']){
    const payload={request_id:'请求 / 空 格',config:{'𐀀':1,'\ue000':2,z:[{b:'😀\u007f\n',a:'a b'},null,false]},stop_reason:'用户 关闭'};
    const actual=signAvatarRequest(credentials.appId,credentials.appSecret,method,payload);
    const expected=context.headersNeedSign(credentials.appId,credentials.appSecret,method,avatarEndpoint,payload);
    const timestamp=actual.headers['X-TIMESTAMP'];
    if(timestamp!==expected.headers['X-TIMESTAMP'])expected.headers['X-TOKEN']=createHash('md5').update('/user/v1/ttsa/session'+method.toLowerCase()+JSON.stringify(expected.data).replace(/[^\u0000-\u007e]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')).replace(/ /g,'')+credentials.appSecret+timestamp).digest('hex');
    expected.headers['X-TIMESTAMP']=timestamp;
    assert.deepEqual(actual,plain(expected));
  }
});

test('未配置只返回状态与缺失环境变量名，不调用上游',async t=>{
  for(const options of [{},{appId:credentials.appId},{appSecret:credentials.appSecret}]){
    const service=createAvatarService(()=>assert.fail('未配置时不应请求上游'),options);
    assert.equal(service.configured,false);
    assert.deepEqual(Object.keys(service.capability),['configured','provider','note']);
    assert.equal(service.issueConfig().status,503);
    assert.equal(JSON.stringify(service.capability).includes(credentials.appSecret),false);
  }
  const api=await client(t,()=>assert.fail('未配置时不应请求上游'),{});
  const response=await api.request('/api/avatar/config','POST');
  assert.equal(response.status,503);
  assert.deepEqual((await response.json()).missing,['XINGYUN_APP_ID','XINGYUN_APP_SECRET']);
  assert.equal((await api.request('/api/avatar/session','POST',{request_id:'a'})).status,503);
  const capability=(await (await api.get('/api/capabilities')).json()).avatar;
  assert.deepEqual(Object.keys(capability),['configured','provider','note']);
  assert.equal(capability.configured,false);
});

test('固定上游、重算服务端签名、发送排序 JSON，并递归移除回显凭据',async t=>{
  const calls=[];
  let localToken;
  const api=await client(t,async(url,options)=>{
    calls.push({url,options});
    return Response.json({...success(),appId:credentials.appId,appSecret:credentials.appSecret,headers:options.headers,data:{...success().data,config:{app_secret:credentials.appSecret,'X-TOKEN':options.headers['X-TOKEN'],nested:[{apiKey:'other-key',password:'other-password',authorization:'bearer',access_token:'other-token',safe:'ok',echo:`echo ${credentials.appSecret}`,local:localToken}],signedEcho:options.headers['X-TOKEN']}}});
  });
  const config=await api.config();
  localToken=config.headers['X-Buwan-Avatar-Token'];
  assert.equal(config.appSecret,'server-managed');
  assert.equal(config.gatewayServer,'/api/avatar/session');
  assert.equal(config.appId,credentials.appId);
  assert.match(localToken,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(config).includes(credentials.appSecret),false);
  const input={request_id:'start-a',url:'https://attacker.example',config:{z:'中 文',a:[{b:2,a:1}]}};
  const response=await api.request(config.gatewayServer,'POST',input,{...config.headers,'X-TOKEN':'client-signature','X-APP-ID':'client-id','X-TIMESTAMP':'1'});
  assert.equal(response.status,200);
  assert.equal(calls.length,1);
  const {url,options}=calls[0];
  assert.equal(url,avatarEndpoint);
  assert.equal(options.redirect,'error');
  assert.equal(options.headers['X-APP-ID'],credentials.appId);
  assert.equal(options.headers['X-Buwan-Avatar-Token'],undefined);
  assert.notEqual(options.headers['X-TOKEN'],'client-signature');
  const signed=signAvatarRequest(credentials.appId,credentials.appSecret,'POST',input);
  assert.equal(options.body,JSON.stringify(signed.data));
  assert.equal(options.body.includes('中 文'),true);
  const result=await response.json();
  assert.deepEqual(result.data.config.nested,[{safe:'ok',echo:'[redacted]',local:'[redacted]'}]);
  for(const secret of [credentials.appSecret,localToken,options.headers['X-TOKEN'],'other-key','other-password','other-token'])assert.equal(JSON.stringify(result).includes(secret),false);
  const capabilities=await (await api.get('/api/capabilities')).json();
  assert.equal(capabilities.avatar.configured,true);
  assert.deepEqual(Object.keys(capabilities.avatar),['configured','provider','note']);
  assert.match(capabilities.avatar.note,/尚未验收/);
});

test('上游 token 保留给客户端 SDK 连接实时网关，密钥与签名回显仍被移除',async t=>{
  const upstreamToken='upstream-websocket-token-xyz';
  const api=await client(t,async()=>Response.json({error_code:0,data:{session_id:'s1',token:upstreamToken,socket_io_url:'https://ttsa-gateway-lite.xingyun3d.com',appSecret:credentials.appSecret,'X-TOKEN':'sig-echo',resource_pack:{},config:{}}}));
  const config=await api.config();
  const response=await api.request(config.gatewayServer,'POST',{request_id:'token-keep'},{...config.headers});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.data.token,upstreamToken);
  assert.equal(result.data.socket_io_url,'https://ttsa-gateway-lite.xingyun3d.com');
  assert.equal(result.data.appSecret,undefined);
  assert.equal(result.data['X-TOKEN'],undefined);
  assert.equal(JSON.stringify(result).includes(credentials.appSecret),false);
});

test('config 和 session 强制同源及 JSON，并限制请求体 32KB',async t=>{
  let calls=0;
  const api=await client(t,async()=>{calls++;return Response.json(success());});
  for(const [path,method] of [['/api/avatar/config','POST'],['/api/avatar/session','POST'],['/api/avatar/session','DELETE']]){
    assert.equal((await api.request(path,method,{}, {origin:'https://attacker.example'})).status,403);
    assert.equal((await api.request(path,method,{}, {'sec-fetch-site':'cross-site'})).status,403);
    assert.equal((await fetch(api.origin+path,{method,headers:{'content-type':'application/json'},body:'{}'})).status,403);
    assert.equal((await api.request(path,method,{}, {'content-type':'text/plain'})).status,415);
    assert.equal((await api.request(path,method,{}, {},{body:'{broken'})).status,400);
    assert.equal((await api.request(path,method,{padding:'x'.repeat(33*1024)})).status,413);
  }
  assert.equal(calls,0);
});

test('session 拒绝 missing/wrong token 与无效 body/request_id，合法请求仍可开始',async t=>{
  let calls=0;
  const api=await client(t,async()=>{calls++;return Response.json(success());});
  for(const headers of [{},{'X-Buwan-Avatar-Token':'wrong'}])for(const method of ['POST','DELETE'])assert.equal((await api.request('/api/avatar/session',method,{request_id:'a'},headers)).status,403);
  const config=await api.config();
  for(const value of [null,[],1,{}, {request_id:''},{request_id:' '},{request_id:'x'.repeat(201)},{request_id:42}])assert.equal((await api.request('/api/avatar/session','POST',value,config.headers)).status,400);
  assert.equal(calls,0);
  assert.equal((await api.request('/api/avatar/session','POST',{request_id:'good'},config.headers)).status,200);
  assert.equal(calls,1);
});

test('token TTL 为30分钟且内存最多100条，满额不淘汰已有凭证',async()=>{
  const service=createAvatarService(async()=>Response.json(success()),credentials);
  const tokens=Array.from({length:100},()=>tokenOf(service));
  assert.equal(new Set(tokens).size,100);
  assert.equal(service.issueConfig().status,429);
  assert.equal((await service.session('POST',tokens[0],{request_id:'still-valid'})).status,200);
  const realNow=Date.now;
  const now=realNow();
  try{
    Date.now=()=>now+30*60*1000;
    assert.equal((await service.session('POST',tokens[1],{request_id:'expired'})).status,403);
    assert.equal((await service.session('DELETE',tokens[0],{request_id:'still-valid',stop_reason:'expired'})).status,403);
    assert.equal(service.issueConfig().status,200);
  }finally{Date.now=realNow;}
});

test('每 token 只允许一次并发或成功 start，跨 token request_id 不能冒领',async()=>{
  const pending=deferred();let calls=0;
  const service=createAvatarService(async()=>{calls++;await pending.promise;return Response.json(success());},credentials);
  const one=tokenOf(service),two=tokenOf(service);
  const start=service.session('POST',one,{request_id:'same'});
  assert.equal((await service.session('POST',one,{request_id:'different'})).status,409);
  assert.equal((await service.session('POST',two,{request_id:'same'})).status,409);
  pending.resolve();
  assert.equal((await start).status,200);
  assert.equal((await service.session('POST',one,{request_id:'again'})).status,409);
  assert.equal(calls,1);
});

test('start 失败释放占用，异常及上游错误均通用502且不反射错误内容',async()=>{
  for(const mode of ['throw','http','json','error_code','shape']){
    let calls=0;
    const service=createAvatarService(async()=>{
      if(calls++>0)return Response.json(success());
      if(mode==='throw')throw new Error(credentials.appSecret);
      if(mode==='http')return new Response(credentials.appSecret,{status:401});
      if(mode==='json')return {ok:true,json:async()=>{throw new Error(credentials.appSecret);}};
      if(mode==='error_code')return Response.json({error_code:123,error_reason:credentials.appSecret});
      return Response.json({data:{session_id:'missing-pack'}});
    },credentials);
    const token=tokenOf(service);
    assert.deepEqual(await service.session('POST',token,{request_id:'first'}),{status:502,value:{error:'数字人上游请求失败'}});
    assert.equal((await service.session('POST',token,{request_id:'retry'})).status,200);
  }
});

test('响应头和响应 JSON 挂起均受总超时约束，并 abort 上游',async()=>{
  for(const bodyStalls of [false,true]){
    let signal;
    const service=createAvatarService(async(_url,options)=>{
      signal=options.signal;
      return bodyStalls?{ok:true,json:()=>new Promise(()=>{})}:new Promise(()=>{});
    },{...credentials,timeoutMs:20});
    const started=Date.now();
    assert.equal((await service.session('POST',tokenOf(service),{request_id:'timeout'})).status,502);
    assert.equal(signal.aborted,true);
    assert.ok(Date.now()-started<500);
  }
});

test('DELETE 只允许所属标识，失败保留 token 供客户端重试，成功销毁',async t=>{
  const calls=[];let failures=1;
  const api=await client(t,async(url,options)=>{
    calls.push({url,options});
    if(options.method==='POST')return Response.json(success(JSON.parse(options.body).request_id+'-session'));
    if(failures-->0)throw new Error(credentials.appSecret);
    return Response.json({data:{stopped:true},error_code:0});
  });
  const one=await api.config(),two=await api.config();
  for(const [config,request_id] of [[one,'one'],[two,'two']])assert.equal((await api.request('/api/avatar/session','POST',{request_id},config.headers)).status,200);
  for(const value of [{stop_reason:'bye'},{stop_reason:'bye',request_id:'two'},{stop_reason:'bye',session_id:'two-session'},{stop_reason:'bye',request_id:'one',session_id:'two-session'},{stop_reason:'bye',session_id:''}])assert.equal((await api.request('/api/avatar/session','DELETE',value,one.headers)).status,403);
  assert.equal((await api.request('/api/avatar/session','DELETE',{request_id:'one'},one.headers)).status,400);
  assert.equal(calls.length,2);
  const stopping={stop_reason:'destroy',session_id:'one-session'};
  const failure=await api.request('/api/avatar/session','DELETE',stopping,one.headers);
  assert.equal(failure.status,502);
  assert.deepEqual(await failure.json(),{error:'数字人上游请求失败'});
  assert.equal((await api.request('/api/avatar/session','DELETE',stopping,one.headers)).status,200);
  assert.equal(calls.length,4);
  assert.deepEqual(JSON.parse(calls[3].options.body),{request_id:'one',session_id:'one-session',stop_reason:'destroy'});
  assert.equal(calls[3].url,avatarEndpoint);
  assert.equal((await api.request('/api/avatar/session','DELETE',stopping,one.headers)).status,403);
  assert.equal((await api.request('/api/avatar/session','POST',{request_id:'new'},one.headers)).status,403);
  assert.equal((await api.request('/api/avatar/session','DELETE',{stop_reason:'bye',request_id:'two'},two.headers)).status,200);
});

test('没有 session_id 时 DELETE 仍通过已绑定 request_id 停止，并阻止并发 DELETE',async()=>{
  const pending=deferred();const calls=[];
  const service=createAvatarService(async(_url,options)=>{
    calls.push(options);
    if(options.method==='POST')return Response.json({data:{resource_pack:{},config:{}}});
    await pending.promise;
    return Response.json({error_code:0});
  },credentials);
  const token=tokenOf(service);
  await service.session('POST',token,{request_id:'request-only'});
  const stopping=service.session('DELETE',token,{stop_reason:'destroy',request_id:'request-only'});
  assert.equal((await service.session('DELETE',token,{stop_reason:'destroy',request_id:'request-only'})).status,409);
  pending.resolve();
  assert.equal((await stopping).status,200);
  assert.deepEqual(JSON.parse(calls[1].body),{request_id:'request-only',stop_reason:'destroy'});
});

test('client 在 start 未完成时断连，成功后用所属标识尽力释放',async()=>{
  const pending=deferred();const calls=[];
  const service=createAvatarService(async(_url,options)=>{
    calls.push(options);
    if(options.method==='POST'){await pending.promise;return Response.json(success());}
    return Response.json({error_code:0});
  },credentials);
  const token=tokenOf(service);
  const starting=service.session('POST',token,{request_id:'abandoned'});
  await service.release(token);
  pending.resolve();
  await starting;
  assert.deepEqual(calls.map(call=>call.method),['POST','DELETE']);
  assert.deepEqual(JSON.parse(calls[1].body),{request_id:'abandoned',session_id:'session-a',stop_reason:'client_disconnected'});
  assert.equal((await service.session('POST',token,{request_id:'again'})).status,403);
});

test('HTTP start abort 触发同一释放机制',async t=>{
  const reached=deferred(),finish=deferred(),stopped=deferred();
  const api=await client(t,async(_url,options)=>{
    if(options.method==='POST'){reached.resolve();await finish.promise;return Response.json(success());}
    stopped.resolve(JSON.parse(options.body));
    return Response.json({error_code:0});
  });
  const config=await api.config();
  const closed=deferred();
  api.server.once('request',(_req,res)=>res.once('close',()=>closed.resolve()));
  const controller=new AbortController();
  const starting=api.request('/api/avatar/session','POST',{request_id:'http-abort'},config.headers,{signal:controller.signal});
  await reached.promise;
  controller.abort();
  await assert.rejects(starting,{name:'AbortError'});
  await closed.promise;
  finish.resolve();
  const cleanup=await Promise.race([stopped.promise,new Promise((_resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('未触发断连清理')),1000);timer.unref();})]);
  assert.equal(cleanup.request_id,'http-abort');
  assert.equal(cleanup.session_id,'session-a');
});

test('DELETE 响应体超时后保留归属，同 token 可重试且不自动重试',async()=>{
  let calls=0,signal;
  const service=createAvatarService(async(_url,options)=>{
    calls++;
    if(options.method==='POST')return Response.json(success());
    if(calls===2){signal=options.signal;return {ok:true,json:()=>new Promise(()=>{})};}
    return Response.json({error_code:0});
  },{...credentials,timeoutMs:20});
  const token=tokenOf(service);
  await service.session('POST',token,{request_id:'delete-timeout'});
  const stop={request_id:'delete-timeout',stop_reason:'destroy'};
  assert.deepEqual(await service.session('DELETE',token,stop),{status:502,value:{error:'数字人上游请求失败'}});
  assert.equal(signal.aborted,true);
  assert.equal(calls,2);
  assert.equal((await service.session('DELETE',token,stop)).status,200);
  assert.equal(calls,3);
});

test('server 默认读取环境凭据，显式 avatarOptions 完全隔离环境',async t=>{
  const previous={appId:process.env.XINGYUN_APP_ID,appSecret:process.env.XINGYUN_APP_SECRET};
  process.env.XINGYUN_APP_ID=credentials.appId;
  process.env.XINGYUN_APP_SECRET=credentials.appSecret;
  try{
    const server=createServer({fetchImpl:()=>assert.fail('配置阶段不应请求上游'),searchOptions:{braveApiKey:''}});
    await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
    t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const configured=await fetch(origin+'/api/avatar/config',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
    assert.equal(configured.status,200);
    const text=await configured.text();
    assert.equal(JSON.parse(text).appId,credentials.appId);
    assert.equal(text.includes(credentials.appSecret),false);
    const isolated=await client(t,()=>assert.fail('隔离实例不应请求上游'),{});
    assert.equal((await isolated.request('/api/avatar/config','POST')).status,503);
  }finally{
    if(previous.appId===undefined)delete process.env.XINGYUN_APP_ID;else process.env.XINGYUN_APP_ID=previous.appId;
    if(previous.appSecret===undefined)delete process.env.XINGYUN_APP_SECRET;else process.env.XINGYUN_APP_SECRET=previous.appSecret;
  }
});

test('CSP 保留 self/cloud，并允许官方 SDK、worker 和资源域名',async t=>{
  const api=await client(t,()=>assert.fail('不应请求上游'),{});
  const response=await api.get('/api/capabilities');
  const csp=response.headers.get('content-security-policy');
  for(const part of ["default-src 'self'",'https://cdn.jsdelivr.net','https://media.xingyun3d.com',"worker-src 'self' blob:","style-src 'self' 'unsafe-inline'",'https://buwan-learning.app.workbuddy.host','https://*.xingyun3d.com','wss://*.xingyun3d.com','https://*.youyan.xyz','wss://*.youyan.xyz'])assert.ok(csp.includes(part),part);
  for(const path of ['/.env','/.env.example','/avatar.mjs'])assert.equal((await api.get(path)).status,404);
  assert.notEqual((await api.get('/avatar.js')).status,404);
});

test('sign 只返回签名头与上游地址，不下发 App Secret',async t=>{
  const api=await client(t,()=>assert.fail('签名阶段不应请求上游'));
  const config=await api.config();
  const token=config.headers['X-Buwan-Avatar-Token'];
  const payload={request_id:'sign-1',gateway_type:'default',config:{framedata_proto_version:2,walk_version:3}};
  const response=await api.request('/api/avatar/sign','POST',payload,{'x-buwan-avatar-token':token});
  assert.equal(response.status,200);
  const signed=await response.json();
  assert.equal(signed.url,avatarEndpoint);
  assert.equal(signed.requestId,'sign-1');
  assert.equal(typeof signed.body,'string');
  assert.deepEqual(JSON.parse(signed.body),payload);
  assert.equal(signed.headers['X-APP-ID'],credentials.appId);
  assert.equal(typeof signed.headers['X-TOKEN'],'string');
  assert.equal(signed.headers['X-TOKEN'].length,32);
  const text=JSON.stringify(signed);
  assert.equal(text.includes(credentials.appSecret),false);
  assert.equal(text.includes('server-managed'),false);
});

test('sign 校验 token、request_id 与状态；activate 后才可停止会话',async t=>{
  const api=await client(t,()=>assert.fail('签名阶段不应请求上游'));
  const config=await api.config();
  const token=config.headers['X-Buwan-Avatar-Token'];
  const headers={'x-buwan-avatar-token':token};
  assert.equal((await api.request('/api/avatar/sign','POST',{request_id:'x'},{'x-buwan-avatar-token':'wrong'})).status,403);
  assert.equal((await api.request('/api/avatar/sign','POST',{request_id:''},headers)).status,400);
  assert.equal((await api.request('/api/avatar/sign','POST',{request_id:'r'.repeat(201)},headers)).status,400);
  assert.equal((await api.request('/api/avatar/sign','POST',{},headers)).status,400);
  assert.equal((await api.request('/api/avatar/sign','POST',{request_id:'ok-1'},headers)).status,200);
  assert.equal((await api.request('/api/avatar/sign','POST',{request_id:'ok-2'},headers)).status,409);
  // 同一 request_id 重复使用（SDK 重连场景）时换发新 ID 避开上游房间判重，原始 ID 仍记录在案
  const repeat=await api.request('/api/avatar/sign','POST',{request_id:'ok-1'},headers);
  assert.equal(repeat.status,200);
  const repeatId=(await repeat.json()).requestId;
  assert.notEqual(repeatId,'ok-1');
  assert.ok(repeatId.startsWith('ok-1-'));
  assert.equal((await api.request('/api/avatar/activated','POST',{request_id:'ok-1'},headers)).status,403);
  assert.equal((await api.request('/api/avatar/activated','POST',{request_id:repeatId},headers)).status,400);
  assert.equal((await api.request('/api/avatar/activated','POST',{request_id:repeatId,session_id:'sess-9'},headers)).status,200);
  assert.equal((await api.request('/api/avatar/activated','POST',{request_id:repeatId,session_id:'sess-9'},headers)).status,403);
  const stop=await api.request('/api/avatar/session','DELETE',{stop_reason:'用户关闭',request_id:'ok-1',session_id:'sess-9'},headers);
  assert.equal(stop.status,502);
});

test('sign/activate 强制同源与 JSON',async t=>{
  const api=await client(t,()=>assert.fail('不应请求上游'));
  const config=await api.config();
  const token=config.headers['X-Buwan-Avatar-Token'];
  const crossSite=await fetch(api.origin+'/api/avatar/sign',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json','x-buwan-avatar-token':token},body:'{}'});
  assert.equal(crossSite.status,403);
  const wrongType=await api.request('/api/avatar/activated','POST',{request_id:'r',session_id:'s'},{'x-buwan-avatar-token':token});
  assert.equal(wrongType.status,403);
  const notJson=await fetch(api.origin+'/api/avatar/sign',{method:'POST',headers:{origin:api.origin,'content-type':'text/plain','x-buwan-avatar-token':token},body:'{}'});
  assert.equal(notJson.status,415);
});
