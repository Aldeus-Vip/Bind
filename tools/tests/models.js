/* glTF モデル差し替えの確認。テスト用の .glb と manifest をリクエスト横取りで渡し、
   8(c8)の見た目がモデルに置き換わることを確認する。 */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
(async () => {
  const tmp = path.join(os.tmpdir(), 'bind_test_model.glb');
  execFileSync('python3', [path.join(__dirname, '..', 'make_test_glb.py'), tmp]);
  const glb = fs.readFileSync(tmp);
  const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport:{ width:1280, height:820 } });
  const errs = [], infos = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); if(/モデル/.test(m.text())) infos.push(m.text()); });
  await p.route('**/models/manifest.json', r => r.fulfill({ contentType:'application/json', body: JSON.stringify({ c8: { file:'test.glb', height:1.1 } }) }));
  await p.route('**/models/test.glb', r => r.fulfill({ contentType:'model/gltf-binary', body: glb }));
  await p.goto(await require('../serve').url()); await p.waitForTimeout(1500);
  await p.evaluate(() => {
    initGame(true, 'easy', false);
    const c8 = { suit:'S', rank:8, id:'S8' };
    state.players[0].personalCard = c8; state.players[0].personalIndex = 17; state.floor[17].owner = 0;
    state.players[1].personalCard = { suit:'H', rank:8, id:'H8' }; state.players[1].personalIndex = 2; state.floor[2].owner = 1;
    state.phase = 'draw'; render();
  });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const ch = B3.chars[0]; let names = [];
    ch.av.root.traverse(o => { if(o.isMesh && o.name) names.push(o.name); });
    return { key: ch.avKey, hasBody: names.includes('Body'), eyes: ch.eyes.length };
  });
  await p.screenshot({ path:'models.png' });
  console.log(JSON.stringify(r), infos.join(' / '));
  if(!(r.key==='c8' && r.hasBody && r.eyes>=1)) errs.push('MODEL NOT APPLIED');
  console.log(errs.join('\n') || 'no errors');
  await b.close(); process.exit(errs.length ? 1 : 0);
})();
