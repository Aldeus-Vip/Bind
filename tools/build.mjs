/* 元のプロトタイプ(src/original)に 3D アダプタとオンライン対戦を注入して dist/ を作る。
   元ファイルには一切手を入れない。

   使い方(リポジトリのルートで):
     node tools/build.mjs            → dist/web/   Web 公開用(画像は別ファイル、three.js / PeerJS は同梱)
     node tools/build.mjs --single   → dist/bind_3d_game.html  1ファイル版(画像は data URI、ライブラリは CDN)

   Web 版は http(s) で配信すること(file:// では WebGL がテクスチャを読めない)。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const single = process.argv.includes('--single');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const CDN = {
  three: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  gltf: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  skel: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js',
  peer: 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js',
};
const LOCAL = {
  three: 'vendor/three.min.js',
  gltf: 'vendor/GLTFLoader.js',
  skel: 'vendor/SkeletonUtils.js',
  peer: 'vendor/peerjs.min.js',
};
const VENDOR_SRC = {
  three: 'node_modules/three/build/three.min.js',
  gltf: 'node_modules/three/examples/js/loaders/GLTFLoader.js',
  skel: 'node_modules/three/examples/js/utils/SkeletonUtils.js',
  peer: 'node_modules/peerjs/dist/peerjs.min.js',
};

let s = read('src/original/bind_prototype.html');
const css = read('src/adapter.css') + '\n' + read('src/online.css');
const js = [read('src/adapter.js'), read('src/models.js'), read('src/online.js')];

s = s.replace('<title>Bind — プロトタイプ</title>', '<title>Bind 3D</title>');
s = s.replace('</head>',
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap" rel="stylesheet">\n</head>');
const i = s.indexOf('</head>'), j = s.lastIndexOf('</style>', i);
s = s.slice(0, j) + css + s.slice(j);

const src = single ? CDN : LOCAL;
const tags =
  `<script src="${src.three}"></script>\n` +
  `<script src="${src.gltf}"></script>\n` +
  `<script src="${src.skel}"></script>\n` +
  `<script src="${src.peer}"></script>\n` +
  js.map(code => `<script>\n${code}\n</script>\n`).join('');
const k = s.lastIndexOf('</body>');
s = s.slice(0, k) + tags + s.slice(k);

if(single){
  const out = path.join(root, 'dist', 'bind_3d_game.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, s);
  const size = Buffer.byteLength(s);
  console.log(`built ${path.relative(root, out)}  ${(size/1e6).toFixed(1)} MB`);
  if(size > 16_000_000) console.warn('WARNING: 16MB を超えています(claude.ai のアーティファクト上限)');
  process.exit(0);
}

/* ---- Web 版: data URI を assets/media/ のファイルへ ---- */
const outDir = path.join(root, 'dist', 'web');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'assets', 'media'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'vendor'), { recursive: true });

const EXT = { 'image/png':'png', 'image/jpeg':'jpg', 'image/jpg':'jpg', 'image/webp':'webp', 'image/gif':'gif', 'image/svg+xml':'svg' };
let count = 0, bytes = 0;
s = s.replace(/data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g, (m, mime, b64) => {
  const ext = EXT[mime];
  if(!ext || b64.length < 2048) return m; // 小さいものはそのまま
  const buf = Buffer.from(b64, 'base64');
  const name = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '.' + ext;
  const file = path.join(outDir, 'assets', 'media', name);
  if(!fs.existsSync(file)){ fs.writeFileSync(file, buf); count++; bytes += buf.length; }
  return 'assets/media/' + name;
});

for(const key of Object.keys(LOCAL)){
  const from = path.join(root, VENDOR_SRC[key]);
  if(!fs.existsSync(from)){ console.error(`missing ${VENDOR_SRC[key]} — 先に npm install を実行してください`); process.exit(1); }
  fs.copyFileSync(from, path.join(outDir, LOCAL[key]));
}

// glTF モデル(あれば)
const modelsDir = path.join(root, 'assets', 'models');
if(fs.existsSync(modelsDir)){
  fs.cpSync(modelsDir, path.join(outDir, 'models'), { recursive: true });
}

fs.writeFileSync(path.join(outDir, 'index.html'), s);
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
console.log(`built dist/web/index.html  ${(Buffer.byteLength(s)/1e6).toFixed(2)} MB  + ${count} media files (${(bytes/1e6).toFixed(1)} MB)`);
