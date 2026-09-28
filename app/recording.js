import {selectFrameCandidates,visualChange} from '../core/frame-policy.mjs';
export function encodeWav(chunks, sampleRate) {
  const count = chunks.reduce((sum, c) => sum + c.length, 0);
  const bytes = new ArrayBuffer(44 + count * 2), view = new DataView(bytes);
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
  let index = 44;
  for (const chunk of chunks) for (const sample of chunk) { const v = Math.max(-1, Math.min(1, sample)); view.setInt16(index, v < 0 ? v * 32768 : v * 32767, true); index += 2; }
  return new Uint8Array(bytes);
}
export class RollingRecorder {
  constructor({ stream, video, audioContext, flushAudio, session, onError }) {
    Object.assign(this, { stream, video, audioContext, flushAudio, session, onError });
    this.origin = performance.now() - session.elapsedMs;
    this.canvas = document.createElement('canvas'); this.canvas.width = 768;
    this.deltaCanvas=document.createElement('canvas');this.deltaCanvas.width=64;this.deltaCanvas.height=36;this.deltaContext=this.deltaCanvas.getContext('2d',{willReadFrequently:true});
    this.active = false; this.pending = new Set(); this.rotating = null;
  }
  now() { return performance.now() - this.origin; }
  samples(samples) { if (this.current) this.current.audio.push(samples); }
  start() { this.active = true; this.begin(); }
  begin() {
    const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('Enregistrement WebM indisponible.');
    const recorder = new MediaRecorder(this.stream, { mimeType, videoBitsPerSecond: 1000000, audioBitsPerSecond: 64000 });
    const item = { recorder, startMs: this.now(), frames: [], candidates:[], previousPixels:null, audio: [], blobs: [] };
    this.current = item;
    recorder.ondataavailable = event => { if (event.data.size) item.blobs.push(event.data); };
    recorder.onerror = () => { this.onError('L’enregistrement du passage a échoué.'); this.stop(); };
    recorder.start(); this.frame();
    this.framesTimer = setInterval(() => this.frame(), Math.min(400, this.session.segmentMs / 3));
    this.segmentTimer = setTimeout(() => { this.rotating = this.finish().finally(() => { this.rotating = null; }); }, this.session.segmentMs);
  }
  frame() {
    if (!this.current || this.current.candidates.length >= 64 || !this.video.videoWidth) return;
    this.canvas.height = Math.max(2, Math.round(768 * this.video.videoHeight / this.video.videoWidth));
    this.canvas.getContext('2d').drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    this.deltaContext.drawImage(this.video,0,0,64,36);const pixels=this.deltaContext.getImageData(0,0,64,36).data;const change=visualChange(this.current.previousPixels,pixels);this.current.previousPixels=pixels;
    this.current.candidates.push({atMs:this.now(),change,dataUrl:this.canvas.toDataURL('image/jpeg',0.7)});
  }
  async finish() {
    clearInterval(this.framesTimer); clearTimeout(this.segmentTimer);
    const item = this.current;
    if (!item) return;
    await this.flushAudio();
    this.frame();item.frames=selectFrameCandidates(item.candidates).map(({atMs,dataUrl})=>({atMs,dataUrl}));
    const endMs = this.now(); this.current = null;
    const recorded = new Promise(resolve => { item.recorder.onstop = resolve; });
    if (item.recorder.state !== 'inactive') item.recorder.stop(); else return;
    await recorded;
    if (this.active) this.begin();
    if (endMs - item.startMs < 350 || !item.frames.length) return;
    if (this.pending.size >= 2) { this.onError('Stockage en retard : un passage n’a pas pu être conservé.'); return; }
    const submit = async () => {
      const clip = new Uint8Array(await new Blob(item.blobs, { type: 'video/webm' }).arrayBuffer());
      const audio = item.audio.length ? encodeWav(item.audio, this.audioContext.sampleRate) : null;
      await window.tvlens.ingest({ sessionId: this.session.id, startMs: item.startMs, endMs, frames: item.frames, audio, clip });
    };
    const task = submit().catch(error => this.onError(error.message));
    this.pending.add(task); task.finally(() => this.pending.delete(task));
  }
  async stop() {
    this.active = false;
    if (this.rotating) await this.rotating;
    else await this.finish();
    await Promise.all(this.pending);
  }
}
