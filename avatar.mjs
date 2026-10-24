import {createHash,randomBytes} from 'node:crypto';

export const avatarEndpoint='https://nebula-agent.xingyun3d.com/user/v1/ttsa/session';
const avatarPath='/user/v1/ttsa/session';
const assetPrefix='/api/avatar/asset/';
const assetOrigins=['https://public-xmov.oss-cn-hangzhou.aliyuncs.com/'];
const tokenTtl=30*60*1000;
const tokenLimit=100;
const usedRequestIdLimit=5000;
// 上游按 request_id 判重：已停止的房间再用同一 request_id 建会话会被拒（房间已关闭）。
// SDK 离线重连等场景会复用同一 request_id，故在签发侧换发新 ID，并记录客户端原始 ID 供停止时匹配。
const usedRequestIds=new Set();
function rememberRequestId(id){
  usedRequestIds.add(id);
  while(usedRequestIds.size>usedRequestIdLimit)usedRequestIds.delete(usedRequestIds.values().next().value);
}
function resolveRequestId(clientId){
  if(!usedRequestIds.has(clientId)){rememberRequestId(clientId);return clientId;}
  let candidate;
  do{candidate=`${clientId}-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;}
  while(usedRequestIds.has(candidate));
  rememberRequestId(candidate);
  return candidate;
}
const failure=()=>({status:502,value:{error:'数字人上游请求失败'}});
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validId=value=>typeof value==='string'&&Boolean(value.trim())&&value.length<=200;

function compareCodePoints(a,b){
  const left=Array.from(a,char=>char.codePointAt(0));
  const right=Array.from(b,char=>char.codePointAt(0));
  for(let i=0;i<Math.min(left.length,right.length);i++)if(left[i]!==right[i])return left[i]-right[i];
  return left.length-right.length;
}
function sorted(value){
  if(Array.isArray(value))return value.map(sorted);
  if(!isObject(value))return value;
  return Object.fromEntries(Object.keys(value).sort(compareCodePoints).map(key=>[key,sorted(value[key])]));
}
export function rewriteAssetUrls(value){
  if(typeof value==='string'){
    for(const origin of assetOrigins)if(value.startsWith(origin))return assetPrefix+value.slice(origin.length);
    return value;
  }
  if(Array.isArray(value))return value.map(rewriteAssetUrls);
  if(!isObject(value))return value;
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rewriteAssetUrls(item)]));
}
export function signAvatarRequest(appId,appSecret,method,value){
  const data=sorted(value);
  const canonical=JSON.stringify(data).replace(/[^\u0000-\u007e]/g,char=>`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`).replace(/ /g,'');
  const timestamp=String(Math.floor(Date.now()/1000));
  const digest=createHash('md5').update(avatarPath.toLowerCase()+method.toLowerCase()+canonical+appSecret+timestamp).digest('hex');
  return {data,headers:{'X-APP-ID':appId,'X-TOKEN':digest,'X-TIMESTAMP':timestamp}};
}
function cleanResponse(value,secrets){
  if(typeof value==='string')return secrets.some(secret=>secret&&value.includes(secret))?'[redacted]':value;
  if(Array.isArray(value))return value.map(item=>cleanResponse(item,secrets));
  if(!isObject(value))return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key])=>(key==='token'||!/(?:secret|token|password|credential|api[_-]?key|authorization|headers)/i.test(key))&&!secrets.some(secret=>secret&&key.includes(secret)))
    .map(([key,item])=>[key,cleanResponse(item,secrets)]));
}

export function createAvatarService(fetchImpl=fetch,{appId='',appSecret='',timeoutMs=20000}={}){
  const id=typeof appId==='string'?appId.trim():'';
  const secret=typeof appSecret==='string'?appSecret.trim():'';
  const configured=Boolean(id&&secret);
  const capability={configured,provider:'Xingyun3D',note:configured?'已配置服务端凭据，实际数字人服务尚未验收。':'未配置数字人服务端凭据。'};
  const tokens=new Map();
  function issueConfig(){
    if(!configured)return {status:503,value:{configured:false,error:'数字人未配置',missing:['XINGYUN_APP_ID','XINGYUN_APP_SECRET'].filter(name=>!({XINGYUN_APP_ID:id,XINGYUN_APP_SECRET:secret})[name])}};
    for(const [token,entry] of tokens)if(entry.expires<=Date.now())tokens.delete(token);
    if(tokens.size>=tokenLimit)return {status:429,value:{error:'数字人连接凭证数量已达上限，请稍后重试'}};
    const token=randomBytes(32).toString('hex');
    tokens.set(token,{expires:Date.now()+tokenTtl,state:'idle'});
    return {status:200,value:{configured:true,appId:id,gatewayServer:'/api/avatar/session',appSecret:'server-managed',headers:{'X-Buwan-Avatar-Token':token}}};
  }
  function entryFor(token){
    if(typeof token!=='string'||!token)return null;
    const entry=tokens.get(token);
    if(entry&&entry.expires<=Date.now()){tokens.delete(token);return null;}
    return entry||null;
  }
  async function upstream(method,payload,token,clientHeaders={}){
    const {data,headers}=signAvatarRequest(id,secret,method,payload);
    const forwarded={};
    for(const [name,value] of Object.entries(clientHeaders)){
      if(typeof value!=='string'||!value)continue;
      if(name==='origin')forwarded.Origin=value.slice(0,256);
      else if(name==='referer')forwarded.Referer=value.slice(0,512);
      else if(name==='user-agent')forwarded['User-Agent']=value.slice(0,256);
      else if(name==='accept')forwarded.Accept=value.slice(0,256);
      else if(name==='accept-language')forwarded['Accept-Language']=value.slice(0,128);
      else if(name==='cookie')forwarded.Cookie=value.slice(0,1024);
      else if(/^sec-/.test(name)||name==='priority'||name==='accept-encoding')forwarded[name]=value.slice(0,256);
    }
    const controller=new AbortController();let timer;
    try{
      const pending=(async()=>{
        const response=await fetchImpl(avatarEndpoint,{method,headers:{...headers,...forwarded,'Content-Type':'application/json'},body:JSON.stringify(data),signal:controller.signal,redirect:'error'});
        if(!response.ok)throw new Error('upstream status');
        return response.json();
      })();
      const timeout=new Promise((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('upstream timeout'));},timeoutMs);});
      const result=await Promise.race([pending,timeout]);
      if(!isObject(result)||(result.error_code!==undefined&&result.error_code!==0&&result.error_code!=='0')||(method==='POST'&&(!isObject(result.data)||!isObject(result.data.resource_pack))))throw new Error('upstream response');
      return cleanResponse(rewriteAssetUrls(result),[secret,token,headers['X-TOKEN']]);
    }finally{clearTimeout(timer);}
  }
  async function stop(token,entry,reason,clientHeaders){
    entry.state='stopping';
    try{
      const value=await upstream('DELETE',{stop_reason:reason,request_id:entry.requestId,...(entry.sessionId?{session_id:entry.sessionId}:{})},token,clientHeaders);
      tokens.delete(token);
      return {status:200,value};
    }catch{
      entry.state='active';
      return failure();
    }
  }
  async function release(token,clientHeaders){
    const entry=tokens.get(token);
    if(!entry)return;
    entry.abandoned=true;
    if(entry.state==='active')await stop(token,entry,'client_disconnected',clientHeaders);
    else if(entry.state==='idle')tokens.delete(token);
  }
  async function session(method,token,payload,clientHeaders={}){
    if(!configured)return {status:503,value:{error:'数字人未配置'}};
    const entry=entryFor(token);
    if(!entry)return {status:403,value:{error:'数字人会话凭证无效或已过期'}};
    if(!isObject(payload))return {status:400,value:{error:'需要JSON对象'}};
    if(method==='POST'){
      if(!validId(payload.request_id))return {status:400,value:{error:'request_id必须为非空字符串且不超过200字符'}};
      if(entry.state!=='idle')return {status:409,value:{error:'该凭证已有数字人会话'}};
      const effectiveId=resolveRequestId(payload.request_id);
      if([...tokens.values()].some(other=>other!==entry&&(other.requestId===effectiveId||other.clientRequestId===payload.request_id)))return {status:409,value:{error:'request_id已被使用'}};
      entry.state='starting';
      entry.requestId=effectiveId;
      entry.clientRequestId=payload.request_id;
      try{
        const value=await upstream(method,{...payload,request_id:effectiveId},token,clientHeaders);
        entry.state='active';
        entry.sessionId=typeof value.data.session_id==='string'?value.data.session_id:undefined;
        if(entry.abandoned)await stop(token,entry,'client_disconnected',clientHeaders);
        return {status:200,value};
      }catch{
        entry.state='idle';
        delete entry.requestId;
        delete entry.clientRequestId;
        if(entry.abandoned)tokens.delete(token);
        return failure();
      }
    }
    if(method!=='DELETE')return {status:405,value:{error:'方法不允许'}};
    if(entry.state!=='active')return {status:409,value:{error:'没有可停止的数字人会话'}};
    if(!validId(payload.stop_reason))return {status:400,value:{error:'stop_reason必须为非空字符串且不超过200字符'}};
    const requestMatches=payload.request_id===undefined||payload.request_id===entry.requestId||payload.request_id===entry.clientRequestId;
    if((payload.request_id===undefined&&payload.session_id===undefined)||!requestMatches||(payload.session_id!==undefined&&(!entry.sessionId||payload.session_id!==entry.sessionId)))return {status:403,value:{error:'会话不属于该凭证'}};
    return stop(token,entry,payload.stop_reason,clientHeaders);
  }
  // 直连架构：星云后端依据请求的 TLS/HTTP 特征判定客户端类型，服务端代建会话会被
  // 归类为 ttsa_backend_lite 而拒绝 WebSocket 接入。故改由浏览器持签名头直连建会话，
  // 服务端只签发签名头（App Secret 不出服务端）并代理资源，会话状态仍在此跟踪。
  async function sign(token,payload){
    if(!configured)return {status:503,value:{error:'数字人未配置'}};
    const entry=entryFor(token);
    if(!entry)return {status:403,value:{error:'数字人会话凭证无效或已过期'}};
    if(!isObject(payload))return {status:400,value:{error:'需要JSON对象'}};
    if(!validId(payload.request_id))return {status:400,value:{error:'request_id必须为非空字符串且不超过200字符'}};
    if(entry.state==='active')return {status:409,value:{error:'该凭证已有数字人会话'}};
    const effectiveId=resolveRequestId(payload.request_id);
    if(entry.state==='starting'&&entry.clientRequestId!==payload.request_id)return {status:409,value:{error:'该凭证已有数字人会话'}};
    if([...tokens.values()].some(other=>other!==entry&&(other.requestId===effectiveId||other.clientRequestId===payload.request_id)))return {status:409,value:{error:'request_id已被使用'}};
    entry.state='starting';
    entry.requestId=effectiveId;
    entry.clientRequestId=payload.request_id;
    const {data,headers}=signAvatarRequest(id,secret,'POST',{...payload,request_id:effectiveId});
    return {status:200,value:{url:avatarEndpoint,headers,body:JSON.stringify(data),requestId:effectiveId,clientRequestId:payload.request_id}};
  }
  async function activate(token,payload){
    const entry=entryFor(token);
    if(!entry)return {status:403,value:{error:'数字人会话凭证无效或已过期'}};
    if(!isObject(payload))return {status:400,value:{error:'需要JSON对象'}};
    if(!validId(payload.request_id)||payload.request_id!==entry.requestId||entry.state!=='starting')return {status:403,value:{error:'会话不属于该凭证'}};
    const sessionId=typeof payload.session_id==='string'?payload.session_id.trim():'';
    if(!sessionId||sessionId.length>200)return {status:400,value:{error:'session_id无效'}};
    entry.state='active';
    entry.sessionId=sessionId;
    if(entry.abandoned)await stop(token,entry,'client_disconnected');
    return {status:200,value:{ok:true}};
  }
  return {configured,capability,issueConfig,session,sign,activate,release};
}
