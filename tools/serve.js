/* dist/web を http で配信する小さなサーバー(開発・テスト用)。
   node tools/serve.js [port]  → http://localhost:8080/ */
const http = require('http');
const fs = require('fs');
const path = require('path');

// --debug で dist/debug(ビジュアル確認ツール)を配信する
const ROOT = path.join(__dirname, '..', 'dist', process.argv.includes('--debug') ? 'debug' : 'web');
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json' };

function start(port){
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if(p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, path.normalize(p));
    if(!file.startsWith(ROOT)){ res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if(err){ res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise(r => server.listen(port || 0, '127.0.0.1', () => r(server)));
}

// テストから: const url = await require('../serve').url();
async function url(){
  if(!url.server){ url.server = await start(0); url.server.unref(); }
  return `http://127.0.0.1:${url.server.address().port}/`;
}

module.exports = { start, url };

if(require.main === module){
  const port = Number(process.argv.find(a => /^\d+$/.test(a))) || 8080;
  start(port).then(() => console.log(`serving ${path.relative(path.join(__dirname, '..'), ROOT)} at http://localhost:${port}/`));
}
