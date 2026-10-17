# Bind 3D

2人用トランプ戦略ゲーム「Bind」の 3D 版。ブラウザで遊べて、ルームコードでオンライン対戦できる。

## 遊び方

| 方法 | 手順 |
|---|---|
| CPU 対戦 / 同じ画面で2人 | ページを開いてスタート画面から選ぶ |
| オンライン対戦 | 1人が「ルームを作る」→ 表示されたコードか招待リンクを相手に送る → 相手が「参加する」 |

## 開発

```bash
npm install
npm run build          # dist/web/ を作る(Web 公開用)
npm run serve          # http://localhost:8080/ で確認(file:// では 3D が動かない)
npm run build:single   # dist/bind_3d_game.html(1ファイル版、ライブラリは CDN)
npm test               # ビルド + オンライン対戦テスト + CPU 対戦テスト
```

## 公開(GitHub Pages)

`main` に push すると `.github/workflows/pages.yml` が `dist/web` を公開する。
初回だけ リポジトリの **Settings → Pages → Source** を **GitHub Actions** にする。

## 資料

- `HANDOFF.md` — これまでの経緯と 3D 化の設計
- `docs/ROADMAP.md` — 今後の段階とオンライン方式の限界
- `docs/MODELS.md` — 3D モデルの作り方と差し替え手順
- `docs/Bind_Card_Design_Motifs.md` — 世界観・デザインの基準
