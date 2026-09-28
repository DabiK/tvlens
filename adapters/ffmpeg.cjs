const { spawn } = require('node:child_process');
function run(binary,args,signal) {
  signal?.throwIfAborted();
  return new Promise((resolve,reject) => {
    const child = spawn(binary,args,{stdio:['ignore','ignore','pipe'],shell:false});
    let error = '';
    const abort = () => child.kill('SIGKILL'); signal?.addEventListener('abort',abort,{once:true});
    child.stderr.on('data',b => { if (error.length < 2000) error += b.toString(); });
    child.on('error',() => { signal?.removeEventListener('abort',abort); reject(new Error('FFmpeg indisponible : installe-le pour réexaminer la vidéo.')); });
    child.on('close',code => { signal?.removeEventListener('abort',abort); if(signal?.aborted) reject(signal.reason); else if(code) reject(new Error('Impossible de décoder cet extrait vidéo.')); else resolve(); });
  });
}
module.exports={run};
