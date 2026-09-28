const net = require('node:net');
function safeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !host.includes('.') || net.isIP(host) || host.startsWith('[') || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}
module.exports = { safeExternalUrl };
