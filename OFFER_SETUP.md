# Offer setup

実案件は **作成 → 検査 → 人間がASP/広告主条件を確認 → 明示的に有効化** の順で登録します。AIや日次Workflowが勝手に案件をactiveへ変更する設計にはしていません。

## 1. A8案件をdraft作成

```bash
npm run offer:new -- \
  --id sample-a8 \
  --name "サービス名" \
  --asp a8 \
  --affiliate-url "https://実際のA8広告リンク" \
  --official-url "https://サービス公式ページ" \
  --summary "公式情報で確認した、比較画面に表示してよい短い説明" \
  --tags "home-router,no-construction" \
  --reward 7000 \
  --ttl 30
```

`--source` を省略すると `official-url` をsummaryの情報源として使います。別の公式ページを根拠にする場合だけ `--source` を指定します。

## 2. ValueCommerce案件をdraft作成

ValueCommerceは収益データとの照合にProgram IDを利用するため `--program-id` が必須です。

```bash
npm run offer:new -- \
  --id sample-vc \
  --name "サービス名" \
  --asp valuecommerce \
  --program-id "123456" \
  --affiliate-url "https://実際の広告リンク" \
  --official-url "https://サービス公式ページ" \
  --summary "公式情報で確認した説明" \
  --tags "fiber,work"
```

## 3. decisionTags

利用可能なタグと説明は `data/decision-tags.json` が唯一の定義です。タグは「売れそうだから」ではなく、公式情報・案件条件からその分類で扱ってよいと確認した場合だけ付けます。

主な例:

- `fiber`: 固定回線として比較
- `home-router`: ホームルーター等の工事不要型として比較
- `short-stay`: 短期居住の比較候補
- `work`: 在宅勤務の比較候補
- `gaming`: ゲーム用途の比較候補
- `no-construction`: 新規回線工事を前提としない

## 4. draftを検査

```bash
npm run offer:check -- sample-a8
```

以下を機械検査します。

- 実HTTPSの広告URL・公式URL
- Web媒体が許可対象として登録されていること
- ValueCommerceのProgram ID
- 情報源・確認日・TTL
- 期限切れFactがないこと
- decisionTagsが中央レジストリと一致すること
- 比較画面に使えるsummaryがあること

## 5. 人間が確認すること

機械検査PASSだけではactiveにしません。ASP管理画面と広告主の最新条件で最低限以下を確認します。

- 自サイトへの掲載が許可されている
- 提携承認済み
- 成果条件・否認条件
- 広告素材や商標の利用条件
- 禁止表現・禁止キーワード
- リスティングやSNS等、今回使わない媒体を含む個別条件
- 登録したsummary / tagsが公式条件と矛盾しない

## 6. 明示的にactive化

確認後だけ次を実行します。

```bash
npm run offer:activate -- sample-a8 --confirm-rules-reviewed
```

Activation時に再度validationとfreshnessを実行し、失敗した場合はファイルを元のdraftへ自動ロールバックします。

activeになった案件は比較ページへ自動表示されます。A8ではCTAにpage/offer/CTA/positionの追跡IDが付きます。

## 更新時

料金・条件・summaryなどを変更した場合は、必ず該当Factの `source` と `checkedAt` を更新します。TTLを超えたactive案件はbuild自体が失敗するため、古い条件のまま再公開しにくい構造です。
