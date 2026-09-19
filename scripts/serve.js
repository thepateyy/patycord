// Zero-dependency static file server for browser-testing ui/ without Tauri.
// Needed because renderer.js is now an ES module (`type="module"`), which
// browsers refuse to load over file:// — this serves it over http:// instead,
// with correct MIME types (.wasm in particular needs application/wasm).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'ui');
const PORT = process.env.PORT || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const reqPath = decodeURIComponent(req.url.split('?')[0]);
  const resolved = path.normalize(path.join(ROOT, reqPath === '/' ? '/index.html' : reqPath));

  // Don't serve anything outside ui/, however the request tries to get there.
  if (!resolved.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Serving ui/ at http://localhost:${PORT}`);
});
