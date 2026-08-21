## v0.7.3c
- v0.7.3aでBurst Lightningを除去認識したことで、Strict Primary Objectiveが removal→removal を「除去枚数 +0 = 改善なし」として候補生成前に落としていた競合を修正。
- 除去不足時のSwapを「枚数改善」と「Candidate Quality品質改善」の2レーンへ分離。
- 同役割交換でも、除去品質が有意に上がる場合は比較候補として表示。
- `target creature or planeswalker ... deals N damage to it` の文脈型火力を単体除去として追加認識。
- Bad済み候補／ペア、1点全体火力のハードブロックは維持。
- 品質改善SwapをDeck Optimizerでも評価できるよう、枚数増加0でもCQ改善を別判定。

## v0.7.3b
- Candidate Qualityの除去評価を「カード全体の多機能さ」から「実際の除去面の品質」中心へ修正。
- `up to one target creature or planeswalker` 型の3点火力などを単体除去として正しく認識。
- 1点全体火力を汎用除去不足の候補からハード除外。
- 5マナ以上の全体除去を一般的な単体除去候補より強く減点。
- 1～2マナの直接的な単体除去を優先するランキング補正を追加。
- Bad済みの同一OUT→INをobjective違いでも再表示しないよう、ペア学習をobjective横断で照合。
- `OUTカードが重要` / `シナジーを壊す` 以外のBadは、同じ最優先課題でIN候補をハードブロック。
- Bad直後にCQキャッシュと提案UIを再計算し、古い提案カードが残る問題を抑制。

## v0.7.3a
- Burst Lightning等の "any target" 火力を除去として認識するよう修正。
- 除去不足などの deficit 解消時、既存の同役割カードをOUTして同役割へ置換する提案を禁止。
- 同一 OUT→IN をBad評価した場合、Goodが上回るまで同じ提案を再表示しない。
- 「INカードが弱い」「役割が違う」のBadは、その最優先課題で候補をハードブロック。

# v0.7.3a - Candidate Quality Engine

- 最優先課題への役割一致後にCandidate Quality 0–100 / A+～Eを算出
- 役割適合 / 効率 / 柔軟性 / 信頼性 / デッキ適合 / Evidenceの6軸を分離表示
- 除去を汎用確定除去、追放、火力、全体干渉、バウンス、カウンターなどに分けて品質評価
- 飛行限定、攻撃・ブロック限定、サイズ制限、条件付き、自己生け贄、追加コストを減点
- インスタント速度、対象範囲、追放、モード、複数役割を加点
- IN候補のCandidate QualityをOptimizer / Swap Plannerの順位へ強く反映
- 低品質な役割一致カードをOptimizerから除外する品質フロアを追加
- Card Valueが非常に高いOUTカードを低品質INと交換しにくくする保護を追加
- 1色・軽い色拘束で高品質な候補はAdoption Evidenceが弱くても色追加候補として検討可能
- その他の追加候補にもCQスコアを表示し、候補順位へ補助反映
- Candidate Qualityは勝率や絶対的カードパワーではないことをUIで明記
- Deck Analysis Navigation、User Evidence、Adoption Evidence、Main/Side分離を維持

# v0.7.2a

- Deck Analysis Navigation を追加。デッキ分析ページ上部に固定ページ内ナビを配置。
- 概要 / マナ・役割 / Deck Intelligence / 入れ替え提案 / デッキ最適化 / 学習 / 環境Evidence / 追加候補へワンクリックでスムーズ移動。
- スクロール位置に応じて現在セクションを自動ハイライト。
- 「↑ 上へ」でデッキ入力まで戻れる。
- モバイルではナビ項目を横スクロール可能。分析ロジック、Evidence、推薦ロジックは v0.7.2 のまま維持。

# v0.7.2 - Adoption Evidence Engine
- Magic.ggの2026-08-03 Traditional Standard Ranked Decklistsを公式Environment seedとして追加
- 8個の成功StandardデッキをMain / Side分離で収録
- 観測デッキ数、平均Main採用枚数、Side採用、現在デッキとの文脈適合度を算出
- 現在デッキに近い環境デッキと、共採用から見つけた候補を表示
- Adoption EvidenceをIN候補の順位へ補助的に反映
- 類似成功デッキで採用されるOUTカードへ保護補正を追加
- Card ValueへAdoption Evidenceを小さく反映
- 強い環境Evidenceがある場合のみ、デッキ外1色を「色追加候補」として残す
- Arena形式の環境デッキを手動追加し、ローカルEvidenceとして保存可能
- 観測デッキ率をメタシェア / 勝率とは明確に分離
- User Evidence / Rule Evidence / Adoption Evidenceを別系統で維持
- app.js / styles.css cache busterをv0.7.2へ更新

# v0.7.1 - Evidence & Learning Foundation

