# Lunch Forge v0.6.5

MTGスタンダード向け、日本語優先のカード・デッキ解析ツールです。

## v0.6.5 Rule Path Synergy Engine β-5

Rule Engineで作ってきた Event Graph / Stack / Zone / Priority を、シナジー推薦へ接続しました。

- ルール検証に「シナジー成立経路」を追加
- Rule Path score（経路信頼度）を0～100で表示
- Verified / Connected / Partial / Unconfirmedを区別
- 成立条件・コスト・妨害ポイントを分離表示
- 単体カード探索と構築相談の推薦順位へRule Pathを反映
- タグだけ一致し、明確なルール経路がない候補を抑制
- 検証済みシナジーを最優先

### 注意
Rule Path scoreは勝率ではありません。カード間のルール上の経路がどれだけ明示的かを表す指標です。実戦価値、必要枚数、引ける確率、マナ効率、相手とのマッチアップは今後のStrategy Engineで別評価します。

## 更新
リポジトリ最上位の6ファイルを上書きします。

- app.js
- index.html
- styles.css
- README.md
- CHANGELOG.md
- CHECKLIST.md

`data/` `docs/` `tests/` は変更しません。
