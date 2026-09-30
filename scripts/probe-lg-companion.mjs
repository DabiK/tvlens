// Read-only TV UI validation: opens a separate headless browser, never the TV panel.
// Requires a running authenticated host and real TV capture; no model responses mocked.
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root=process.env.TVLENS_SERVER_DATA||path.join(os.homedir(),'Documents/TVLens-private/server');
const token=(await fs.readFile(path.join(root,'device-token'),'utf8')).trim();
const url=process.env.TVLENS_SERVER_URL||'http://127.0.0.1:8787';
const request=async()=>fetch(url+'/v1/state',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
const before=await request();
assert.ok(before.session?.segments.length,'Capture réelle requise');
const browser=await chromium.launch({executablePath:process.env.TVLENS_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(config=>{window.TVLENS_REMOTE=config;},{url,token});
 await page.goto(pathToFileURL(path.resolve('tv/app/index.html')).href);
 await page.waitForFunction(()=>!document.querySelector('#send').disabled);
 await page.locator('#question').fill('Résume en une phrase ce dont parlent les intervenants dans le dernier passage disponible, en signalant les incertitudes.');
 await page.locator('#send').click();
 await page.waitForFunction(()=>document.querySelector('#question').value==='');
 await page.waitForFunction(()=>!document.querySelector('#send').disabled);
 await page.locator('#question').fill('Que voit-on dans ce même passage, indépendamment de ce qui est dit ?');
 await page.locator('#send').click();
 await page.waitForFunction(()=>document.querySelector('#question').value==='');
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('article small')).some(n=>n.textContent.includes('En file')));
 const deadline=Date.now()+130000;let state;
 do {
  state=await request();const jobs=state.chat.jobs.slice(before.chat.jobs.length);
  if(jobs.length===2&&jobs.every(j=>!['queued','running'].includes(j.status)))break;
  await new Promise(r=>setTimeout(r,500));
 }while(Date.now()<deadline);
 const jobs=state.chat.jobs.slice(before.chat.jobs.length);
 assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.status==='done'),'Les deux réponses doivent finir');
 assert.ok(jobs.every(j=>j.result.kind!=='insufficient'&&j.result.citations.length),'Réponses ancrées au contenu réel');
 assert.ok(jobs[1].startedAt>=jobs[0].finishedAt,'FIFO réelle');
 await page.waitForFunction(id=>{const card=document.querySelector('[data-job="'+id+'"]');return card&&card.textContent.includes('Terminé');},jobs[1].id);
 assert.deepEqual(errors,[]);
 assert.ok(await page.locator('aside').evaluate(n=>n.getBoundingClientRect().left===1440));
 await page.screenshot({path:path.join(root,'companion-live.png')});
 const report={result:'PASS',source:'Real YouTube TV capture + local transcription + Codex',jobs:jobs.map(j=>({id:j.id,status:j.status,anchorMs:j.anchorMs,metrics:j.metrics,result:j.result})),errors};
 await fs.writeFile(path.join(root,'companion-live-report.json'),JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({result:report.result,jobs:report.jobs.map(({result,...j})=>j),screenshot:path.join(root,'companion-live.png')}));
} finally {await browser.close();}
