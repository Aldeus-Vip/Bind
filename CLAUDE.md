# Bind 3D — Claude Code 用プロジェクトメモ

2人用トランプ戦略ゲーム「Bind」の HTML プロトタイプを、3D 表示へ昇華させているプロジェクト。
詳しい経緯・設計・残タスクは **HANDOFF.md** を最初に読むこと。

## 守ること

- **ゲームロジック(`src/original/bind_prototype.html`)は直接編集しない。**
  3D 化はすべて `src/adapter.js` / `src/adapter.css` から「後付け」で行う(元の関数を上書きする方式)。
  元ファイルのルールや CPU を直したいときは、ユーザー(Riku さん)に確認してから。
- 演出関数を上書きするときは、必ず `trackAnimation` 経由で完了を1回だけ通知する(`once()` を使う)。
  通知が0回だと CPU が止まり、2回だとアニメ中カウンタが狂う。例外時も `failSafe()` で必ず通知する。
- 3D 表示は右上の「3D表示」ボタンで 2D に戻せる。上書きした演出は 2D のときは元の演出に戻ること(`override()` が自動で切り替える)。
- 世界観・デザインの基準は `docs/Bind_Card_Design_Motifs.md` と `assets/concept_sheet.png`。

## ビルドと確認

```bash
npm install
npm run build                 # → dist/web/(Web 公開用。http で配信して確認: npm run serve)
npm run build:single          # → dist/bind_3d_game.html(1ファイル版)
npm run build:lite            # → dist/web/lite/(スマホ向け軽量版。先に npm run build)
npm run build:single:lite     # → dist/bind_3d_game_lite.html(軽量版の1ファイル版)
npm run test:online           # 2タブでオンライン対戦(同期ずれ検出)
npm run test:play             # CPU 同士の自動対戦(エラーと進行停止の検出)
npm run test:models           # glTF モデル差し替えの確認
```

- テストのスクリーンショットはカレントディレクトリに出る。`tools/out/` で実行すること。
- オンライン対戦は `src/online.js`。元の操作関数(resolveTask など8つ)をラップして相手へ送る。
  元のロジックの操作関数の名前・引数が変わったら、`READY` の表を直すこと。
- glTF モデルは `src/models.js` + `assets/models/manifest.json`(docs/MODELS.md)。ビルド時に `tools/optimize_models.mjs` がテクスチャを縮小する(結果は `.cache/models/` に保存)。

## ユーザーについて

- 日本語で回答。情報は見出し・箇条書き・表で構造化し、要点を絞る。
- 正解の提示より、ユーザーの仮説の評価・検証を求めることが多い。
