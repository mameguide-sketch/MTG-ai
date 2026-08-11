## v0.6.7 - Consistency & Timing Engine β-7

- 現在のデッキリストをRule Engineの再現性評価へ接続
- 必要パーツの採用枚数を集計
- 先攻 / 後攻別に3T・4T・5Tの自然ドロー到達率を計算
- 合計MVからマナ上の理論最速ターンを算出
- 土地枚数から最速ターン時の土地到達率を算出
- 色マナ源、アクセス補助、単体依存度を一次評価
- Consistency score（0～100）とA～E評価を追加
- app.jsのキャッシュバスターをv0.6.7へ更新

## v0.6.6 - Strategy Value Engine β-6
- Rule Pathとは別に実戦成立性の一次評価を追加
- 必要カード枚数、合計MV、成立条件・コスト数、優先権窓を可視化
- Strategy scoreは勝率ではなく構築上の扱いやすさの暫定指標

## v0.6.6 - Rule Path Synergy Engine β-5

- Rule Engineのイベント経路をシナジー評価へ接続
- Rule Path scoreを追加
- Verified / Connected / Partial / Unconfirmed区分を追加
- ルール検証に成立経路・条件・妨害ポイントを表示
- 単体カード探索の候補をRule Path込みで再ランキング
- 構築相談の候補をRule Path込みで再ランキング
- タグ一致のみでルール接続が弱い候補を減点
- app.jsにキャッシュバスターを追加

## v0.6.4a

- Rule Engineイベントバインド競合を修正
- Priority & Response Engine β-4を統合表示
