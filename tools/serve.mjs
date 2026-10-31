// Minimal static server for the film pages (ES modules need http, not file://).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm' };
export function serve(port = 0) {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(root)) { rsp.writeHead(403); return rsp.end(); }
      fs.readFile(p, (err, data) => {
        if (err) { rsp.writeHead(404); return rsp.end('nf'); }
        rsp.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        rsp.end(data);
      });
    });
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}
if (process.argv[1] && process.argv[1].endsWith('serve.mjs')) {
  const s = await serve(+process.argv[2] || 8123);
  console.log('serving on', s.address().port);
}
