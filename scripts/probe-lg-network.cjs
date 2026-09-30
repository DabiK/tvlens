// Isolated fault proxy: does not alter TV Internet, VPN, YouTube or host firewall.
// Use a separate private capture config pointing to this port for a bounded test.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = process.env.TVLENS_SERVER_DATA || path.join(os.homedir(), 'Documents/TVLens-private/server');
const token = fs.readFileSync(path.join(root, 'device-token'), 'utf8').trim();
let faultUntil = 0, injected = false;
const report = { forwarded: 0, duplicates: 0, outages: 0, droppedAcknowledgements: 0 };
const server = http.createServer(async (req, res) => {
  if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401); return res.end('{}'); }
  if (Date.now() < faultUntil) { report.outages++; res.writeHead(503); return res.end('{}'); }
  try {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 13000000) throw Error('Body too large'); chunks.push(chunk); }
    const upstream = await fetch('http://127.0.0.1:8787' + req.url, {method:req.method,
      headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json'},
      body:req.method === 'GET' ? undefined : Buffer.concat(chunks), signal:AbortSignal.timeout(10000)});
    const body = await upstream.text();
    if (req.url === '/v1/segments' && upstream.ok) {
      report.forwarded++;
      if (JSON.parse(body).duplicate) report.duplicates++;
      if (!injected) {
        injected = true; faultUntil = Date.now() + 12000; report.droppedAcknowledgements++;
        res.writeHead(503); return res.end('{}');
      }
    }
    res.writeHead(upstream.status, {'Content-Type':'application/json'}); res.end(body);
  } catch (_) { res.writeHead(503); res.end('{}'); }
});
server.listen(8789, '0.0.0.0', () => console.log('Isolated test proxy ready on 8789; expires after 90 seconds.'));
setTimeout(() => {
  fs.writeFileSync(path.join(root, 'network-fault-report.json'), JSON.stringify(report, null, 2), {mode:0o600});
  console.log(JSON.stringify(report));server.closeAllConnections();server.close();
}, 90000);
