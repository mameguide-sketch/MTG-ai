# v0.7.2a Deck Analysis Navigation チェック

- [ ] 画面上部のバージョンが v0.7.2a
- [ ] デッキ分析ページ上部にページ内ナビが表示される
- [ ] 「概要」で概要へ移動する
- [ ] 「マナ・役割」で診断・マナカーブ付近へ移動する
- [ ] 「Deck Intelligence」で該当セクションへ移動する
- [ ] 「入れ替え提案」でSwap Plannerへ移動する
- [ ] 「デッキ最適化」で最適化へ移動する
- [ ] 「学習」で学習・Evidenceへ移動する
- [ ] 「環境Evidence」でAdoption Evidenceへ移動する
- [ ] 「追加候補」でその他の追加候補へ移動する
- [ ] スクロールすると現在位置のナビボタンが自動で強調される
- [ ] 「↑ 上へ」でデッキ入力まで戻れる
- [ ] スクロール中もナビが画面上部に残る
- [ ] 画面幅が狭い場合はナビ項目を横スクロールできる
- [ ] v0.7.2の環境Evidence・学習・Optimizer・Swap機能が従来どおり動く

# v0.7.2 Adoption Evidence Engine 確認項目

- [ ] 画面上部が v0.7.2
- [ ] デッキ分析に「環境採用Evidence」パネルが表示される
- [ ] 公式Seedが8件と表示される
- [ ] Sourceが `Magic.gg Traditional Standard Ranked Decklists` / 2026-08-03 と表示される
- [ ] デッキ分析後「現在デッキに近い環境デッキ」が表示される
- [ ] Evidenceがある現在カードに「観測 x/y・平均x.x枚」が表示される
- [ ] 「共採用から見つけた候補」が表示される
- [ ] 《Cool but Rude / 華麗だが無礼者》を含む近いデッキでは `Official Snapshot · Mardu Cool/Rude` が類似候補に出る
- [ ] 《Cool but Rude / 華麗だが無礼者》にAdoption Evidenceが付く
- [ ] 類似成功デッキで採用EvidenceがあるカードはCard Value / OUT保護に補正される
- [ ] 最優先課題が除去/妨害の場合、役割一致の条件は引き続き維持される
- [ ] 環境Evidenceが強い1色外カードは、条件次第で「色追加候補」として残り、マナ源調整の注意が付く
- [ ] 「環境デッキを追加してEvidenceを育てる」を開ける
- [ ] Arena形式のMain / Sideboardを貼り、環境デッキとして追加できる
- [ ] 追加Evidence件数が増える
- [ ] 再読み込み後も手動追加Evidenceが残る
- [ ] 手動追加Evidenceだけを消去でき、公式Seed 8件は残る
- [ ] User-confirmed Core / Good / Bad学習が引き続き動作する
- [ ] Main / Sideboard分離が維持されている
- [ ] 通常土地がマナ加速に入らない
- [ ] Rule Engine、月影セット理論最速2Tなど既存機能が維持されている

## v0.7.2でまだ対象外
- [ ] Magic.gg等からの自動定期取得
- [ ] 完全なメタシェア推定
- [ ] マッチアップ別勝率
- [ ] 大会順位を重み付けした勝率モデル
