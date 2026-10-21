/* 元のプロトタイプ(src/original)に 3D アダプタとオンライン対戦を注入して dist/ を作る。
   元ファイルには一切手を入れない。

   使い方(リポジトリのルートで):
     node tools/build.mjs            → dist/web/   Web 公開用(画像は別ファイル、three.js / PeerJS は同梱)
     node tools/build.mjs --single   → dist/bind_3d_game.html  1ファイル版(画像は data URI、ライブラリは CDN)
     node tools/build.mjs --lite     → dist/web/lite/  スマホ向けの軽量版(先に通常版を作ってから。通常版をスマホで開くとここへ移る)
     node tools/build.mjs --single --lite → dist/bind_3d_game_lite.html  軽量版の1ファイル版
     node tools/build.mjs --debug    → dist/debug/  ビジュアル確認ツール入り(公開しない。src/debug.js)
     node tools/build.mjs --single --debug → dist/bind_3d_debug.html  確認ツールの1ファイル版

   軽量版: モデルのポリゴン 4 割・テクスチャ 512px、カード絵などの画像は WebP に縮小、
           描画は解像度を抑えて影・観客・背景の光の粒を止める(window.BIND_LITE)。2 回目以降はオフラインでも起動(sw.js)。

   Web 版は http(s) で配信すること(file:// では WebGL がテクスチャを読めない)。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const single = process.argv.includes('--single');
const lite = process.argv.includes('--lite');
const debug = process.argv.includes('--debug') && !lite;
const LITE_MODELS = { textureSize:512, simplify:0.4 };
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
// CPU(つよい・最強AI)の先読み用に、元のルール部分を画面なしで動く独立したエンジンとして取り出す(tools/ai/engine.js と同じ方法)
function engineJs(){
  const { engineSource, factorySource } = createRequire(import.meta.url)('./ai/engine.js');
  return 'window.BindEngineFactory = ' + factorySource(engineSource(s)) + ';';
}
const css = read('src/adapter.css') + '\n' + read('src/hud.css') + '\n' + read('src/online.css') + '\n' + read('src/ui.css');
const js = [read('src/adapter.js'), read('src/models.js'), read('src/idle.js'), read('src/hud.js'), read('src/camera.js'), read('src/fx3d.js'), read('src/spectators.js'), read('src/audio.js'), read('src/online.js'), read('src/texts.js'), read('src/ui.js'), engineJs(), read('src/cpu_ai.js'), read('src/cpu.js'), read('src/device.js')];
if(debug) js.push(read('src/debug.js'));

// ページの名前・検索結果の説明・SNS に貼ったときの見た目(OGP)
const SITE_URL = 'https://aldeus-vip.github.io/Bind/';
const TITLE = 'Bind ― トランプで繰り広げるボードゲーム';
const DESC = 'トランプで駒(パーソナル)を操る、2人用の封じ合いの戦略ボードゲーム。ブラウザで無料、CPU対戦・オンライン対戦に対応。';
const esc = t => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
s = s.replace('<title>Bind — プロトタイプ</title>', `<title>${esc(TITLE)}</title>\n` +
  `<meta name="description" content="${esc(DESC)}">\n` +
  (single ? '' : `<link rel="canonical" href="${SITE_URL}">\n`) +
  `<meta property="og:type" content="website">\n<meta property="og:site_name" content="Bind">\n` +
  `<meta property="og:title" content="${esc(TITLE)}">\n<meta property="og:description" content="${esc(DESC)}">\n` +
  `<meta property="og:url" content="${SITE_URL}">\n<meta property="og:image" content="${SITE_URL}og-image.jpg">\n` +
  `<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:locale" content="ja_JP">\n` +
  `<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${esc(TITLE)}">\n` +
  `<meta name="twitter:description" content="${esc(DESC)}">\n<meta name="twitter:image" content="${SITE_URL}og-image.jpg">` +
  (debug ? '\n<meta name="robots" content="noindex">' : ''));
s = s.replace('</head>',
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap" rel="stylesheet">\n</head>');
// favicon(assets/favicon): Web 版は同じ階層にファイルを置き、1ファイル版は data URI で埋め込む
const favDir = path.join(root, 'assets', 'favicon');
if(fs.existsSync(favDir)){
  s = s.replace(/<link rel="icon" type="image\/x-icon"[^>]*>\n?/, ''); // 元の仮アイコンを外す
  const fav = f => single ? 'data:image/png;base64,' + fs.readFileSync(path.join(favDir, f)).toString('base64') : f;
  s = s.replace('</head>',
    (single ? '' : '<link rel="icon" href="favicon.ico" sizes="any">\n<link rel="manifest" href="site.webmanifest">\n') +
    `<link rel="icon" type="image/png" sizes="32x32" href="${fav('icon-32.png')}">\n` +
    (single ? '' : '<link rel="icon" type="image/png" sizes="16x16" href="icon-16.png">\n') +
    `<link rel="apple-touch-icon" href="${fav('apple-touch-icon.png')}">\n` +
    '<meta name="theme-color" content="#1e1816">\n' +
    // iPhone: ホーム画面に追加すると、ブラウザのバーなしの全画面で開く
    '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n' +
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n</head>');
}
// 通常の Web 版をスマホで開いたら軽量版(lite/)へ移る(?full=1 で通常版のまま)
if(!single && !lite && !debug){
  s = s.replace('<head>', `<head>\n<script>(function(){try{var q=location.search;if(/[?&]full=1/.test(q))return;
  if(matchMedia('(pointer: coarse)').matches&&Math.min(screen.width,screen.height)<820)location.replace('lite/'+q+location.hash);}catch(e){}})();</script>`);
}
const i = s.indexOf('</head>'), j = s.lastIndexOf('</style>', i);
s = s.slice(0, j) + css + s.slice(j);

const src = single ? CDN : LOCAL;
// 1ファイル版: 軽量化した 3D モデルを data URI で埋め込む(file:// では models/ を読めないため)
let embedded = '';
const modelsSrc = path.join(root, 'assets', 'models');
if(single && fs.existsSync(path.join(modelsSrc, 'manifest.json'))){
  const { optimizeModels } = await import('./optimize_models.mjs');
  const tmp = path.join(root, '.cache', 'single-models');
  fs.rmSync(tmp, { recursive: true, force: true });
  (await optimizeModels(modelsSrc, tmp, path.join(root, '.cache', 'models'), lite ? LITE_MODELS : {})).forEach(r => console.log('model ' + r));
  const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
  const files = {};
  for(const f of fs.readdirSync(tmp)) if(f.endsWith('.glb'))
    files[f] = 'data:model/gltf-binary;base64,' + fs.readFileSync(path.join(tmp, f)).toString('base64');
  embedded = `<script>window.BIND_EMBEDDED_MODELS = ${JSON.stringify({ manifest, files })};</script>\n`;
}
// フロアなどのテクスチャ(assets/textures): Web 版は textures/ に置き、1ファイル版は data URI で埋め込む
let texDir = path.join(root, 'assets', 'textures');
const sharpLib = lite ? (await import('sharp')).default : null;
if(lite && fs.existsSync(texDir)){
  // 軽量版: テクスチャを縮小した複製を使う(大地の絵は 768px、ほかは 512px)
  const liteTex = path.join(root, '.cache', 'lite-textures');
  fs.rmSync(liteTex, { recursive: true, force: true }); fs.mkdirSync(liteTex, { recursive: true });
  for(const f of fs.readdirSync(texDir)){
    const max = /^ground/.test(f) ? 768 : 512;
    let img = sharpLib(path.join(texDir, f)).resize({ width:max, height:max, fit:'inside', withoutEnlargement:true });
    img = /\.jpe?g$/i.test(f) ? img.jpeg({ quality:80 }) : img.png({ compressionLevel:9, palette:false });
    await img.toFile(path.join(liteTex, f));
  }
  texDir = liteTex;
}
const texMap = {};
if(fs.existsSync(texDir)) for(const f of fs.readdirSync(texDir)){
  const key = f.replace(/\.[^.]+$/, ''), ext = path.extname(f).slice(1).toLowerCase();
  texMap[key] = single ? `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + fs.readFileSync(path.join(texDir, f)).toString('base64') : 'textures/' + f;
}
const texScript = `<script>window.BIND_TEX = ${JSON.stringify(texMap)};</script>\n` + (lite ? '<script>window.BIND_LITE = true;</script>\n' : '');
const tags = texScript + embedded +
  `<script src="${src.three}"></script>\n` +
  `<script src="${src.gltf}"></script>\n` +
  `<script src="${src.skel}"></script>\n` +
  `<script src="${src.peer}"></script>\n` +
  js.map(code => `<script>\n${code}\n</script>\n`).join('');
// 軽量版: 元のファイルに埋め込まれた大きな画像(カード絵など)を WebP に縮小する
if(lite){
  const re = /data:(image\/(?:png|jpe?g));base64,([A-Za-z0-9+/=]+)/g, found = new Map();
  for(const m of s.matchAll(re)) if(m[2].length >= 2048 && !found.has(m[0])) found.set(m[0], m[2]);
  let before = 0, after = 0;
  for(const [whole, b64] of found){
    const buf = Buffer.from(b64, 'base64');
    const out = await sharpLib(buf).resize({ width:640, height:640, fit:'inside', withoutEnlargement:true }).webp({ quality:72 }).toBuffer();
    before += buf.length; after += out.length;
    if(out.length < buf.length) s = s.split(whole).join('data:image/webp;base64,' + out.toString('base64'));
  }
  console.log(`lite: images ${(before/1e6).toFixed(1)}MB → ${(after/1e6).toFixed(1)}MB (WebP)`);
}
const k = s.lastIndexOf('</body>');
s = s.slice(0, k) + tags + s.slice(k);

if(single){
  const out = path.join(root, 'dist', debug ? 'bind_3d_debug.html' : lite ? 'bind_3d_game_lite.html' : 'bind_3d_game.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, s);
  const size = Buffer.byteLength(s);
  console.log(`built ${path.relative(root, out)}  ${(size/1e6).toFixed(1)} MB`);
  if(size > 16_000_000) console.warn('注意: 16MB を超えています(claude.ai のアーティファクトには載せられない。ダウンロードして開く分には問題なし)');
  process.exit(0);
}

/* ---- Web 版: data URI を assets/media/ のファイルへ ---- */
const outDir = debug ? path.join(root, 'dist', 'debug') : path.join(root, 'dist', 'web', lite ? 'lite' : '');
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

