# Lunch Forge v0.5.5

## Swap Planner

デッキ分析結果から「何を入れるか」だけでなく、「何を何枚減らすか」を一組で提案します。

### 主な機能

- 追加候補と削減候補を1組で表示
- 効果の孤立、役割の過密、マナ域の過密、主要テーマとの接続を削減候補の根拠に使用
- 検証済みシナジーの構成カードや不足中の重要役割を保護
- 効果構造点、不足・孤立、効果接続、平均MVを変更前後で比較
- 「入れ替えて再分析」でデッキリストへ反映し、自動的に再分析
- 土地枚数を大きく崩す提案を抑制

## 日本語データ

`data/card-overrides.json`は従来どおり使用します。今回の更新では`data`、`docs`、`tests`を変更しません。

## GitHub Pagesへの更新

リポジトリ最上位の次の6ファイルを上書きします。

- `app.js`
- `index.html`
- `styles.css`
- `README.md`
- `CHANGELOG.md`
- `CHECKLIST.md`

推奨コミットメッセージ：

```text
feat: add swap planner v0.5.5
```

## 継続している機能

- Deck Intelligence
- 日本語データ取得・監査・手動補完
- IndexedDBカードキャッシュと通信失敗時の復旧
- 両面カード表示
- 検証済みシナジー
- Card Knowledge Base / Inspector / Advisor / Knowledge Engine
