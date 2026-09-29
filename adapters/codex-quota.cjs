// Account usage is a separate budget from OpenRouter dollars. Reading does not infer a response.
class CodexQuota {
 constructor({now=Date.now}={}){Object.assign(this,{now});this.value=null;this.checkedAt=0;this.pending=null;}
 async read(rpc){
  if(this.pending)return this.pending;
  this.pending=rpc.request('account/rateLimits/read',{}).then(data=>{
   const entries=Object.values(data.rateLimitsByLimitId||{});if(!entries.length&&data.rateLimits)entries.push(data.rateLimits);
   const windows=entries.flatMap(e=>['primary','secondary'].flatMap(k=>e[k]?{limitId:e.limitId,window:k,usedPercent:e[k].usedPercent,remainingPercent:100-e[k].usedPercent,windowMinutes:e[k].windowDurationMins,resetsAt:e[k].resetsAt}:[]));
   this.checkedAt=this.now();return this.value={checkedAt:this.checkedAt,windows,ordinaryUsageAllowed:data.ordinaryUsageAllowed!==false};
  }).finally(()=>this.pending=null);return this.pending;
 }
 async check(rpc){
  // Informational only: provider limits are enforced by Codex, never by a local reserve.
  if(this.value&&this.now()-this.checkedAt<=60000)return this.value;
  try{return await this.read(rpc);}catch{
   this.checkedAt=this.now();this.value={...this.snapshot(),checkedAt:this.checkedAt,unavailable:true};return this.value;
  }
 }
 snapshot(){return this.value||{windows:[],checkedAt:null};}
}
module.exports={CodexQuota};
