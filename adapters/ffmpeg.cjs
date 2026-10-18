const { spawn } = require('node:child_process');
// A file the decoder refuses is told apart from a decoder that is not there, or that was killed (close with no exit
// code): only the first says something of the file.
const DECODE_FAILED='FFMPEG_DECODE';
function run(binary,args,signal,{captureStderr=false}={}) {
  signal?.throwIfAborted();
  return new Promise((resolve,reject) => {
    const child = spawn(binary,args,{stdio:['ignore','ignore','pipe'],shell:false});
    let error = '', diagnostics = '', truncated = false;
    const abort = () => child.kill('SIGKILL'); signal?.addEventListener('abort',abort,{once:true});
    child.stderr.on('data',b => {
      if (error.length < 2000) error += b.toString();
      if (captureStderr) {
        const limit = 65536;
        const text = b.toString();
        if (diagnostics.length + text.length > limit) truncated = true;
        diagnostics = (diagnostics + text).slice(0, limit);
      }
    });
    child.on('error',() => { signal?.removeEventListener('abort',abort); reject(Object.assign(new Error('FFmpeg indisponible : installe-le pour réexaminer la vidéo.'),{code:'FFMPEG_MISSING'})); });
    child.on('close',code => {
      signal?.removeEventListener('abort',abort);
      if(signal?.aborted) reject(signal.reason);
      else if(code) reject(Object.assign(new Error('Impossible de décoder cet extrait vidéo.'),{code:DECODE_FAILED,detail:error.trim().slice(0,400)}));
      else if(code===null) reject(Object.assign(new Error('Le décodeur vidéo s’est arrêté avant la fin.'),{code:'FFMPEG_KILLED'}));
      else resolve(captureStderr ? { stderr: diagnostics, truncated } : undefined);
    });
  });
}
module.exports={run,DECODE_FAILED};
