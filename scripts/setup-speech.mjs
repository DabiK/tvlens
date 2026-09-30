import systemPaths from '../adapters/system-paths.cjs';
import fs from 'node:fs/promises';import path from 'node:path';import {createReadStream,createWriteStream} from 'node:fs';import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const expected='60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe';
const model=path.resolve(process.env.TVLENS_WHISPER_MODEL || '.local/models/ggml-base.bin');
const binary=systemPaths.executable('whisper-cli',{override:process.env.TVLENS_WHISPER_BINARY});
if(spawnSync(binary,['--help'],{stdio:'ignore'}).error){
 if(process.platform!=='darwin')throw Error('Installe whisper.cpp et ajoute whisper-cli au PATH, ou définis TVLENS_WHISPER_BINARY. Voir docs/server-installation.md.');
 const result=spawnSync('brew',['install','whisper-cpp'],{stdio:'inherit',env:{...process.env,HOMEBREW_NO_AUTO_UPDATE:'1'}});
 if(result.status!==0)throw Error('Installe whisper.cpp avec Homebrew ou définis TVLENS_WHISPER_BINARY.');
}
async function hash(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
await fs.mkdir(path.dirname(model),{recursive:true});
if(await hash(model).catch(()=>null)!==expected){const response=await fetch('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin');if(!response.ok)throw Error('Téléchargement Whisper indisponible.');await pipeline(Readable.fromWeb(response.body),createWriteStream(model+'.tmp',{mode:0o600}));if(await hash(model+'.tmp')!==expected){await fs.rm(model+'.tmp');throw Error('Empreinte du modèle inattendue.');}await fs.rename(model+'.tmp',model);}
console.log('Whisper multilingue prêt : '+model);
