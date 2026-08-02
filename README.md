# Lunch Forge v0.6.1

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
feat: add proposal controls v0.6.1
```


## v0.6.1 Rule Kernel α
- 最大3枚のカード文章を条件・コスト・イベント・状態へ分解
- 効果の供給側と要求側を接続
- 検証済み2事例をルール手順として表示
- Parsed / Inferred / Verified / Unsupportedを区別
- 総合ルールの完全実装ではなく、段階的なルールエンジンの初版


## v0.6.1 Event Graph Engine

ルール検証でカード能力をINPUT/OUTPUTイベントへ変換し、最大3枚のイベントチェーンと接続強度を表示します。Event辞書初版は60種類以上を収録します。
