# v0.6.7a timing hotfix
- [ ] Header shows v0.6.7a
- [ ] Rule Engine shows β-7a
- [ ] Moonshadow + Bloodthorn Flail + Flamewake Phoenix shows theoretical fastest 2T
- [ ] The Moonshadow plan shows T1 Moonshadow, T2 Flail, discard equip cost, then {R} Phoenix return
- [ ] Badgermole Cub + Fabled Passage shows theoretical fastest 3T without acceleration
- [ ] Unverified combinations are labeled 印刷MVベース（暫定）
- [ ] Existing Rule Path / Strategy / Priority / Stack functions still render

# v0.6.7 確認項目

- [ ] 画面上部が v0.6.7
- [ ] ルール検証が Rule Engine β-7
- [ ] ルール検証に「デッキ分析ページの現在のデッキリストを再現性評価に使用」が表示される
- [ ] 先攻 / 後攻を切り替えられる
- [ ] カードを2～3枚解析すると「再現性・成立ターン評価」が表示される
- [ ] Consistency score / A～E評価が表示される
- [ ] 3T / 4T / 5Tの自然到達率が表示される
- [ ] マナ上の理論最速ターンが表示される
- [ ] デッキ入力済みの場合、必要パーツの実際の採用枚数が表示される
- [ ] デッキに存在しない必要パーツがある場合「未採用パーツ」と表示される
- [ ] 土地到達率、色マナ難度、アクセス補助、単体依存度が表示される
- [ ] Rule Path / Strategy Value / Stack / Priority / State / Event Graphが従来どおり表示される
- [ ] 月影＋血茨のフレイル＋炎跡のフェニックスを解析できる
- [ ] アナグマモグラの仔＋寓話の小道を解析できる
- [ ] 日本語補完、デッキ分析、入れ替え提案が従来どおり動く

# v0.6.8 Game Plan Engine β-8 確認項目
- [ ] 画面上部が v0.6.8
- [ ] ルール検証が Rule Engine β-8
- [ ] 2～3枚解析すると「デッキ全体への貢献度」が表示される
- [ ] Game Plan score / A～E評価が表示される
- [ ] 序盤 / 中盤 / 終盤の担当が表示される
- [ ] 各カードに主エンジン / 成立支援 / 利益変換 / フィニッシャー等の役割が表示される
- [ ] 各カードの単体価値が表示される
- [ ] デッキ入力済みの場合、同役割の代替枚数と役割重複が表示される
- [ ] 「勝ち筋までの経路」に Direct / Indirect / Incomplete のいずれかが表示される
- [ ] 強いRule Pathでも役割重複が大きい場合、採用優先度を下げる説明が出る
- [ ] 単体カード探索の候補に Game Plan score が表示される
- [ ] 構築相談の候補に Game Plan score が表示される
- [ ] デッキ分析の推薦候補に Game Plan score が表示される
- [ ] 月影＋血茨のフレイル＋炎跡のフェニックスの理論最速は引き続き2T
- [ ] Rule Path / Strategy / Consistency / Priority / Stack / State / Event Graphが従来どおり表示される
- [ ] 日本語補完、入れ替え提案、保存デッキが従来どおり動く

# v0.6.9 Recommendation Decision Engine β-9 確認項目
- [ ] 画面上部が v0.6.9
- [ ] ルール検証が Rule Engine β-9
- [ ] 2～3枚解析すると「最終推薦判定」が表示される
- [ ] Recommendation score / A～E評価が表示される
- [ ] Rule Path / Strategy / Consistency / Game Plan の4軸が同時表示される
- [ ] 「最大のボトルネック」が表示される
- [ ] 「推薦する理由」と「採用前に確認する点」が別々に表示される
- [ ] 低い評価軸がある組み合わせは、他の軸が高くてもRecommendationが過度に高くならない
- [ ] デッキに未採用パーツがある場合「現デッキでは成立不可」になる
- [ ] 月影＋血茨のフレイル＋炎跡のフェニックスの理論最速は2Tのまま
- [ ] 月影セットでRecommendation判定が表示される
- [ ] 単体カード探索の候補に Recommendation score が表示される
- [ ] 構築相談の候補に Recommendation score が表示される
- [ ] デッキ分析の推薦候補に Recommendation score が表示される
- [ ] Rule Path / Strategy / Consistency / Game Plan / Priority / Stack / State / Event Graphが従来どおり表示される
- [ ] 日本語補完、入れ替え提案、保存デッキが従来どおり動く

# v0.6.10 Deck Analysis Foundation 確認項目
- [ ] 画面上部が v0.6.10
- [ ] デッキ分析に「メインデッキ」と「サイドボード」の別入力欄がある
- [ ] Arena形式の一括リストをメイン欄へ貼り、`Sideboard` がある場合は解析後にサイド欄へ自動分離される
- [ ] メイン枚数とサイド枚数が別々に表示される
- [ ] 解析済みデッキがMain / Sideに分けて表示される
- [ ] Forest / Swamp / 通常の2色土地などが「マナ加速」に数えられない
- [ ] Llanowar Elvesなど、実際に追加マナを供給する非土地カードは「マナ加速」に数えられる
- [ ] Fabled Passageのような通常の土地交換カードは「マナ加速」に数えられない
- [ ] サイドボードのカードを増減しても、メインの土地枚数・平均MV・マナカーブ・役割構成が変わらない
- [ ] ルール検証のConsistencyで「現在のメインデッキ」を参照し、サイドを確率母集団に含めない
- [ ] 入れ替え提案に「交換後のデッキ全体評価」が表示される
- [ ] 交換後の全体評価が改善しない案は表示されない
- [ ] 必要な役割を失うだけの入れ替え案が抑制される
- [ ] 入れ替えを実行してもサイドボード欄は変更されない
- [ ] Undoでメインとサイドが正しく元に戻る
- [ ] 保存→再読込でメインとサイドが別々に復元される
- [ ] 「デッキをコピー」でMain + Sideboard形式のArenaリストがコピーされる
- [ ] Recommendation / Rule Path / Strategy / Consistency / Game Plan / Priority / Stackが従来どおり動く
- [ ] 月影セットの理論最速2Tが維持される
