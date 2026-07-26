# Lunch Forge v0.1.1

MTGスタンダード向けのカード相性・デッキ診断Webアプリです。

## 今回の更新

- 正式名称を **Lunch Forge** に変更
- HTML / CSS / JavaScriptを分離
- 単体カード探索ボタンを初期状態から操作可能に修正
- JavaScriptと通信エラーを画面に表示
- スマートフォン向けUIを微調整

## GitHub Pages

リポジトリ直下に以下の3ファイルを置きます。

- `index.html`
- `styles.css`
- `app.js`

GitHub Pagesの公開元は `main` / `root` を使用します。

## データ

カード情報はScryfall APIから取得し、ブラウザのローカルストレージへ一時保存します。
