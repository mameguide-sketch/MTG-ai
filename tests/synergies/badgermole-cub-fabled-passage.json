# Lunch Forge Event & State Dictionary v0.1

**ステータス:** Initial Draft  
**対象:** Knowledge Engine Phase 2–4  
**目的:** カード文章を、検索可能なイベント・状態・条件・処理へ変換するための共通語彙を定義する。

---

## 1. 命名規則

- イベント：過去に起きた瞬間的事実。大文字スネークケース。
- 状態：現在成立している事実。`STATE_`で開始。
- 条件：能力が要求する判定。`COND_`で開始。
- 処理：ゲームへ変更を加える命令。`ACTION_`で開始。
- 領域：`ZONE_`で開始。
- 数値修整は、元値、カウンター、継続的修整を分離して保持する。
- カード文章から推定した値には信頼度と出所を持たせる。

---

## 2. 領域

| ID | 意味 |
|---|---|
| `ZONE_LIBRARY` | ライブラリー |
| `ZONE_HAND` | 手札 |
| `ZONE_BATTLEFIELD` | 戦場 |
| `ZONE_GRAVEYARD` | 墓地 |
| `ZONE_EXILE` | 追放領域 |
| `ZONE_STACK` | スタック |
| `ZONE_COMMAND` | 統率領域 |

---

## 3. カード移動イベント

| ID | 意味 | 主な属性 |
|---|---|---|
| `CARD_DISCARDED` | 手札からカードを捨てた | card, player, costOrEffect |
| `CARD_MILLED` | ライブラリーから墓地へ置かれた | card, player, count |
| `CARD_MOVED_ZONE` | 一般的な領域移動 | card, from, to, cause |
| `PERMANENT_CARD_PUT_IN_GRAVEYARD` | パーマネント・カードが墓地へ置かれた | card, from, controller |
| `PERMANENT_LEFT_BATTLEFIELD` | パーマネントが戦場を離れた | permanent, destination |
| `PERMANENT_ENTERED_BATTLEFIELD` | パーマネントが戦場へ出た | permanent, tapped |
| `RETURNED_FROM_GRAVEYARD` | 墓地から別領域へ戻った | card, destination |
| `RETURNED_TO_BATTLEFIELD` | 戦場へ戻った | card, tapped |

### 注意

`CARD_DISCARDED`は手札から捨てる場合だけである。  
`CARD_MILLED`やライブラリーから直接墓地へ置く処理とは区別する。

---

## 4. パーマネント関連イベント

| ID | 意味 |
|---|---|
| `PERMANENT_SACRIFICED` | 生け贄に捧げられた |
| `CREATURE_DIED` | クリーチャーが戦場から墓地へ置かれた |
| `PERMANENT_EXILED` | パーマネントが追放された |
| `EQUIP_ABILITY_ACTIVATED` | 装備能力が起動された |
| `EQUIPMENT_ATTACHED` | 装備品がクリーチャーへついた |
| `EQUIPMENT_UNATTACHED` | 装備品が外れた |
| `COUNTER_ADDED` | カウンターが置かれた |
| `COUNTER_REMOVED` | カウンターが取り除かれた |
| `TYPE_CHANGED` | カード・タイプが変化した |
| `ABILITY_GRANTED` | 能力が付与された |

### 複合イベント

1つの処理が複数イベントを発生させる場合がある。

例：土地・クリーチャーである寓話の小道を生け贄にする。

```text
PERMANENT_SACRIFICED
CARD_MOVED_ZONE: battlefield → graveyard
PERMANENT_LEFT_BATTLEFIELD
CREATURE_DIED
```

---

## 5. 土地関連イベント

| ID | 意味 |
|---|---|
| `LAND_ENTERED_BATTLEFIELD` | 土地が戦場へ出た |
| `LAND_SACRIFICED` | 土地が生け贄に捧げられた |
| `LAND_BECAME_CREATURE` | 土地がクリーチャーになった |
| `LAND_RETURNED_TO_BATTLEFIELD` | 土地が戦場へ戻った |
| `LAND_SEARCH_STARTED` | 土地サーチを開始した |
| `LAND_FOUND` | 条件に合う土地を見つけた |
| `LAND_UNTAPPED` | 土地がアンタップされた |
| `LANDFALL_WINDOW_CREATED` | 上陸能力が誘発し得る土地戦場入りが発生した |

