// Durée réelle de qwen3.8:27b en vision sur un bloc (5 images), raisonnement activé puis désactivé, sans délai client.
const fs = require('node:fs');
const [dir] = process.argv.slice(2);
const images = [0, 1, 2, 3, 4].map((i) => fs.readFileSync(`${dir}/frame-${i}.jpg`).toString('base64'));
const prompt = 'Décris en français, en deux phrases, ce que montrent ces images. Réponds uniquement en français.';
(async () => {
  for (const think of [true, false]) {
    const t0 = Date.now();
    const res = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', body: JSON.stringify({ model: 'qwen3.8:27b',
      stream: false, think, keep_alive: '2m', options: { temperature: 0, num_ctx: 8192 },
      messages: [{ role: 'user', content: prompt, images }] }) });
    const d = await res.json();
    console.log(JSON.stringify({ think, ms: Date.now() - t0, http: res.status, loadMs: Math.round((d.load_duration || 0) / 1e6),
      promptMs: Math.round((d.prompt_eval_duration || 0) / 1e6), evalMs: Math.round((d.eval_duration || 0) / 1e6),
      evalTokens: d.eval_count, thinkingChars: (d.message?.thinking || '').length, answer: (d.message?.content || '').slice(0, 220) }));
  }
  await fetch('http://127.0.0.1:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: 'qwen3.8:27b', keep_alive: 0 }) });
})();
