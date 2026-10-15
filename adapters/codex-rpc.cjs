const {spawn}=require('node:child_process');
const KILL_AFTER_MS=3000;
const EXIT_GRACE_MS=300;
// Once its launcher has left, nothing reports the end of what is left of a group: it is looked at every WATCH_MS.
// REAP_MS is how long after the SIGKILL close() still waits before it answers that the group is not seen gone.
const WATCH_MS=50;
const REAP_MS=1000;
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
// One owner for the process group of a launcher, from its spawn until that group is seen empty. The stop it hands
// back sends SIGTERM to the whole group, then SIGKILL to whatever is left of it after KILL_AFTER_MS, or when the
// host exits if that comes first (after a short grace): a Codex that ignores the first signal must not outlive the
// turn it was closed for, nor the host. It resolves true once the group is seen empty, false when it still is not
// REAP_MS after the kill; asked again after that, it looks once more and sends nothing. A launcher that leaves by
// itself is stopped the same way when it leaves something behind. The timers never keep the host alive and are
// dropped as soon as the group is gone: once the launcher has left, only they bring the answer, so whoever awaits it
// keeps its host alive meanwhile (the client does). A group seen empty is never signalled again: its number could
// by then belong to another process.
function own(child){
 let gone=false,over=false,ended=null,settle=()=>{},killTimer,watchTimer;
 const send=signal=>{try{process.kill(-child.pid,signal);return true;}catch{return false;}};
 // Only "no such process" says that the group is empty: one that cannot be signalled is still there. Where a child
 // gets no group of its own (Windows), its launcher is all there is to see.
 const present=()=>{if(process.platform==='win32')return false;try{process.kill(-child.pid,0);return true;}catch(error){return error?.code!=='ESRCH';}};
 const running=()=>child.exitCode===null&&child.signalCode===null;
 const entry={alive:present,kill:()=>{if(!send('SIGKILL'))child.kill('SIGKILL');}};
 const settled=confirmed=>{over=true;clearTimeout(killTimer);clearTimeout(watchTimer);escalations.delete(entry);settle(confirmed);};
 // The launcher belongs to its group: while it runs the group is not empty, and is not even asked.
 const look=()=>{if(!gone&&!running()&&!present()){gone=true;settled(true);}return gone;};
 const watch=()=>{clearTimeout(watchTimer);watchTimer=setTimeout(()=>{if(!look())watch();},WATCH_MS);watchTimer.unref?.();};
 const kill=()=>{entry.kill();killTimer=setTimeout(()=>{if(!look())settled(false);},REAP_MS);killTimer.unref?.();};
 const stop=()=>{
  if(look())return Promise.resolve(true);
  return ended||=new Promise(resolve=>{
   settle=resolve;
   if(!send('SIGTERM'))child.kill();
   killTimer=setTimeout(kill,KILL_AFTER_MS);killTimer.unref?.();
   escalations.add(entry);
   if(!exitHooked){exitHooked=true;process.on('exit',atHostExit);}
  });
 };
 child.once('exit',()=>{if(look()||over)return;stop();watch();});
 return stop;
}
class CodexRpc {
 constructor({binary,args,cwd,env,onEvent,onRequest,onFault}){
  Object.assign(this,{binary,args,cwd,env,onEvent,onRequest,onFault});
  this.pending=new Map();
  this.sequence=0;
 }
 start(){
  const child=this.child=spawn(this.binary,this.args,{cwd:this.cwd,env:this.env,stdio:['pipe','pipe','pipe'],shell:false,detached:process.platform!=='win32'});let buffer='';
  // Heard before anything is read from the child: a spawn the system refuses hands back a child without a pid, and
  // without pipes when it ran out of descriptors, and only says so on the next tick. Unheard, that would end the host.
  child.on('error',()=>this.fail());
  if(child.pid)this.left=own(child);
  child.on('exit',()=>this.fail());
  // Decode as a stream: an accented character split across two pipe chunks must stay intact.
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data',b=>{
   buffer+=b;
   if(buffer.length>4000000)return this.close();
   let index;
   while((index=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,index);
    buffer=buffer.slice(index+1);
    let message;
    try{message=JSON.parse(line);}
    catch{
     // Le binaire peut mêler une sortie parasite aux messages JSON-RPC.
     continue;
    }
    this.receive(message);
   }
  });
  child.stderr?.on('data',()=>{});child.stdin?.on('error',()=>{});
  return this;
 }
 send(value){if(!this.child?.stdin?.writable)throw Error('Codex déconnecté.');this.child.stdin.write(JSON.stringify(value)+'\n');}
 request(method,params={},timeoutMs=15000){const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`Codex : délai de connexion dépassé (${method}).`));},timeoutMs);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
 receive(message){
  if(!message||typeof message!=='object')return;
  if(message.method&&message.id!==undefined){
   try{
    Promise.resolve(this.onRequest?.(message.method,message.params))
     .then(result=>this.send({id:message.id,result:result||{}}))
     .catch(()=>{
      try{this.send({id:message.id,error:{code:-32601,message:'Action non autorisée.'}});}
      catch{
       // Une connexion déjà fermée ne peut plus recevoir la réponse de refus.
      }
     });
   }catch{
    // Une connexion remplacée refuse synchroniquement : on ne répond plus sur l'ancienne.
   }
   return;
  }
  if(message.method){
   try{this.onEvent?.(message.method,message.params);}
   catch(error){
    try{this.onFault?.(error,message.method);}
    catch{
     // Un rappel de diagnostic défaillant ne doit pas arrêter la lecture des notifications suivantes.
    }
   }
   return;
  }
  const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);if(message.error)pending.reject(Error('Codex : requête refusée. Vérifie le modèle sélectionné et la connexion.'));else pending.resolve(message.result);
 }
 fail(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Connexion Codex interrompue.'));}this.pending.clear();this.onEvent?.('connection/closed',{});}
 // Ends the process group this transport started (see own) and answers whether it was seen gone. The signal is sent
 // and the pending requests are rejected before this returns; the answer comes once the group has left, within the
 // bound. Closed again, it answers for the same group.
 close(){
  const child=this.child;this.child=null;
  // No pid: the spawn was refused, and there is no group.
  if(child&&!this.left)child.kill();
  const gone=this.left?this.left():Promise.resolve(true);
  this.fail();
  return gone;
 }
}
module.exports={CodexRpc};
