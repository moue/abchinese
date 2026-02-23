const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (t.startsWith('#') || !t) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

// Import the API handler
const apiHandler = require('./api/index.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    try { req.body = JSON.parse(body || '{}'); } catch { req.body = {}; }
    res.json = (obj) => {
      res.writeHead(res.statusCode || 200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };
    res.status = (code) => { res.statusCode = code; return res; };
    await apiHandler(req, res);
    return;
  }

  if (req.method === 'GET') {
    const rawPath = req.url.split('?')[0];
    if (/^\/s\/[a-z0-9]+$/i.test(rawPath)) {
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
      return;
    }
    const urlPath = rawPath === '/' ? '/index.html' : rawPath;
    const filePath = path.join(__dirname, urlPath);
    const ext = path.extname(filePath);
    if (ext && !filePath.includes('..') && fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('http://localhost:' + PORT));
