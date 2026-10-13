const {spawn}=require('node:child_process');
const KILL_AFTER_MS=3000;
const EXIT_GRACE_MS=300;
// Groups sent SIGTERM whose escalation is still due. The escalation timer never keeps the host alive, so a
// host that exits within KILL_AFTER_MS of a close() would drop it: what is left is killed as the host exits.
// Covers process.exit() and a normal end; a host that is itself killed runs nothing.
const escalations=new Set();
let exitHooked=false;
// Nothing asynchronous runs any more when the host exits. Codex ends within milliseconds of a SIGTERM (measured:
// 3 to 18 ms) and must be left to: what was just closed gets EXIT_GRACE_MS, waited for synchronously, then the kill.
function atHostExit(){
 const due=[...escalations];if(!due.length)return;
 const until=Date.now()+EXIT_GRACE_MS;let cell;try{cell=new Int32Array(new SharedArrayBuffer(4));}catch{}
 while(cell&&Date.now()<until&&due.some(entry=>entry.alive())){try{Atomics.wait(cell,0,0,10);}catch{break;}}
 for(const entry of due)entry.kill();
}
class CodexRpc {
 constructor({binary,args,cwd,env,onEvent,onRequest}){Object.assign(this,{binary,args,cwd,env,onEvent,onRequest});this.pending=new Map();this.sequence=0;}
 start(){
  const child=this.child=spawn(this.binary,this.args,{cwd:this.cwd,env:this.env,stdio:['pipe','pipe','pipe'],shell:false,detached:process.platform!=='win32'});let buffer='';
  // Decode as a stream: an accented character split across two pipe chunks must stay intact.
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',b=>{buffer+=b;if(buffer.length>4000000)return this.close();let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{this.receive(JSON.parse(line));}catch{}}});
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  child.on('error',()=>this.fail());child.on('exit',()=>this.fail());return this;
 }
 send(value){if(!this.child?.stdin.writable)throw Error('Codex déconnecté.');this.child.stdin.write(JSON.stringify(value)+'\n');}
 request(method,params={},timeoutMs=15000){const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`Codex : délai de connexion dépassé (${method}).`));},timeoutMs);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
 receive(message){
  if(message.method&&message.id!==undefined){Promise.resolve(this.onRequest?.(message.method,message.params)).then(result=>this.send({id:message.id,result:result||{}})).catch(()=>{try{this.send({id:message.id,error:{code:-32601,message:'Action non autorisée.'}});}catch{}});return;}
  if(message.method){this.onEvent?.(message.method,message.params);return;}
  const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);if(message.error)pending.reject(Error('Codex : requête refusée. Vérifie le modèle sélectionné et la connexion.'));else pending.resolve(message.result);
 }
 fail(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Connexion Codex interrompue.'));}this.pending.clear();this.onEvent?.('connection/closed',{});}
 // SIGTERM to the whole process group, then SIGKILL to whatever is left of it after KILL_AFTER_MS, or
 // when the host exits if that comes first (after a short grace): a Codex that ignores the first signal
 // must not outlive the turn it was closed for, nor the host. The timer is dropped as soon as the group is gone, and never
 // keeps the host alive.
 close(){
  const child=this.child;this.child=null;
  if(child){
   const group=signal=>{try{process.kill(-child.pid,signal);return true;}catch{return false;}};
   if(!child.pid||!group('SIGTERM'))child.kill();
   if(child.pid&&child.exitCode===null&&child.signalCode===null){
    const entry={alive:()=>group(0),kill:()=>{clearTimeout(timer);escalations.delete(entry);if(!group('SIGKILL'))child.kill('SIGKILL');}};
    const timer=setTimeout(entry.kill,KILL_AFTER_MS);timer.unref?.();
    escalations.add(entry);
    if(!exitHooked){exitHooked=true;process.on('exit',atHostExit);}
    child.once('exit',()=>{if(!group(0)){clearTimeout(timer);escalations.delete(entry);}});
   }
  }
  this.fail();
 }
}
module.exports={CodexRpc};
