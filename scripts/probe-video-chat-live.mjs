import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
// Real media decoded by Chromium; only the OS picker is substituted. No expected answer is sent to any model.
const bytes=await fs.readFile(process.argv[2]||'/tmp/tvlens-source-live.mp4');
const app=await electron.launch({args:['.','--smoke-test','--live-video-agent','--live-inspection','--live-observation','--retention-ms=45000'],executablePath:require('electron')});
let page;const report={date:new Date().toISOString(),fixture:'45 seconds of local Kennedy Rice video; Chromium playback stream, real recorder, local Whisper, Luna perception, persistent Codex chat and web. OS source picker substituted. No fixture descriptions or expected answers injected.',checks:{}};
async function waitFor(fn,timeout=90000){const start=Date.now();while(Date.now()-start<timeout){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out waiting for live test state');}
try{
 page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#source').value==='test-source');
 await page.evaluate(base64=>{navigator.mediaDevices.getDisplayMedia=async()=>{
  const data=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const video=document.createElement('video');video.src=URL.createObjectURL(new Blob([data],{type:'video/mp4'}));video.loop=true;video.muted=false;
  // Route actual decoded audio into a capture track without playing it through the room speakers.
  const audio=new AudioContext();const source=audio.createMediaElementSource(video),dest=audio.createMediaStreamDestination();source.connect(dest);await audio.resume();await video.play();
  const stream=video.captureStream();for(const track of stream.getAudioTracks())stream.removeTrack(track);stream.addTrack(dest.stream.getAudioTracks()[0]);
  window.__liveMedia={video,audio};return stream;
 };},bytes.toString('base64'));
 await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#preview').videoWidth>0);await page.locator('#observe').click();
 await waitFor(async()=>{const s=await page.evaluate(()=>window.tvlens.state());return s?.segments.filter(x=>x.status==='ready'&&x.observation?.transcript).length>=2;});
 console.log('Real transcription + perception ready');
 const initial=await page.evaluate(()=>window.tvlens.state());report.observations=initial.segments.filter(x=>x.status==='ready').map(({id,startMs,endMs,observation})=>({id,startMs,endMs,observation}));
 const saved=await page.evaluate(()=>window.tvlens.keepMoment());report.checks.bookmarkCreated=saved.moments.length>0;report.savedId=saved.id;
 await page.evaluate(()=>window.tvlens.startAuto({instruction:'Quand ce discours est identifiable, retrouve sa date dans une source externe, cite la source consultée et le passage vidéo qui permet de l’identifier.',frequencySeconds:15}));
 const send=async q=>{await page.locator('#question').fill(q);await page.locator('#send').click();};
 await send('Ça parle de quoi ?');await waitFor(async()=>(await page.evaluate(()=>window.tvlens.deepState())).jobs[0]?.status==='done');
 await send('Ça date de quand ce discours ?');await send('Lien de la source stp');await send('lien de l’article ?');
 await send('QUESTION À RETIRER');const queuedState=await page.evaluate(()=>window.tvlens.deepState());const removedId=queuedState.jobs.at(-1).id;await page.evaluate(id=>window.tvlens.cancelDeep(id),removedId);report.checks.targetedCancellation=(await page.evaluate(()=>window.tvlens.deepState())).jobs.at(-1).status==='cancelled';
 const pending=await page.evaluate(()=>window.tvlens.deepState());report.checks.queuedQuestions=pending.jobs.filter(x=>x.status==='queued').length===2;assert.ok(report.checks.queuedQuestions);
 await page.screenshot({path:'/tmp/tvlens-live-queue.png'});
 await waitFor(async()=>(await page.evaluate(()=>window.tvlens.deepState())).jobs.length===5&&(await page.evaluate(()=>window.tvlens.deepState())).jobs.every(x=>!['running','queued'].includes(x.status)),190000);
 const jobs=(await page.evaluate(()=>window.tvlens.deepState())).jobs.filter(j=>j.id!==removedId);report.jobs=jobs;
 const after=await page.evaluate(()=>window.tvlens.state());report.checks.captureContinued=after.segments.length>initial.segments.length;report.checks.noAutoCancellation=jobs.every(x=>x.status==='done');report.checks.oneThread=new Set(jobs.map(x=>x.result?.threadId)).size===1;
 report.checks.groundedTopic=jobs[0].result?.citations?.length>0;
 report.checks.externalSources=jobs.slice(1).every(x=>x.result?.sources?.length>0);
 report.checks.correctDate=/1962/.test(jobs[1].result?.answer||'');report.checks.noSummaryDump=jobs.every(x=>!x.result?.answer?.includes('D’après les résumés automatiques'));
 await page.screenshot({path:'/tmp/tvlens-live-sources.png'});
 console.log('Chat queue and sources complete');
 const searchResult=await page.evaluate(()=>window.tvlens.searchMoments('histoire progrès'));report.search=searchResult;report.checks.searchCards=searchResult.moments.length>0;
 await page.locator('#open-library').click();await page.waitForSelector('#saved-results .moment-card');await page.locator('#saved-results .moment-card button').first().click();await page.waitForFunction(()=>document.querySelector('#replay').readyState>=2);report.checks.savedReplay=true;await page.locator('#close-replay').click();await page.locator('#close-library').click();
 await waitFor(async()=>{const state=await page.evaluate(()=>window.tvlens.autoState());report.auto=state;return state.results.length>0;},90000);report.checks.autoExternalSources=report.auto.results.some(r=>r.result.sources?.length>0);report.checks.autoLinkedAfterActivation=report.auto.results.every(r=>r.startMs>=report.auto.activationMs&&r.result.citations.length>0);await page.evaluate(()=>window.tvlens.stopAuto());
 console.log('Auto produced linked result');
 const beforePause=await page.evaluate(()=>window.tvlens.state());await page.locator('#stop').click();await waitFor(async()=>!(await page.evaluate(()=>window.tvlens.state())).analyzing);
 await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#preview').videoWidth>0);await page.locator('#observe').click();const resumed=await page.evaluate(()=>window.tvlens.state());report.checks.pauseResume=resumed.id===beforePause.id;
 await send('Redonne-moi le lien de la source du discours');await waitFor(async()=>(await page.evaluate(()=>window.tvlens.deepState())).jobs.at(-1).status==='done');const resumedJob=(await page.evaluate(()=>window.tvlens.deepState())).jobs.at(-1);report.resumedJob=resumedJob;report.checks.threadAfterResume=resumedJob.result?.threadId===jobs[0].result?.threadId&&resumedJob.result?.sources?.length>0;
 const finalState=await page.evaluate(()=>window.tvlens.state());report.checks.expiredMedia=finalState.history.length>0;report.checks.bookmarkSurvivesExpiration=(await page.evaluate(()=>window.tvlens.savedMoments())).some(x=>x.id===saved.id);
 await page.evaluate(id=>window.tvlens.removeSaved(id),saved.id);report.checks.bookmarkDeleted=!(await page.evaluate(()=>window.tvlens.savedMoments())).some(x=>x.id===saved.id);
 report.quota=await page.evaluate(()=>window.tvlens.quota());report.budget=await page.evaluate(()=>window.tvlens.researchBudget());report.finalCapture={capturedThroughMs:finalState.capturedThroughMs,analyzedThroughMs:finalState.analyzedThroughMs,analysisLagMs:finalState.analysisLagMs,gaps:finalState.gaps};
 for(const [name,value]of Object.entries(report.checks))assert.ok(value,name);
 report.result='PASS';console.log(JSON.stringify({result:report.result,checks:report.checks,answers:jobs.map(j=>({question:j.question,answer:j.result?.answer,processingMs:j.finishedAt-j.startedAt,waitMs:j.startedAt-j.createdAt,sources:j.result?.sources?.length}))},null,2));
}catch(e){report.result='FAIL';report.error=e.message;if(page)report.state=await page.evaluate(()=>window.tvlens.deepState()).catch(()=>null);console.error(e);process.exitCode=1;}
finally{await fs.writeFile('docs/video-chat-live-'+Date.now()+'.json',JSON.stringify(report,null,2));await fs.writeFile('docs/video-chat-live.json',JSON.stringify(report,null,2));await app.close();}
