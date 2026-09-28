// Account usage is a separate budget from OpenRouter dollars. Reading does not infer a response.
class CodexQuota {
 constructor({minimumRemaining=55,now=Date.now}={}){Object.assign(this,{minimumRemaining,now});this.value=null;this.checkedAt=0;this.pending=null;}
 async read(rpc){
  if(this.pending)return this.pending;
  this.pending=rpc.request('account/rateLimits/read',{}).then(data=>{
   const entries=Object.values(data.rateLimitsByLimitId||{});if(!entries.length&&data.rateLimits)entries.push(data.rateLimits);
   const windows=entries.flatMap(e=>['primary','secondary'].flatMap(k=>e[k]?{limitId:e.limitId,window:k,usedPercent:e[k].usedPercent,remainingPercent:100-e[k].usedPercent,windowMinutes:e[k].windowDurationMins,resetsAt:e[k].resetsAt}:[]));
   this.checkedAt=this.now();return this.value={checkedAt:this.checkedAt,minimumRemaining:this.minimumRemaining,windows,ordinaryUsageAllowed:data.ordinaryUsageAllowed!==false};
  }).finally(()=>this.pending=null);return this.pending;
 }
 async check(rpc){
  const value=!this.value||this.now()-this.checkedAt>60000?await this.read(rpc):this.value;
  if(!value.windows.length)throw Error('Quota Codex indisponible : inférence suspendue pour préserver la réserve.');
  if(!value.ordinaryUsageAllowed||value.windows.some(w=>w.remainingPercent<=this.minimumRemaining))throw Error(`Réserve Codex atteinte : au moins ${this.minimumRemaining} % doivent rester disponibles. Inférence suspendue.`);
  return value;
 }
 snapshot(){return this.value||{minimumRemaining:this.minimumRemaining,windows:[],checkedAt:null};}
}
module.exports={CodexQuota};
