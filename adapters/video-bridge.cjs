const { videoToolNames } = require('../core/video-tool-contracts.cjs');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
class VideoBridge {
  constructor({descriptor,makeTools}){Object.assign(this,{descriptor,makeTools});this.scopes=new Map();this.external=new Map();this.master=randomBytes(32).toString('hex');}
  async start(){
    this.server=http.createServer(async(req,res)=>{
      const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
      if(req.method!=='POST'||req.url!=='/tool'||req.headers.origin) return send(403,{error:'Accès refusé.'});
      const token=req.headers.authorization?.replace(/^Bearer /,'');
      let scope=this.scopes.get(token);
      if(!scope&&token!==this.master)return send(401,{error:'Capacité MCP invalide ou expirée.'});
      try {
        let raw=''; for await (const chunk of req){raw+=chunk;if(raw.length>12000)throw new Error('Requête trop volumineuse.');}
        const {name,args}=JSON.parse(raw);
        if(!videoToolNames.includes(name))throw new Error('Outil inconnu.');
        if(!scope){
          const client=req.headers['x-tvlens-client'];if(typeof client!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(client))throw new Error('Client MCP invalide.');
          scope=this.external.get(client);
          if(!scope||scope.signal.aborted){
            if(name!=='search_moments')throw new Error('Commence par search_moments pour ouvrir un contexte de 60 secondes.');
            if(this.external.size>=4&&!scope)throw new Error('Trop de clients MCP.');
            const controller=new AbortController();scope={tools:this.makeTools(controller.signal),signal:controller.signal,controller};
            scope.timer=setTimeout(()=>{controller.abort(new Error('Contexte MCP expiré.'));this.external.delete(client);},60000);scope.timer.unref();this.external.set(client,scope);
          }
        }
        scope.signal.throwIfAborted();
        const output=await scope.tools.call(name,args);scope.signal.throwIfAborted();send(200,output);
      }catch(error){send(400,{error:error.message});}
    });
    await new Promise(resolve=>this.server.listen(0,'127.0.0.1',resolve));
    this.url=`http://127.0.0.1:${this.server.address().port}/tool`;
    await fs.mkdir(path.dirname(this.descriptor),{recursive:true,mode:0o700});
    await fs.writeFile(this.descriptor,JSON.stringify({url:this.url,token:this.master}),{mode:0o600});
    return this;
  }
  async register(tools,signal,file){const token=randomBytes(32).toString('hex');this.scopes.set(token,{tools,signal});await fs.writeFile(file,JSON.stringify({url:this.url,token}),{mode:0o600});const revoke=()=>this.scopes.delete(token);signal.addEventListener('abort',revoke,{once:true});return()=>{revoke();signal.removeEventListener('abort',revoke);};}
  async close(){for(const scope of this.external.values()){clearTimeout(scope.timer);scope.controller.abort();}this.external.clear();this.scopes.clear();this.server?.closeAllConnections();await new Promise(resolve=>this.server?this.server.close(resolve):resolve());await fs.rm(this.descriptor,{force:true});}
}
module.exports={VideoBridge};
