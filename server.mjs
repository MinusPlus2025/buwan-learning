import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSearch} from './search.mjs';
import {createAvatarService} from './avatar.mjs';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const port=Number(process.env.PORT||4173);
const host=process.env.HOST||'127.0.0.1';
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function requestHosts(req){
  const candidates=[req.headers.host,req.headers['x-forwarded-host'],req.headers[':authority']];
  return candidates
    .filter(Boolean)
    .flatMap(value=>String(value).split(','))
    .map(value=>value.trim())
    .filter(Boolean);
}
// 透传浏览器请求头给上游：星云后端依据 Origin/UA/sec-fetch 等头
// 判定客户端类型，缺省时会把会话归类为后端类型而拒绝 WebSocket 接入。
const HOP_BY_HOP=new Set(['host','connection','content-length','transfer-encoding','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','upgrade','x-buwan-avatar-token','x-forwarded-for','x-forwarded-proto','x-real-ip']);
function pickClientHeaders(headers){
  const picked={};
  for(const [name,value] of Object.entries(headers||{})){
    if(HOP_BY_HOP.has(name))continue;
    if(Array.isArray(value)){if(value.length)picked[name]=value.join(', ');continue;}
    if(typeof value==='string')picked[name]=value;
  }
  return picked;
}
// 部署网关（CloudStudio）把 Host 改写成内部地址，且不回传 x-forwarded-host / :authority，
// 公网域名的 Origin 永远匹配不上请求头宿主。除请求头住格外，额外接受已知公网域名
// （可用 PUBLIC_ORIGINS 覆盖，逗号分隔）；跨源、cross-site、缺来源仍一律拦截。
const publicOrigins=(process.env.PUBLIC_ORIGINS||'buwan-learning.app.workbuddy.host')
  .split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
