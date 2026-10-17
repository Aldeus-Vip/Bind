/* 3D モデル(.glb)を Web 配信向けに軽くする。元のファイルは変更しない。
   - テクスチャを最大 1024px に縮小(manifest の "textureSize" で個別に変更可)し、JPEG/PNG のまま再圧縮
   - 使われていないデータの削除・重複の統合
   結果は .cache/models/ に保存し、元ファイルと設定が同じなら次回は再利用する。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, weld, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const DEFAULT_SIZE = 1024;

export async function optimizeModels(srcDir, outDir, cacheDir){
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  const manifestPath = path.join(srcDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  const sizeOf = {}, miniOf = {};
  for(const spec of Object.values(manifest)) if(spec && spec.file){
    sizeOf[spec.file] = spec.textureSize || DEFAULT_SIZE;
    if(spec.swarm) miniOf[spec.file] = spec.swarm; // 群れ用の軽量版 <名前>.mini.glb も作る
  }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const report = [];
  for(const name of fs.readdirSync(srcDir)){
    const src = path.join(srcDir, name), dst = path.join(outDir, name);
    if(!name.endsWith('.glb')){ if(name==='manifest.json') fs.copyFileSync(src, dst); continue; }
    const size = sizeOf[name] || DEFAULT_SIZE;
    const buf = fs.readFileSync(src);
    const key = crypto.createHash('sha1').update(buf).update(String(size)).update('v1').digest('hex').slice(0, 16);
    const cached = path.join(cacheDir, `${name}.${key}.glb`);
    if(!fs.existsSync(cached)){
      const doc = await io.readBinary(new Uint8Array(buf));
      await doc.transform(
        dedup(), prune(),
        textureCompress({ encoder: sharp, resize: [size, size], quality: 85 }),
      );
      fs.writeFileSync(cached, await io.writeBinary(doc));
    }
    fs.copyFileSync(cached, dst);
    report.push(`${name} ${(buf.length/1e6).toFixed(1)}MB → ${(fs.statSync(dst).size/1e6).toFixed(1)}MB (textures ≤${size}px)`);
    if(miniOf[name]){
      const ratio = miniOf[name].lod || 0.08, msize = miniOf[name].textureSize || 128;
      const mname = name.replace(/\.glb$/, '.mini.glb');
      const mkey = crypto.createHash('sha1').update(buf).update(`${ratio}:${msize}`).update('mini-v4').digest('hex').slice(0, 16);
      const mcached = path.join(cacheDir, `${mname}.${mkey}.glb`);
      if(!fs.existsSync(mcached)){
        await MeshoptSimplifier.ready;
        const doc = await io.readBinary(new Uint8Array(buf));
        await doc.transform(
          weld(), sloppySimplify(ratio),
          dedup(), prune(),
          textureCompress({ encoder: sharp, resize: [msize, msize], quality: 75 }),
        );
        fs.writeFileSync(mcached, await io.writeBinary(doc));
      }
      fs.copyFileSync(mcached, path.join(outDir, mname));
      report.push(`${mname} ${(fs.statSync(path.join(outDir, mname)).size/1e3).toFixed(0)}KB (群れ用の軽量版)`);
    }
  }
  return report;
}

// 小さく表示するだけの複製用: 形が多少崩れてもよいので、繋がりを無視して大胆に減らす(simplifySloppy)
function sloppySimplify(ratio){
  return async doc => {
    for(const mesh of doc.getRoot().listMeshes()) for(const prim of mesh.listPrimitives()){
      const idx = prim.getIndices(), pos = prim.getAttribute('POSITION');
      if(!idx || !pos) continue;
      const indices = new Uint32Array(idx.getArray());
      const target = Math.max(300, Math.floor(indices.length * ratio / 3) * 3);
      const [out] = MeshoptSimplifier.simplifySloppy(indices, new Float32Array(pos.getArray()), 3, null, target, 1);
      idx.setArray(new Uint32Array(out));
      compactPrimitive(prim);
    }
  };
}
