# Lunch Forge v0.5.4c

## v0.5.4c カードデータ復旧

オンライン再取得に失敗しても、表示中または保存済みのカードデータを保持します。大容量カードデータは localStorage ではなく IndexedDB に保存し、通信障害でカード一覧と日本語監査が0件になる問題を防止します。

日本語優先のMTGスタンダード向けカード・デッキ構築支援ツールです。

## v0.5.4c 日本語データ補完基盤

カード検索画面に「日本語データ監査」を追加しました。

- 日本語名・日本語ルール文章・日本語画像の不足を個別に検出
- 両面カードは表面・裏面ごとに不足を確認
- 不足件数と不足カード一覧を表示
- `card-data-audit.json`として監査結果を書き出し
- 絞り込んだ不足カードから`card-overrides-template.json`を生成
- `data/card-overrides.json`を起動時に読み込み、不足項目だけを手動補完
- 補完JSONを更新した後、「補完データ再読込」で即時反映
- Scryfallの日本語データがある項目はそのまま使用し、補完データは不足項目へ重ねて適用

## `card-overrides.json`の形式

```json
{
  "version": "1.0",
  "cards": [
    {
      "oracle_id": "カードのoracle_id",
      "name_en": "English Card Name",
      "printed_name": "日本語カード名",
      "printed_type_line": "日本語タイプ行",
      "printed_text": "日本語ルール文章",
      "image_uris": { "normal": "日本語画像URL" },
      "card_faces": [],
      "note": "補完根拠など"
    }
  ]
}
```

空欄は上書きされません。両面カードは`card_faces`へ表面、裏面の順に入力します。

## GitHub Pagesへの更新

リポジトリ最上位の6ファイルを上書きします。

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `CHANGELOG.md`
- `CHECKLIST.md`

さらに既存の`data`フォルダーを開き、次の2ファイルをアップロードします。

- `data/card-overrides.json`
- `data/card-data-audit.json`

推奨コミットメッセージ：

```text
feat: add Japanese data audit and overrides v0.5.4c
```

## 継続している機能

- Deck Intelligence
- 日本語データ取得と日本語優先表示
- 両面カードの表面／裏面／両面表示
- Synergy / Enable / Engine / Support / Coverage分類
- 検証済みシナジー事例
- カード検索、カード辞書、Card Inspector、Knowledge Engine、Card Synergy Advisor


## v0.5.4c hotfix

日本語データ取得処理を安定版の経路へ戻し、日本語補完・監査処理を取得完了後に独立実行する構成へ変更しました。補完JSONの読み込み失敗がScryfall日本語データ取得を妨げないよう分離しています。
