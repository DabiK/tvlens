const { executable } = require('../adapters/system-paths.cjs');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {spawnSync}=require('node:child_process');
(async()=>{
 const binary=executable('codex', {override:process.env.TVLENS_CODEX_BINARY});
 const script=path.resolve(__dirname,'..','mcp','server.cjs');
 const existing=spawnSync(binary,['mcp','get','tvlens','--json'],{encoding:'utf8',shell:false});
 if(existing.error)throw new Error('Codex CLI introuvable. Installe-le ou définis TVLENS_CODEX_BINARY.');
 if(existing.status===0){const entry=JSON.parse(existing.stdout);if(entry.transport?.args?.includes(script)){console.log('TVLens MCP est déjà configuré.');return;}throw new Error('Un serveur nommé tvlens existe déjà avec une autre configuration : conservation de cette entrée.');}
 const config=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'config.toml');
 try{await fs.copyFile(config,`${config}.tvlens-backup-${Date.now()}`);}catch(error){if(error.code!=='ENOENT')throw error;}
 const result=spawnSync(binary,['mcp','add','tvlens','--',process.execPath,script],{encoding:'utf8',shell:false});
 if(result.status!==0)throw new Error('Configuration MCP non terminée. Vérifie codex mcp add --help.');
 console.log('Serveur tvlens ajouté à Codex. Aucun secret API dans la configuration. Redémarre les sessions Codex déjà ouvertes pour découvrir les outils.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
