/* 3D モデル(.glb)を Web 配信向けに軽くする。元のファイルは変更しない。
   - テクスチャを最大 1024px に縮小(manifest の "textureSize" で個別に変更可)し、JPEG/PNG のまま再圧縮
   - 使われていないデータの削除・重複の統合
   結果は .cache/models/ に保存し、元ファイルと設定が同じなら次回は再利用する。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const DEFAULT_SIZE = 1024;

export async function optimizeModels(srcDir, outDir, cacheDir){
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  const manifestPath = path.join(srcDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  const sizeOf = {};
  for(const spec of Object.values(manifest)) if(spec && spec.file) sizeOf[spec.file] = spec.textureSize || DEFAULT_SIZE;

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
  }
  return report;
}