function sameOrigin(req){
  if(req.headers['sec-fetch-site']==='cross-site')return false;
  const origin=req.headers.origin;
  const source=origin||req.headers.referer;
  if(!source)return false;
  try{
    const url=new URL(source);
    if(!['http:','https:'].includes(url.protocol))return false;
    const host=url.host.toLowerCase();
    return requestHosts(req).some(value=>value.toLowerCase()===host)||publicOrigins.includes(host);
  }catch{return false;}
}
async function body(req,max=32*1024){
  let raw='';
  for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>max){const error=new Error('请求内容过大');error.status=413;throw error;}}
  try{return JSON.parse(raw);}catch{const error=new Error('JSON格式不正确');error.status=400;throw error;}
}
const textFields=['title','story','goal','worry','answer','first_lesson'];
const maxTextLength=2000;
const maxPlanTitleLength=200;
const maxPlanActionLength=1000;
function invalidResult(message){const error=new Error(message);error.status=422;throw error;}
function requiredString(value,label,max){
  if(typeof value!=='string'||!value.trim())invalidResult(`${label}必须是非空字符串`);
  const clean=value.trim();
  if(clean.length>max)invalidResult(`${label}超过${max}字符限制`);
  return clean;
}
function validatePlanItem(item,index,format){
  if(!item||typeof item!=='object'||Array.isArray(item))invalidResult(`${format}[${index}]必须是对象`);
  const title=requiredString(format==='plan' ? item.goal : item.title,`${format}[${index}].${format==='plan'?'goal':'title'}`,maxPlanTitleLength);
  const action=requiredString(format==='plan' ? item.task : item.action,`${format}[${index}].${format==='plan'?'task':'action'}`,maxPlanActionLength);
  return {title,action};
}
function isSwimmingInput(input,result){
  const values=[input?.interest,input?.text,...textFields.map(key=>result?.[key])];
  const planValues=[...(Array.isArray(result?.plan)?result.plan:[]),...(Array.isArray(result?.plan4)?result.plan4:[])].flatMap(item=>item&&typeof item==='object'?Object.values(item):[]);
  return [...values,...planValues].some(value=>typeof value==='string'&&value.includes('游泳'));
}
function isNegated(text,index){
  const before=text.slice(0,index).split(/[。！？；，\n]|但是|但|不过|然而|然后/u).at(-1);
  return /(?:不要|不应|不宜|不建议|不推荐|不可以|不能|不可|不得|切勿|勿|别|避免|禁止|严禁)(?:再|进行|尝试|练习|安排|去|在任何时候|\s|、|和|或)*(?:(?:独自下水|一个人下水|单独下水)(?:、|和|或|以及))?$/u.test(before);
}
function validateSwimmingSafety(input,result,plan4){
  if(!isSwimmingInput(input,result))return;
  const safetyText=[result.first_lesson,...plan4.map(item=>`${item.title} ${item.action}`)];
  const unsafe=/(?:独自|一个人|单独)[^。！？；\n]{0,12}下水|下水[^。！？；\n]{0,12}(?:独自|一个人|单独)|憋气(?:训练|练习)|练习憋气/gu;
  for(const value of safetyText){
    for(const match of value.matchAll(unsafe))if(!isNegated(value,match.index))invalidResult('游泳内容不得建议独自下水或憋气训练');
  }
  const required='请在正规泳馆等正规场所，由教练或救生员陪同进行；服务端不对真实世界安全作保证。';
  const firstLesson=/正规(?:泳馆|场所)/u.test(result.first_lesson)&&/(?:教练|救生员).{0,8}陪同/u.test(result.first_lesson)?result.first_lesson:`${result.first_lesson} ${required}`;
  return {firstLesson,plan4:plan4.map(item=>({title:item.title,action:/正规(?:泳馆|场所)/u.test(item.action)&&/(?:教练|救生员).{0,8}陪同/u.test(item.action)?item.action:`${item.action} ${required}`}))};
}
function validateResult(result,input={},getResources=()=>[]){
  if(!result||typeof result!=='object'||Array.isArray(result)){
    const error=new Error('result必须是JSON对象');error.status=422;throw error;
  }
  const output={};
  for(const key of textFields)output[key]=requiredString(result[key],key,maxTextLength);
  if(Object.hasOwn(result,'share_text'))output.share_text=requiredString(result.share_text,'share_text',maxTextLength);
  const hasPlan=Array.isArray(result.plan);
  const hasPlan4=Array.isArray(result.plan4);
  if(hasPlan===hasPlan4)invalidResult('必须提供plan或plan4其中一个数组');
  const format=hasPlan?'plan':'plan4';
  const source=result[format];
  if(source.length!==4)invalidResult(`${format}必须恰好包含4项`);
  const plan4=source.map((item,index)=>validatePlanItem(item,index,format));
  const safety=validateSwimmingSafety(input,result,plan4);
  if(safety){
    output.first_lesson=safety.firstLesson;
    output.plan4=safety.plan4;
  }else output.plan4=plan4;
  const resources=getResources(input.searchId);
  if(resources.length)output.resources=resources;
  return output;
}
export function createServer({fetchImpl=fetch,searchOptions={braveApiKey:process.env.BRAVE_SEARCH_API_KEY},avatarOptions={appId:process.env.XINGYUN_APP_ID,appSecret:process.env.XINGYUN_APP_SECRET}}={}){
  const searchService=createSearch(fetchImpl,searchOptions);
  const avatarService=createAvatarService(fetchImpl,avatarOptions);
  const {provider:searchProvider,scope:searchScope,webSearchConfigured}=searchService;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob: https://*.xingyun3d.com https://*.youyan.xyz; media-src 'self' data: blob: https://*.xingyun3d.com https://*.youyan.xyz; script-src 'self' blob: https://cdn.jsdelivr.net https://media.xingyun3d.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://buwan-learning.app.workbuddy.host https://*.xingyun3d.com wss://*.xingyun3d.com https://*.youyan.xyz wss://*.youyan.xyz; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const path=new URL(req.url,'http://localhost').pathname;
    if(req.method==='GET'&&path==='/api/health')return json(res,200,{status:'up',product:'不晚',searchConfigured:true,searchProvider,searchScope,webSearchConfigured,aiEnhancement:'由前端云模型SDK提供；服务端不提供通用模型代理。'});
    if(req.method==='GET'&&path==='/api/capabilities')return json(res,200,{search:{configured:true,provider:searchProvider,scope:searchScope,webSearchConfigured},avatar:avatarService.capability});
    if((req.method==='POST'&&['/api/avatar/config','/api/avatar/sign','/api/avatar/activated'].includes(path))||(['POST','DELETE'].includes(req.method)&&path==='/api/avatar/session')){
      if(!sameOrigin(req))return json(res,403,{error:'来源不允许'});
      if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))return json(res,415,{error:'需要JSON输入'});
      const token=req.headers['x-buwan-avatar-token'];
      const clientHeaders=pickClientHeaders(req.headers);
      const disconnected=()=>{if(!res.writableFinished)void avatarService.release(token,clientHeaders);};
      try{
        const input=await body(req);
        if(path==='/api/avatar/config'){
          const result=avatarService.issueConfig();
          return json(res,result.status,result.value);
        }
        res.once('close',disconnected);
        if(path==='/api/avatar/sign'){
          const result=await avatarService.sign(token,input);
          if(res.destroyed)return;
          return json(res,result.status,result.value);
        }
        if(path==='/api/avatar/activated'){
          const result=await avatarService.activate(token,input);
          if(res.destroyed)return;
          return json(res,result.status,result.value);
        }
        const result=await avatarService.session(req.method,token,input,clientHeaders);
        if(res.destroyed)return;
        return json(res,result.status,result.value);
      }catch(error){
        if(res.destroyed)return;
        return json(res,[400,413].includes(error.status)?error.status:502,{error:[400,413].includes(error.status)?error.message:'数字人请求失败'});
      }
    }
    if(req.method==='GET'&&path.startsWith('/api/avatar/asset/')){
      const assetPath=path.slice('/api/avatar/asset/'.length);
      if(!/^avatar_sdk_prod\/[\w\-./]+$/.test(assetPath)||assetPath.includes('..'))return json(res,403,{error:'不允许的资源路径'});
      try{
        const headers={};
        if(req.headers.range)headers.Range=req.headers.range;
        const response=await fetchImpl('https://public-xmov.oss-cn-hangzhou.aliyuncs.com/'+assetPath,{headers,redirect:'error'});
        if(process.env.AVATAR_ASSET_DEBUG)console.log('[asset]',assetPath.slice(0,80),'->',response.status,response.headers.get('content-length')||'');
        if(!response.ok&&response.status!==206)return json(res,response.status===404?404:502,{error:'资源获取失败'});
        const length=response.headers.get('content-length');
        const range=response.headers.get('content-range');
        res.writeHead(response.status,{
          'Content-Type':response.headers.get('content-type')||'application/octet-stream',
          ...(length?{'Content-Length':length}:{}),
          ...(range?{'Content-Range':range}:{}),
          'Accept-Ranges':'bytes',
          'Cache-Control':'public, max-age=86400'
        });
        if(response.body)Readable.fromWeb(response.body).pipe(res);
        else res.end();
      }catch{return json(res,502,{error:'资源代理失败'});}
      return;
    }
    if(req.method==='POST'&&['/api/search','/api/validate-result'].includes(path)){
      if(!sameOrigin(req))return json(res,403,{error:'来源不允许'});
      if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))return json(res,415,{error:'需要JSON输入'});
      try{
        const input=await body(req);
        if(path==='/api/search'){
          if(!Array.isArray(input?.queries)||input.queries.length<1||input.queries.length>3||input.queries.some(query=>typeof query!=='string'||!query.trim()||query.length>200)||input.interest!==undefined&&(typeof input.interest!=='string'||input.interest.trim().length>80))return json(res,400,{error:'queries必须是最多3个非空字符串（每个不超过200字符），interest不超过80字符'});
          const result=await searchService.search(input);
          return json(res,result.results.length?200:503,{...result,...(!result.results.length?{configured:false}: {})});
        }
        return json(res,200,{result:validateResult(input?.result,input,searchService.getResources)});
      }catch(error){return json(res,error.status||500,{error:error.message||'请求失败'});}
    }
    const routes={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/avatar.js':['avatar.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/design.css':['design.css','text/css; charset=utf-8'],'/b1-logo.png':['b1-logo.png','image/png']};
    if(req.method==='GET'&&routes[path]){
      try{const [file,type]=routes[path];const content=await readFile(root+file);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(content);}
      catch{return json(res,500,{error:'页面资源读取失败'});}
    }
    return json(res,404,{error:'未找到'});
  });
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=createServer();
  server.listen(port,host,()=>console.log(`不晚 ready on ${host}:${port}`));
}
