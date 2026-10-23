import {randomUUID} from 'node:crypto';

export const searchProvider='Wikipedia';
export const searchScope='Wikipedia 公开知识页面检索，不是全网或课程搜索';
export const searchEndpoint='https://zh.wikipedia.org/w/rest.php/v1/search/page';
export const braveSearchEndpoint='https://api.search.brave.com/res/v1/web/search';
const braveProvider='Brave';
const braveScope='Brave Web Search 全网网页检索，结果不代表已核验案例或课程';
const cacheTtl=10*60*1000;
const cacheLimit=100;

function cleanExcerpt(value){
  return String(value||'').replace(/<[^>]*>/gu,' ').replace(/&(?:amp|lt|gt|quot|#39|nbsp);/giu,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&nbsp;':' '}[entity.toLowerCase()]||' ')).replace(/\s+/gu,' ').trim().slice(0,500);
}
function safeUrl(value){
  if(typeof value!=='string')return null;
  try{
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;
  }catch{return null;}
}

export function createSearch(fetchImpl=fetch,{timeoutMs=8000,braveApiKey=''}={}){
  const apiKey=typeof braveApiKey==='string'?braveApiKey.trim():'';
  const webSearchConfigured=Boolean(apiKey);
  const provider=webSearchConfigured?braveProvider:searchProvider;
  const scope=webSearchConfigured?braveScope:searchScope;
  const cache=new Map();
  const prune=()=>{
    const now=Date.now();
    for(const [id,item] of cache)if(item.expires<=now)cache.delete(id);
    while(cache.size>cacheLimit)cache.delete(cache.keys().next().value);
  };
  async function request(term,useBrave){
    const url=new URL(useBrave?braveSearchEndpoint:searchEndpoint);
    url.searchParams.set('q',term);
    if(useBrave){url.searchParams.set('count','3');url.searchParams.set('safesearch','strict');}
    else url.searchParams.set('limit','3');
    const controller=new AbortController();let timer;
    try{
      const responseBody=(async()=>{
        const response=await fetchImpl(url,{headers:useBrave?{'X-Subscription-Token':apiKey,'Accept':'application/json'}:{'User-Agent':'BuwanLearning/1.0 (learning-resource-search)','Accept':'application/json'},signal:controller.signal,redirect:'error'});
        if(!response.ok)throw new Error('search provider unavailable');
        return response.json();
      })();
      const timeout=new Promise((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('search timeout'));},timeoutMs);});
      const data=await Promise.race([responseBody,timeout]);
      const pages=useBrave?data?.web?.results:data?.pages;
      if(!Array.isArray(pages))throw new Error('invalid search response');
      const items=[];
      for(const page of pages){
        if(typeof page?.title!=='string'||!page.title.trim())continue;
        const url=useBrave?safeUrl(page.url):typeof page.key==='string'?`https://zh.wikipedia.org/wiki/${encodeURIComponent(page.key)}`:null;
        const snippet=cleanExcerpt(useBrave?page.description:page.excerpt||page.description);
        const title=cleanExcerpt(page.title);
        if(!url||!title||!snippet)continue;
        if(apiKey&&[title,snippet,url].some(value=>value.includes(apiKey)))continue;
        items.push({title,snippet,url,provider:useBrave?braveProvider:searchProvider,scope:useBrave?braveScope:searchScope});
        if(items.length>=3)break;
      }
      return items;
    }finally{clearTimeout(timer);}
  }
  async function search({queries,interest}={}){
    const terms=[...queries];
    if(typeof interest==='string'&&interest.trim()&&interest.trim().length<=80)terms.push(interest.trim());
    const unique=[...new Set(terms.map(term=>term.trim()).filter(Boolean))].slice(0,4);
    const results=[];
    let cursor=0;let fallbackCount=0;
    const worker=async()=>{
      while(cursor<unique.length){
        const term=unique[cursor++];
        let items=[];
        try{items=await request(term,webSearchConfigured);}
        catch{
          if(webSearchConfigured){
            fallbackCount+=1;
            try{items=await request(term,false);}catch{}
          }
        }
        for(const item of items){
          if(results.length>=12)break;
          if(!results.some(existing=>existing.url===item.url))results.push(item);
        }
      }
    };
    await Promise.all([worker(),worker(),worker()]);
    const sources=new Set(results.map(item=>item.provider));
    const mixed=sources.size>1;
    const actualProvider=mixed?'Brave + Wikipedia':results[0]?.provider||(fallbackCount?searchProvider:provider);
    const actualScope=mixed?'部分结果来自 Brave 全网网页检索，部分来自 Wikipedia 公开知识页面；Wikipedia 部分不是全网或课程搜索':actualProvider===braveProvider?braveScope:searchScope;
    let note=fallbackCount?`Brave 有 ${fallbackCount} 个查询失败，已降级尝试 Wikipedia 公开知识页面检索（不是全网或课程搜索）。`:webSearchConfigured?'结果来自 Brave Web Search，摘要仅供阅读参考，不代表已核验案例或课程。':'结果来自 Wikipedia 公开页面，摘要仅供阅读参考，不代表已核验案例或课程。';
    if(!results.length)return {configured:true,provider:actualProvider,scope:actualScope,note:`${note} 暂时没有检索到可用页面，请稍后重试。`,results:[]};
    if(fallbackCount)note+=' 摘要仅供阅读参考，不代表已核验案例或课程。';
    prune();
    const searchId=randomUUID();
    cache.set(searchId,{expires:Date.now()+cacheTtl,results});prune();
    return {configured:true,provider:actualProvider,scope:actualScope,note,searchId,results};
  }
  function getResources(searchId){
    prune();
    const entry=typeof searchId==='string'?cache.get(searchId):null;
    return entry?entry.results.slice(0,6).map(item=>({...item})):[];
  }
  return {search,getResources,provider,scope,webSearchConfigured};
}
