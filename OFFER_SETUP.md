# Offer setup

実案件は **作成 → 検査 → 人間がASP/広告主条件を確認 → 明示的に有効化** の順で登録します。AIや日次botが勝手に案件をactiveへ変更する設計にはしていません。

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
- localhost / loopback / reserved placeholder URLでないこと
- URLに埋め込み認証情報がないこと
- Web媒体が許可対象として登録されていること
- ValueCommerceのProgram ID
- 情報源・確認日・TTL
- 未来日のcheckedAtでないこと
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

Activation時には案件単体だけでなく、**サイト全体の `npm run verify`** を実行します。

- deterministic self-test
- URL safety test
- secret / private-data scan
- readiness
- Astro check
- content / freshness
- build
- internal link / disclosure / canonical / sitemap / robots / health / Analytics / rendered affiliate CTA smoke test

のどこかが失敗した場合は、案件ファイルをactivation前の状態へ自動ロールバックします。

activeになった案件は比較ページへ自動表示されます。A8ではCTAにpage/offer/CTA/positionの追跡IDが付きます。

## 7. 案件終了・一時停止

広告主側で案件が終了した、提携状態に不安がある、条件確認が必要になった場合は、activeのまま放置せず即座にpauseできます。

```bash
npm run offer:pause -- sample-a8 --reason "campaign ended"
```

`paused`案件は比較対象とCTAから外れます。

pauseは安全側の操作なので、その後のfull-site verifyが別要因で失敗しても**activeへ自動で戻しません**。paused状態を維持したままエラーを出します。

## 8. 日次のSafety Pause

ローカル日次botは最初に:

```bash
npm run offer:safety-scan
```

を実行します。

active案件が機械的な必須条件を満たさなくなった場合だけ、自動で `paused` へ移します。例:

- FactのTTL切れ
- checkedAtが未来日
- 広告URL / 公式URL / 情報源URLが不正
- 必須タグや媒体条件などの整合性エラー

この処理は**停止専用**です。

- draft → active は絶対に行わない
- paused → active は絶対に行わない
- Fact / URL / tagsを自動で書き換えない
- active → paused 以外の変更は自動commit不可

日次botがSafety Pauseをcommitする場合も、GitのHEADと比較して「`status / pausedAt / pauseReason`以外が一切変化していない」ことを再検証します。

また、公開済みサイトではactive案件が0件になっても安全な停止デプロイは許可します。これにより、最後の案件が終了した時に**古いCTAを消すデプロイ自体がreadinessに阻止される逆転事故**を防ぎます。

一方、初回公開の `npm run launch:check` では少なくとも1件のactive案件を必須にします。

## 9. 再開

再開する場合は、最新のASP/広告主条件・Fact・TTLをもう一度確認した上で:

```bash
npm run offer:check -- sample-a8
npm run offer:activate -- sample-a8 --confirm-rules-reviewed
```

とします。自動再開はしません。

## 更新時

料金・条件・summaryなどを変更した場合は、必ず該当Factの `source` と `checkedAt` を更新します。TTLを超えたactive案件はSafety Pauseまたはbuild gateで停止されるため、古い条件のまま再公開しにくい構造です。

案件URLへ `example.com` 等のプレースホルダー、`.invalid` / `.test`、localhost、HTTP URL、埋め込み認証情報を残したactive化もvalidationで拒否します。