- 最適化案 / Swap提案へGood / Badフィードバックを追加
- 的外れ理由を6分類で記録
- `OUTカードが重要` / `シナジーを壊す` のフィードバックからUser-confirmed Coreを自動生成
- デッキ内カードの手動Core指定 / 解除を追加
- User-confirmed CoreをDeck OptimizerのOUT候補から除外
- 過去のGood / BadをIN候補・OUT→INペアの順位へ反映
- カード本文から複数役割・継続価値・ルーティング・ダメージ・サーチ等を一次評価するCard Valueを追加
- 高Card ValueカードへのOUTペナルティを追加
- 学習状況パネル、最近の学習、Card Value上位表示を追加
- User-confirmed / Parsed / InferredのEvidence区分を明示
- IndexedDB + localStorageへローカル学習データを保存
- 採用実績 / 大会結果 / メタゲームはまだ未実装であることを明示
- app.js / styles.cssキャッシュバスターをv0.7.1へ更新

# v0.7.0b - Strict Primary Objective Alignment hotfix

- 最優先課題を候補スコアの加点要素からハード条件へ変更
- IN候補は画面に表示された最優先課題へ直接対応するカードだけに限定
- OUT→IN後のデッキ再解析で、最優先課題が実際に改善したかを専用評価
- 全体評価や別課題が改善しても、最優先課題が改善しない案を除外
- 最優先課題に対応する安全な案がない場合、無関係な候補へフォールバックしない
- 最適化案に「最優先課題 ○→○」の改善根拠を追加

# v0.7.0a - Deck Optimization Candidate Search hotfix

- v0.7.0の最適化案が既存Swap Planner候補の再利用に依存していた問題を修正
- デッキの優先課題からIN候補をカードプール全体へ再探索
- 不足役割、未接続経路、土地、マナカーブ、過剰役割を候補探索の目的関数へ反映
- デッキ外色、不要な土地交換、Verified中核のOUTを抑制
- OUT→IN適用後のDeck Foundation / deficits / gaps / connectionsを再計算して選別
- 通常の入れ替え提案も課題起点候補を優先

# v0.7.0 - Deck Optimization Engine α
- デッキ分析に「デッキ最適化」パネルを追加
- Deck Foundationの不足・過剰・効果接続・マナカーブから優先課題を抽出
- 検証済みシナジー構成カードを自動交換から保護
- 1枚減らすだけで効果接続減少・不足増加・全体評価低下が起きるカードを依存度評価し、安易なOUTを抑制
- Swap Plannerの各案を、デッキの優先課題にどれだけ寄与するかで再評価
- 最大変更枚数の範囲で1～3個の交換を組み合わせた最適化プランを探索
- 複数交換をすべて適用した後のDeck Foundation score、役割不足、効果接続、不足・孤立を再計算
- 全体評価が改善しないプラン、新しい役割不足を増やすだけのプラン、接続を悪化させるだけのプランを除外
- 最適化案を1操作でメインデッキへ適用し、サイドボードを維持
- 最適化案の適用をSwap Undo履歴へ保存
- app.js / styles.cssキャッシュバスターをv0.7.0へ更新
- Rule Engineはβ-9を維持

# v0.6.10 - Deck Analysis Foundation
- 通常の土地をマナ加速から除外し、マナ基盤として別分類
- 特殊な追加マナ能力を持つ土地のみRamp候補として扱う判定を追加
- メインデッキ / サイドボードを別入力へ変更
- Arena一括リスト内のSideboardを解析時に別欄へ自動分離
- Deck Stats / Deck Intelligence / Consistencyはメインのみを母集団に使用
- サイドボード枚数とMain / Side別の解析済み一覧を追加
- 入れ替え提案へDeck Foundation scoreを追加
- 交換後のデッキ全体評価が改善しない案を除外
- 不足役割を壊す交換、効果接続だけを悪化させる交換、役割継承も不足補完もない交換を抑制
- Swap適用 / Undoでサイドボードを変更しない
- 保存デッキでMain / Sideを別々に保持し、コピー時はArena形式へ再結合
- app.jsキャッシュバスターをv0.6.10へ更新

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

## v0.7.3d
- 入れ替え提案の課題ポリシーを4状態へ分離：`優先 = Hard` / `注意 = Soft` / `監視 = Monitor` / `問題なし = Quality Optimization`。
- `注意` 以下では最優先課題を候補生成のハードゲートにしないよう変更。
- 最優先課題とは独立した「同役割Candidate Quality改善レーン」を追加。
- 明確な不足がない場合は、同役割でCQが明確に上昇し、Deck Foundationを悪化させない交換のみ任意提案。
- Bad済みOUT→INペア、およびINカード自体が弱い／役割違い等でBad評価された候補は品質最適化レーンでも除外。
- 改善案がない場合の表示を、課題レベルに応じた「現状維持」メッセージへ変更。


## v0.7.3e
- GOOD/BAD学習後の再計算経路を一本化
- 旧経路で発生していたOptimizerの二重再計算を解消
- 学習保存の通知を重い再計算より先に描画
- Candidate Quality / Bad学習ロジック自体は維持
- app.js / styles.css cache busterをv0.7.3eへ更新


### v0.7.3f: GOOD/BAD即時学習
- GOOD/BAD/Coreクリック時の全候補再探索を廃止
- 学習データはクリック時に即保存
- Bad/Coreで現在表示中の不適切案だけを即時除外
- GoodのUser Evidenceと学習パネルは即時更新
- 全候補の再ランキングは次回の「再分析」または「最適化案を再計算」で実行
- 学習クリックによる数十秒のUIブロックを回避