if(fs.existsSync(texDir)) fs.cpSync(texDir, path.join(outDir, 'textures'), { recursive: true });
if(fs.existsSync(favDir)) for(const f of fs.readdirSync(favDir)) fs.copyFileSync(path.join(favDir, f), path.join(outDir, f));
if(!lite && fs.existsSync(path.join(root, 'assets', 'og-image.jpg'))) fs.copyFileSync(path.join(root, 'assets', 'og-image.jpg'), path.join(outDir, 'og-image.jpg')); // SNS 用の画像
// glTF モデル(あれば)
const modelsDir = path.join(root, 'assets', 'models');
if(fs.existsSync(modelsDir)){
  const { optimizeModels } = await import('./optimize_models.mjs');
  const report = await optimizeModels(modelsDir, path.join(outDir, 'models'), path.join(root, '.cache', 'models'), lite ? LITE_MODELS : {});
  report.forEach(r => console.log('model ' + r));
}

// 軽量版: 2 回目以降はオフラインでも起動できるよう、全ファイルを端末に保存する(Service Worker)
if(lite){
  const files = [];
  const walk = (d, rel) => { for(const f of fs.readdirSync(d)){ const p = path.join(d, f), r = rel ? rel + '/' + f : f; if(fs.statSync(p).isDirectory()) walk(p, r); else files.push(r); } };
  walk(outDir, '');
  const ver = crypto.createHash('sha1').update(s).update(files.join('|')).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(outDir, 'sw.js'), `/* Bind 3D 軽量版: 一度読み込んだファイルを端末に保存して、次から速く・オフラインでも開く */
const CACHE = 'bind3d-lite-${ver}';
const FILES = ${JSON.stringify(['./', ...files.filter(f => f !== 'index.html')])};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if(e.request.method !== 'GET' || u.origin !== location.origin) return;
  // ページ本体は新しいものを優先(オフラインなら保存分)、ほかは保存分を優先
  if(e.request.mode === 'navigate'){ e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put('./', c)); return r; }).catch(() => caches.match('./'))); return; }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
`);
  s = s.replace('</body>', `<script>if('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>\n</body>`);
}
fs.writeFileSync(path.join(outDir, 'index.html'), s);
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
console.log(`built ${path.relative(root, path.join(outDir, 'index.html'))}  ${(Buffer.byteLength(s)/1e6).toFixed(2)} MB  + ${count} media files (${(bytes/1e6).toFixed(1)} MB)`);
