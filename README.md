# Lunch Forge v0.6.9

## Recommendation Decision Engine β-9

Rule Path、Strategy Value、Consistency、Game Planを統合し、**「このカード／シナジーを現在のデッキへ本当に推薦するべきか」**を最終判定します。

### 主な機能
- Recommendation score（0～100）とA～E評価
- Rule Path / Strategy / Consistency / Game Planの4軸を同時表示
- 単純平均ではなく、最も弱い軸を「ボトルネック」として減点
- Rule Pathが極端に低い、Consistencyが極端に低い、未採用パーツがある等の場合は総合点に上限を設定
- Verified Rule Pathは、重大な弱点がない場合のみ最終判定へ加点
- 「推薦する理由」と「採用前に確認する点」を分離表示
- 単体カード探索 / 構築相談 / デッキ分析の候補へRecommendation表示を追加
- Recommendation判定を候補順位へ反映

### 判定の考え方
Recommendation scoreは4軸の単純平均ではありません。例えばRule Pathが95でもConsistencyが20なら高評価にはならず、「成立はするが再現しにくい」候補として順位を下げます。逆に派手なコンボでなくても、ルール接続・扱いやすさ・再現性・ゲームプラン適合度が揃えば上位候補になります。

デッキ分析の大量候補については処理速度を維持するため、Rule Path / Strategy / Consistencyの一部をデッキ構造から推定した **Inferred判定** を使用します。ルール検証ページでは4エンジンの実測モデルを使った統合判定です。

Recommendation scoreは勝率ではありません。対戦相手、メタゲーム、大会結果、サイドボード後の勝率はまだ含みません。

## Game Plan Engine β-8
- 各カードを主エンジン / 成立支援 / 利益変換 / フィニッシャー / 妨害 / 安定化支援などへ分類
- 序盤 / 中盤 / 終盤の担当を可視化
- シナジー不成立時の単体価値を一次評価
- デッキ内の役割重複と勝ち筋までの経路を評価

## Consistency & Timing Engine β-7a
- 自然ドロー到達率、採用枚数、土地到達率、色マナ難度、アクセス補助を評価
- Verified Rule Pathでは印刷MVの単純合計ではなく実際の支払い経路から理論最速を判定
- 月影＋血茨のフレイル＋炎跡のフェニックスは2Tを最速経路として扱う

## 更新方法
リポジトリ最上位の以下6ファイルを上書きします。

- app.js
- index.html
- styles.css
- README.md
- CHANGELOG.md
- CHECKLIST.md

`data/` `docs/` `tests/` は変更しません。
