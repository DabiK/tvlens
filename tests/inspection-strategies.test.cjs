const {test}=require('node:test');const assert=require('node:assert/strict');const sharp=require('sharp');
const {ContactSheetStrategy,makeSheet}=require('../adapters/inspection-strategies.cjs');
const {selectFrames}=require('../adapters/frame-selection.cjs');
async function frame(color,atMs){return {atMs,dataUrl:'data:image/png;base64,'+(await sharp({create:{width:120,height:80,channels:3,background:color}}).png().toBuffer()).toString('base64')};}
test('six cells remain chronological; fixed crop preserves identical timestamps and audio',async()=>{
 const frames=await Promise.all(Array.from({length:12},(_,i)=>frame(i%2?'red':'blue',i*100)));
 const roi={x:0.2,y:0.2,width:0.6,height:0.6};let calls=0;
 const audio=Buffer.from('unchanged aligned audio');
 const r=await new ContactSheetStrategy({crop:true}).prepare({question:'Couleur ?',segments:[{id:'m',startMs:0,endMs:1200,frames,audio}],model:{selectRegion:async()=>{calls++;return {region:roi,reason:'Centre visible',cost:0.001}}}});
 assert.equal(calls,1);assert.equal(r.cost,0.001);assert.equal(r.segments[0].audio,audio);
 const sheets=r.segments[0].sheets;assert.equal(sheets.length,4);
 for(let i=0;i<2;i++){assert.equal(sheets[i].times.length,6);assert.deepEqual(sheets[i].times,sheets[i+2].times);assert.deepEqual(sheets[i+2].region,roi);assert.ok(sheets[i].width<=1280&&sheets[i].height<=896);}
 const {data,info}=await sharp(Buffer.from(sheets[0].dataUrl.split(',')[1],'base64')).raw().toBuffer({resolveWithObject:true});
 // Cell centers read in left-to-right, top-to-bottom order; verify actual pixels, not labels only.
 for(let i=0;i<6;i++){const x=Math.floor((i%3+0.5)*info.width/3),y=Math.floor((Math.floor(i/3)+0.5)*info.height/2);const at=(y*info.width+x)*info.channels;assert.ok(i%2?data[at]>200:data[at+2]>200);}
});
test('adaptive selection retains before/after transition evidence, time coverage and the frame cap',async()=>{
 const frames=await Promise.all(Array.from({length:48},(_,i)=>frame(i===17||i===18?'red':'white',i*125)));
 const selected=await selectFrames(frames,12,{diverse:true});
 assert.equal(selected.length,12);assert.equal(selected[0].atMs,0);assert.equal(selected.at(-1).atMs,5875);
 for(const index of [16,17,18,19])assert.ok(selected.some(f=>f.atMs===frames[index].atMs));
 assert.ok(selected.slice(1).every((f,i)=>f.atMs-selected[i].atMs<=2000));
 const aborted=new AbortController();aborted.abort();await assert.rejects(selectFrames(frames,12,{diverse:true,signal:aborted.signal}));
});
test('cancellation during region selection prevents sending the final inspection evidence',async()=>{
 const frames=await Promise.all(Array.from({length:6},(_,i)=>frame('blue',i*100)));
 const controller=new AbortController();let release,entered;
 const gate=new Promise(resolve=>{release=resolve});
 const selecting=new Promise(resolve=>{entered=resolve});
 const task=new ContactSheetStrategy({crop:true}).prepare({question:'Objet ?',segments:[{id:'m',frames,audio:null}],signal:controller.signal,model:{selectRegion:async({signal})=>{entered();await gate;signal.throwIfAborted();return {region:null,cost:0}}}});
 await selecting;
 controller.abort();release();await assert.rejects(task);
});
test('invalid suggested crop degrades visibly to full views without a second selection call',async()=>{
 const frames=await Promise.all(Array.from({length:6},(_,i)=>frame('blue',i*100)));let calls=0;
 const r=await new ContactSheetStrategy({crop:true}).prepare({question:'Objet ?',segments:[{id:'m',frames,audio:null}],model:{selectRegion:async()=>{calls++;return {region:{x:0.9,y:0,width:0.8,height:1},cost:0.002,reason:'proposal'}}}});
 assert.equal(calls,1);assert.equal(r.cost,0.002);assert.equal(r.segments[0].sheets.length,1);assert.ok(r.metadata.warnings.length);assert.equal(r.metadata.region,null);
});
