# Lunch Forge v0.5.1

日本語優先のMTGスタンダード向けカード・デッキ構築支援ツールです。

## v0.5.1の追加

- 両面カードの表面／裏面切り替え
- 両面を並べて確認できる表示
- 面ごとのカード名、マナ・コスト、タイプ、ルール文章、P/T等の表示
- 各面で日本語カード画像を優先し、存在しない場合は英語画像へフォールバック
- 通常カードの表示と既存機能を維持

## GitHub Pagesへの更新

次の6ファイルだけを、リポジトリの最上位へ上書きしてください。

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `CHANGELOG.md`
- `CHECKLIST.md`

`docs`、`data`、`tests`フォルダーは削除・上書きしません。

推奨コミットメッセージ：

```text
feat: add double-faced card display v0.5.1
```
