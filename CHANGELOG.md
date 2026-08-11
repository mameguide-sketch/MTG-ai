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
