# Lunch Forge v0.5.4

日本語優先のMTGスタンダード向けカード・デッキ構築支援ツールです。

## v0.5.4 Deck Intelligence

デッキ分析へv0.5.3の効果接続評価を本格適用しました。

- デッキが供給している資源・条件を枚数付きで集計
- デッキが利用している効果、誘発、勝ち筋を集計
- `供給 → 利用`として成立している効果接続を表示
- 活用先のない生成効果、供給源のない利用効果を「不足・孤立」として表示
- 妨害、手札補充、保護、マナ加速、勝ち筋の不足を検出
- おすすめ候補を、デッキ内の何枚と接続するかを含む理由付きで採点
- デッキ内で必要カードが揃った検証済みシナジーを表示
- 総合スコアを基本構成と効果構造の両方から算出
- 色が一致するだけでは加点しないv0.5.3の方針を維持

## GitHub Pagesへの更新

今回更新するのは、リポジトリ最上位の次の6ファイルだけです。

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `CHANGELOG.md`
- `CHECKLIST.md`

`docs`、`data`、`tests`フォルダーは変更しません。

推奨コミットメッセージ：

```text
feat: add deck intelligence analysis v0.5.4
```

## 継続している機能

- 日本語データ取得と日本語優先表示
- 両面カードの表面／裏面／両面表示
- Synergy / Enable / Engine / Support / Coverage分類
- 検証済みシナジー事例
- カード検索、カード辞書、Card Inspector、Knowledge Engine、Card Synergy Advisor
