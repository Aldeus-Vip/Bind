"""テスト用の最小 glTF(.glb)を作る: 名前付きの箱2つ(Body と Eye)+ 'Idle' アニメーション。
models.js の読み込み経路(縮尺・まばたき・アニメーション)を確認するためだけのもの。
使い方: python3 tools/make_test_glb.py <出力パス>"""
import json, struct, sys

def box(sx, sy, sz):
    xs, ys, zs = sx/2, sy/2, sz/2
    v = []; idx = []
    faces = [((1,0,0),[(xs,-ys,-zs),(xs,ys,-zs),(xs,ys,zs),(xs,-ys,zs)]),
             ((-1,0,0),[(-xs,-ys,zs),(-xs,ys,zs),(-xs,ys,-zs),(-xs,-ys,-zs)]),
             ((0,1,0),[(-xs,ys,-zs),(-xs,ys,zs),(xs,ys,zs),(xs,ys,-zs)]),
             ((0,-1,0),[(-xs,-ys,zs),(-xs,-ys,-zs),(xs,-ys,-zs),(xs,-ys,zs)]),
             ((0,0,1),[(-xs,-ys,zs),(xs,-ys,zs),(xs,ys,zs),(-xs,ys,zs)]),
             ((0,0,-1),[(xs,-ys,-zs),(-xs,-ys,-zs),(-xs,ys,-zs),(xs,ys,-zs)])]
    for n, quad in faces:
        b = len(v)
        for p in quad: v.append((p, n))
        idx += [b, b+1, b+2, b, b+2, b+3]
    return v, idx

bin_ = bytearray(); views = []; accs = []
def add(data, fmt, count, typ, comp, target=None, mn=None, mx=None):
    while len(bin_) % 4: bin_.append(0)
    off = len(bin_); bin_.extend(data)
    views.append({"buffer":0,"byteOffset":off,"byteLength":len(data), **({"target":target} if target else {})})
    a = {"bufferView":len(views)-1,"componentType":comp,"count":count,"type":typ}
    if mn is not None: a["min"], a["max"] = mn, mx
    accs.append(a); return len(accs)-1

meshes = []
for sx, sy, sz in [(0.6, 1.0, 0.5), (0.12, 0.12, 0.05)]:
    v, idx = box(sx, sy, sz)
    pos = b''.join(struct.pack('<3f', *p) for p, _ in v)
    nor = b''.join(struct.pack('<3f', *n) for _, n in v)
    ind = b''.join(struct.pack('<H', i) for i in idx)
    pa = add(pos, None, len(v), "VEC3", 5126, 34962, [-sx/2,-sy/2,-sz/2], [sx/2,sy/2,sz/2])
    na = add(nor, None, len(v), "VEC3", 5126, 34962)
    ia = add(ind, None, len(idx), "SCALAR", 5123, 34963)
    meshes.append({"primitives":[{"attributes":{"POSITION":pa,"NORMAL":na},"indices":ia,"material":len(meshes)}]})

times = add(struct.pack('<3f', 0, 0.5, 1.0), None, 3, "SCALAR", 5126, None, [0], [1.0])
rots = add(b''.join(struct.pack('<4f', 0, s, 0, (1-s*s)**0.5) for s in (0, 0.2, 0)), None, 3, "VEC4", 5126)

gltf = {
  "asset":{"version":"2.0","generator":"bind-test"},
  "scene":0, "scenes":[{"nodes":[0]}],
  "nodes":[{"name":"Body","mesh":0,"translation":[0,0.5,0],"children":[1]},
           {"name":"Eye","mesh":1,"translation":[0.12,0.25,0.26]}],
  "meshes":meshes,
  "materials":[{"name":"skin","pbrMetallicRoughness":{"baseColorFactor":[0.8,0.3,0.2,1],"metallicFactor":0}},
               {"name":"eye","pbrMetallicRoughness":{"baseColorFactor":[1,1,0.6,1]},"emissiveFactor":[1,0.9,0.3]}],
  "animations":[{"name":"Idle","samplers":[{"input":times,"output":rots,"interpolation":"LINEAR"}],
                 "channels":[{"sampler":0,"target":{"node":0,"path":"rotation"}}]}],
  "accessors":accs, "bufferViews":views, "buffers":[{"byteLength":len(bin_)}],
}
while len(bin_) % 4: bin_.append(0)
js = json.dumps(gltf).encode()
while len(js) % 4: js += b' '
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_))
out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
open(sys.argv[1], 'wb').write(out)
print('wrote', sys.argv[1], len(out), 'bytes')