---

## 6. 戦闘関連イベント

| ID | 意味 |
|---|---|
| `BEGINNING_OF_COMBAT` | 戦闘開始ステップの開始 |
| `ATTACKERS_DECLARED` | 攻撃クリーチャー指定 |
| `CREATURE_ATTACKED` | 特定クリーチャーが攻撃した |
| `COMBAT_DAMAGE_DEALT` | 戦闘ダメージが与えられた |
| `CREATURE_RETURNED_BEFORE_ATTACKERS` | 攻撃指定前に速攻持ちが戻った |

---

## 7. マナ・コスト関連イベント

| ID | 意味 |
|---|---|
| `ABILITY_ACTIVATION_STARTED` | 起動型能力の起動を開始 |
| `ACTIVATION_COST_PAID` | 起動コストを支払った |
| `MANA_PAID` | マナを支払った |
| `CARD_DISCARDED_AS_COST` | カードをコストとして捨てた |
| `PERMANENT_SACRIFICED_AS_COST` | パーマネントをコストとして生け贄にした |
| `PERMANENT_TAPPED_AS_COST` | パーマネントをコストとしてタップした |
| `MANA_ADDED` | マナが加えられた |

---

## 8. 誘発・スタック関連イベント

| ID | 意味 |
|---|---|
| `TRIGGER_CONDITION_MET` | 誘発条件が満たされた |
| `TRIGGERED_ABILITY_CREATED` | 誘発型能力が生成された |
| `TRIGGERED_ABILITY_PUT_ON_STACK` | 誘発型能力がスタックへ置かれた |
| `ACTIVATED_ABILITY_PUT_ON_STACK` | 起動型能力がスタックへ置かれた |
| `ABILITY_RESOLVED` | 能力が解決した |
| `ABILITY_COUNTERED` | 能力が打ち消された |
| `DELAYED_TRIGGER_CREATED` | 遅延誘発型能力が作られた |

---

## 9. 数値・特性の状態

| ID | 意味 | 例 |
|---|---|---|
| `STATE_BASE_POWER` | 印刷またはコピー可能値の基本パワー | 月影=7 |
| `STATE_BASE_TOUGHNESS` | 基本タフネス | 月影=7 |
| `STATE_POWER_MODIFIER_COUNTERS` | カウンター由来のパワー修整 | －6 |
| `STATE_TOUGHNESS_MODIFIER_COUNTERS` | カウンター由来のタフネス修整 | －6 |
| `STATE_POWER_MODIFIER_CONTINUOUS` | 装備品等の継続的修整 | ＋2 |
| `STATE_TOUGHNESS_MODIFIER_CONTINUOUS` | 継続的修整 | ＋1 |
| `STATE_EFFECTIVE_POWER` | 現時点の実効パワー | 4 |
| `STATE_EFFECTIVE_TOUGHNESS` | 現時点の実効タフネス | 3 |
| `STATE_COUNTER_COUNT` | 特定カウンターの個数 | -1/-1=5 |
| `STATE_IS_EQUIPPED` | 装備済みか | true |
| `STATE_HAS_HASTE` | 速攻を持つか | true |
| `STATE_IS_CREATURE` | クリーチャーか | true |
| `STATE_IS_LAND` | 土地か | true |
| `STATE_IS_TAPPED` | タップ状態か | true |

### 実効パワーの初期計算

```text
実効パワー
= 基本パワー
+ カウンターによる修整
+ 継続的効果による修整
+ 一時的効果による修整
```

将来は種類別適用順、特性定義能力、パワー交換などを追加する。

---

## 10. 領域・存在状態

| ID | 意味 |
|---|---|
| `STATE_CARD_IN_HAND` | カードが手札にある |
| `STATE_CARD_IN_GRAVEYARD` | カードが墓地にある |
| `STATE_CARD_ON_BATTLEFIELD` | カードが戦場にある |
| `STATE_CARD_IN_EXILE` | カードが追放領域にある |
| `STATE_CONTROLLER_HAS_CREATURE` | クリーチャーをコントロール |
| `STATE_CONTROLLER_HAS_LAND_COUNT` | 土地数 |
| `STATE_PERMANENT_CARD_ENTERED_GRAVEYARD` | パーマネント・カードが墓地へ置かれた事実 |
| `STATE_LAND_ETB_COUNT_THIS_TURN` | このターンの土地戦場入り回数 |

