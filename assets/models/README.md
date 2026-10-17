# 3D モデル置き場

ここに `.glb` と `manifest.json` を置くと、ビルド時に `dist/web/models/` へコピーされ、
該当する生物の見た目が図形モデルから差し替わります(書かれていない生物は図形モデルのまま)。

`manifest.json` の書き方は `src/models.js` の先頭コメントと `docs/MODELS.md` を参照。
このファイル(README.md)と `manifest.example.json` は読み込まれません。
