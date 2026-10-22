const port=Number(process.env.PORT||4173);
const endpoint=process.env.HEALTH_URL||`http://127.0.0.1:${port}/api/health`;
try{
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(5000)});
  const health=await response.json();
  const ok=response.ok&&health.status==='up'&&health.product==='不晚';
  console.log(JSON.stringify({ok,status:response.status,health},null,2));
  if(!ok)process.exitCode=1;
}catch(error){
  console.error(JSON.stringify({ok:false,error:error.message}));
  process.exitCode=1;
}
