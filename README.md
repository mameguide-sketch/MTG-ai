# Lunch Forge v0.5.6

## Proposal Controls

Swap Plannerへ条件設定を追加した版です。

- 絶対に抜かないカードをチェックで固定
- 1提案あたりの最大変更枚数を1・2・4・8枚から選択
- 土地枚数を固定
- 所有カードだけから追加候補を選択
- 追加カードの最高レアリティを制限
- 総合・攻撃的・安定性・シナジー重視の方針切替
- 上位3案を比較表示
- 入れ替え操作を最大10回まで元に戻す
- サイドボードは常に維持

## 更新方法

リポジトリ最上位で次の6ファイルを上書きします。

```text
app.js
index.html
styles.css
README.md
CHANGELOG.md
CHECKLIST.md
```

`data`、`docs`、`tests`は変更しません。

コミット例：

```text
feat: add proposal controls v0.5.6
```
