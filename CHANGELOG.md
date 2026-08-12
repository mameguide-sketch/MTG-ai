# v0.6.7a
- Fix theoretical earliest-turn calculation to follow Verified Rule Paths.
- Moonshadow / Bloodthorn Flail / Flamewake Phoenix now evaluates to turn 2.
- Badgermole Cub / Fabled Passage now accounts for the non-mana-producing Passage setup and evaluates to turn 3 without acceleration.
- Show printed MV separately from actual path mana payments and display the fastest action plan.

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

## v0.6.8 - Game Plan Engine β-8
- Rule Path / Strategy / Consistencyの次に「デッキ全体への貢献度」を追加
- 各カードを主エンジン、成立支援、利益変換、フィニッシャー、妨害、安定化支援などへ分類
- 序盤 / 中盤 / 終盤の担当を表示
- シナジー不成立時の単体価値を0～100で一次評価
- 現在のデッキ内で同役割の代替枚数を数え、役割重複を評価
- 勝ち筋までの経路を Direct / Indirect / Open End で表示
- Rule Pathが強くても現在のデッキでは役割重複が大きい場合「強いシナジーだが優先度低め」と判定
- 単体カード探索、構築相談、デッキ分析の推薦順位へGame Plan適合度を反映
- app.jsキャッシュバスターをv0.6.8へ更新

## v0.6.9 - Recommendation Decision Engine β-9
- Rule Path / Strategy / Consistency / Game Planを最終推薦判定へ統合
- Recommendation score（0～100）とA～E評価を追加
- 単純平均ではなく、最低評価軸をボトルネックとして減点
- Rule Path / Consistency / Game Plan / Strategyの重大な弱点にスコア上限を設定
- 未採用パーツがある場合は「現デッキでは成立不可」を優先表示
- 推薦理由と採用前の確認点を分離表示
- 単体カード探索、構築相談、デッキ分析の候補カードへRecommendation表示を追加
- Recommendation判定を推薦順位へ反映
- デッキ大量候補では処理速度維持のためInferred軸を使用し、ルール検証では4エンジンの実測値を使用
- app.jsキャッシュバスターをv0.6.9へ更新