---

## 11. 条件

| ID | 判定 |
|---|---|
| `COND_SELF_HAS_MINUS_COUNTER` | 自身に－1/－1カウンターがある |
| `COND_PERMANENT_CARD_PUT_IN_YOUR_GRAVEYARD` | パーマネント・カードが自分の墓地へ置かれた |
| `COND_CONTROL_CREATURE_POWER_GTE` | 指定パワー以上のクリーチャーをコントロール |
| `COND_SELF_IN_GRAVEYARD` | 自身が墓地にある |
| `COND_BEGINNING_OF_COMBAT_YOUR_TURN` | 自分のターンの戦闘開始時 |
| `COND_MANA_AVAILABLE` | 必要マナを支払える |
| `COND_TARGET_IS_LAND_YOU_CONTROL` | 対象が自分の土地 |
| `COND_OBJECT_DIED_OR_EXILED` | 対象が死亡または追放された |
| `COND_CONTROL_LANDS_GTE` | 指定数以上の土地をコントロール |
| `COND_ACTIVATE_ONLY_AS_SORCERY` | ソーサリーを唱えられるタイミングのみ |

---

## 12. 処理

| ID | 意味 |
|---|---|
| `ACTION_DISCARD_CARD` | カードを捨てる |
| `ACTION_REMOVE_COUNTER` | カウンターを取り除く |
| `ACTION_ADD_COUNTER` | カウンターを置く |
| `ACTION_ATTACH_EQUIPMENT` | 装備品をつける |
| `ACTION_APPLY_PT_MODIFIER` | パワー／タフネス修整を適用 |
| `ACTION_PAY_MANA` | マナを支払う |
| `ACTION_RETURN_FROM_GRAVEYARD` | 墓地から戻す |
| `ACTION_EARTHBEND` | 土の技を行う |
| `ACTION_CHANGE_TYPE` | カード・タイプを変更 |
| `ACTION_GRANT_HASTE` | 速攻を付与 |
| `ACTION_SACRIFICE` | 生け贄に捧げる |
| `ACTION_SEARCH_BASIC_LAND` | 基本土地を探す |
| `ACTION_PUT_ON_BATTLEFIELD_TAPPED` | タップ状態で戦場へ出す |
| `ACTION_UNTAP` | アンタップする |

---

## 13. v0.1で検証する代表経路

### 月影＋血茨のフレイル＋炎跡のフェニックス

```text
CARD_DISCARDED_AS_COST
→ PERMANENT_CARD_PUT_IN_GRAVEYARD
→ TRIGGERED_ABILITY_CREATED
→ COUNTER_REMOVED
→ STATE_EFFECTIVE_POWER: 1 → 2
→ EQUIPMENT_ATTACHED
→ STATE_EFFECTIVE_POWER: 2 → 4
→ COND_CONTROL_CREATURE_POWER_GTE(4)
→ BEGINNING_OF_COMBAT
→ MANA_PAID({R})
→ RETURNED_FROM_GRAVEYARD
```

### アナグマモグラの仔＋寓話の小道

```text
ACTION_EARTHBEND(1)
→ LAND_BECAME_CREATURE
→ COUNTER_ADDED(+1/+1)
→ PERMANENT_SACRIFICED_AS_COST
→ CREATURE_DIED
→ TRIGGERED_ABILITY_CREATED
→ LAND_RETURNED_TO_BATTLEFIELD
→ LAND_ENTERED_BATTLEFIELD
→ ABILITY_RESOLVED(Fabled Passage)
→ LAND_ENTERED_BATTLEFIELD
→ STATE_LAND_ETB_COUNT_THIS_TURN += 2
```

---

## 14. 次版で追加予定

- 置換効果
- 状況起因処理
- 効果の種類別適用順
- 対象不適正
- 「場合（if）」の介在条件
- 1回以上をまとめて監視する誘発
- コピー
- 変身
- 合体
- トークン消滅
- 統率者戦の領域移動置換
