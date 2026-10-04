// Only numeric timings leave this adapter. Whisper stderr may contain speech.
function whisperDiagnostics(stderr) {
  const metrics = {};
  for (const name of ['load', 'mel', 'sample', 'encode', 'decode', 'batchd', 'prompt', 'total']) {
    const match = stderr.match(new RegExp('whisper_print_timings:\\s*' + name + ' time\\s*=\\s*([0-9.]+) ms'));
    if (match) metrics[name + 'Ms'] = Number(match[1]);
  }
  const fallbacks = stderr.match(/whisper_print_timings:\s*fallbacks\s*=\s*(\d+) p\s*\/\s*(\d+) h/);
  if (fallbacks) {
    metrics.logprobFallbacks = Number(fallbacks[1]);
    metrics.entropyFallbacks = Number(fallbacks[2]);
  }
  return metrics;
}
module.exports = { whisperDiagnostics };
