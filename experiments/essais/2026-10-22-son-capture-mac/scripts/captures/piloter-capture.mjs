// Drives one TVLens capture through the DevTools port: picks the source, observes, pauses, reports the window state.
// Usage: node piloter-capture.mjs <source regex> <seconds> <report.json>
import fs from 'node:fs';
const [pattern, seconds, out] = process.argv.slice(2);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function pageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const page = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(t => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page;
    } catch { /* the app is still starting: retried below */ }
    await sleep(500);
  }
  throw new Error('page TVLens introuvable sur le port 9333');
}
const ws = new WebSocket((await pageTarget()).webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));
let id = 0;
const evaluate = expression => new Promise(resolve => {
  const mine = ++id;
  const onMessage = event => {
    const m = JSON.parse(event.data);
    if (m.id === mine) { ws.removeEventListener('message', onMessage); resolve(m.result?.result?.value); }
  };
  ws.addEventListener('message', onMessage);
  ws.send(JSON.stringify({ id: mine, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
});
const snapshot = () => evaluate(`JSON.stringify({
  mode: document.getElementById('mode').textContent,
  state: document.getElementById('state').textContent,
  notice: document.getElementById('notice').textContent,
  audioWarning: !document.getElementById('audio-warning').hidden,
  placeholder: document.getElementById('source').options[0]?.text,
})`).then(JSON.parse);
const report = { pattern, seconds: Number(seconds), startedAt: new Date().toISOString(), samples: [] };
for (let i = 0; i < 40 && (await evaluate(`document.getElementById('source').options.length`)) < 2; i++) await sleep(500);
report.beforeSelection = await snapshot();
report.source = await evaluate(`(() => {
  const select = document.getElementById('source');
  const option = [...select.options].find(o => o.value && new RegExp(${JSON.stringify(pattern)}).test(o.text));
  if (!option) return null;
  select.value = option.value; select.dispatchEvent(new Event('change'));
  return option.text;
})()`);
if (report.source) {
  for (let i = 0; i < 40 && (await evaluate(`document.getElementById('observe').disabled`)); i++) await sleep(500);
  await evaluate(`document.getElementById('observe').click()`);
  for (let t = 0; t < Number(seconds); t += 5) { await sleep(5000); report.samples.push({ t: t + 5, ...(await snapshot()) }); }
  await evaluate(`document.getElementById('stop').click()`);
  await sleep(30000);
}
report.final = await snapshot();
report.endedAt = new Date().toISOString();
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ source: report.source, audioWarningSeen: report.samples.some(s => s.audioWarning), final: report.final }));
ws.close();
