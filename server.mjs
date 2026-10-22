import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const port=Number(process.env.PORT||4173);
const searchConfigured=false;
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function sameOrigin(req){
  if(req.headers['sec-fetch-site']==='cross-site')return false;
  const origin=req.headers.origin;
  const source=origin||req.headers.referer;
  if(!source)return false;
  try{const url=new URL(source);return url.host===req.headers.host&&['http:','https:'].includes(url.protocol);}catch{return false;}
}
async function body(req,max=32*1024){
  let raw='';
  for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>max){const error=new Error('请求内容过大');error.status=413;throw error;}}
  try{return JSON.parse(raw);}catch{const error=new Error('JSON格式不正确');error.status=400;throw error;}
}
function cleanString(value,max){return typeof value==='string'?value.slice(0,max):'';}
function validateResult(result){
  if(!result||typeof result!=='object'||Array.isArray(result)){
    const error=new Error('result必须是JSON对象');error.status=400;throw error;
  }
  const output={};
  for(const key of ['title','story','goal','worry','answer','first_lesson','share_text']){
    output[key]=cleanString(result[key],2000);
  }
  output.examples=['当前没有可核验的真人案例；请勿将示例内容视为真人经历。'];
  output.resources=[];
  const plan=Array.isArray(result.plan)?result.plan.map(item=>({title:item?.goal,action:item?.task})):Array.isArray(result.plan4)?result.plan4:[];
  output.plan4=Array.from({length:4},(_,index)=>{
    const item=plan[index];
    if(item&&typeof item==='object'&&!Array.isArray(item))return {title:cleanString(item.title,120)||`第 ${index+1} 步`,action:cleanString(item.action,500)||'根据实际情况补充这一小步。'};
    return {title:`第 ${index+1} 步`,action:'占位建议：结合自己的时间与条件，确定一个可执行的小行动。'};
  });
  return output;
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; connect-src 'self' https://buwan-learning.app.workbuddy.host; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&path==='/api/health')return json(res,200,{status:'up',product:'不晚',searchConfigured,aiEnhancement:'由前端云模型SDK提供；服务端不提供通用模型代理。'});
  if(req.method==='POST'&&['/api/search','/api/validate-result'].includes(path)){
    if(!sameOrigin(req))return json(res,403,{error:'来源不允许'});
    if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))return json(res,415,{error:'需要JSON输入'});
    try{
      const input=await body(req);
      if(path==='/api/search'){
        if(!Array.isArray(input?.queries)||input.queries.length>3||input.queries.some(query=>typeof query!=='string'||query.length>200))return json(res,400,{error:'queries必须是最多3个、每个不超过200字符的字符串'});
        return json(res,503,{configured:false,note:'联网搜索尚未接通',results:[]});
      }
      return json(res,200,{result:validateResult(input?.result)});
    }catch(error){return json(res,error.status||500,{error:error.message||'请求失败'});}
  }
  const routes={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/b1-logo.png':['b1-logo.png','image/png']};
  if(req.method==='GET'&&routes[path]){
    try{const [file,type]=routes[path];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(await readFile(root+file));}
    catch{return json(res,500,{error:'页面资源读取失败'});}
  }
  return json(res,404,{error:'未找到'});
});
server.listen(port,'0.0.0.0',()=>console.log(`不晚 ready on port ${port}`));
