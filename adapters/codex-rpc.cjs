const {spawn}=require('node:child_process');
class CodexRpc {
 constructor({binary,args,cwd,env,onEvent,onRequest}){Object.assign(this,{binary,args,cwd,env,onEvent,onRequest});this.pending=new Map();this.sequence=0;}
 start(){
  const child=this.child=spawn(this.binary,this.args,{cwd:this.cwd,env:this.env,stdio:['pipe','pipe','pipe'],shell:false,detached:process.platform!=='win32'});let buffer='';
  child.stdout.on('data',b=>{buffer+=b.toString();if(buffer.length>4000000)return this.close();let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{this.receive(JSON.parse(line));}catch{}}});
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
 close(){const child=this.child;this.child=null;if(child){try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}}this.fail();}
}
module.exports={CodexRpc};
