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
// A page is identified without its fragment: two links to the same page must collapse into one source.
function sourceKey(value) {
  const href = safeExternalUrl(value);
  if (!href) return null;
  const url = new URL(href);
  url.hash = '';
  return url.href;
}
module.exports = { safeExternalUrl, sourceKey };
