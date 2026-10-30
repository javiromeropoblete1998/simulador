// Servidor mínimo para usar el simulador en una red local SIN internet (por ejemplo en el portátil del aula).
// Sirve los archivos de la carpeta tal cual (index.html, config.js, sw.js, iconos...) y, además,
// retransmite mensajes entre dispositivos de la misma sala por WebSocket (/ws?room=CODIGO).
// Sin dependencias: solo necesita Node.js 18 o superior.   Uso:  node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/healthz') { res.end('ok'); return; }
  const name = p === '/' ? 'index.html' : path.normalize(p).replace(/^([/\\]|\.\.)+/, '');
  const file = path.join(__dirname, name);
  if (!file.startsWith(__dirname) || /server\.js$|package\.json$/.test(file)) { res.writeHead(404); res.end('No encontrado'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('No encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

function frame(op, d) {
  const l = d.length; let h;
  if (l < 126) h = Buffer.from([128 | op, l]);
  else if (l < 65536) { h = Buffer.alloc(4); h[0] = 128 | op; h[1] = 126; h.writeUInt16BE(l, 2); }
  else { h = Buffer.alloc(10); h[0] = 128 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(l), 2); }
  return Buffer.concat([h, d]);
}
function parse(b) {
  if (b.length < 2) return null;
  const op = b[0] & 15; let len = b[1] & 127, o = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); o = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); o = 10; }
  const masked = b[1] & 128; if (masked) o += 4;
  if (b.length < o + len) return null;
  const data = Buffer.from(b.subarray(o, o + len));
  if (masked) { const k = b.subarray(o - 4, o); for (let i = 0; i < len; i++) data[i] ^= k[i & 3]; }
  return { op, data, n: o + len };
}

srv.on('upgrade', (req, sock) => {
  const u = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  const room = (u.searchParams.get('room') || '').toUpperCase().slice(0, 8);
  if (u.pathname !== '/ws' || !key || !room) { sock.destroy(); return; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  sock.setNoDelay(true);
  let set = rooms.get(room); if (!set) { set = new Set(); rooms.set(room, set); }
  set.add(sock);
  let buf = Buffer.alloc(0);
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    if (buf.length > 1e6) { sock.destroy(); return; }
    for (;;) {
      const f = parse(buf); if (!f) break;
      buf = buf.subarray(f.n);
      if (f.op === 8) { sock.end(frame(8, Buffer.alloc(0))); return; }
      if (f.op === 9) { sock.write(frame(10, f.data)); continue; }
      if (f.op === 1 || f.op === 2) { const out = frame(1, f.data); for (const o of set) if (o !== sock && !o.destroyed) o.write(out); }
    }
  });
  const bye = () => { set.delete(sock); if (!set.size) rooms.delete(room); };
  sock.on('close', bye); sock.on('error', () => sock.destroy());
});

setInterval(() => { for (const set of rooms.values()) for (const s of set) if (!s.destroyed) s.write(frame(9, Buffer.alloc(0))); }, 25000);
srv.listen(PORT, () => console.log('Simulador en http://localhost:' + PORT));
