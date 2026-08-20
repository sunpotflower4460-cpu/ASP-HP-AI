# Production setup

V1はコード側をほぼ無料で動かせます。本人確認・ASP提携・Cloudflare/Google所有権確認など、外部サービス側で必要な操作だけ人間が行います。

## 0. ローカル準備

Node.js 22+ を使用します。

```bash
npm install
cp .env.local.example .env.local
```

最初は:

```text
LOCAL_AUTOMATION_ENABLED=false
LOCAL_AUTO_PUSH=false
PUBLIC_READY=false
AI_EDITOR_ENABLED=false
EDITOR_AUTO_APPLY_TITLE=false
```

のまま進めます。

## 1. サイト基本情報

推奨:

```bash
npm run site:configure -- \
  --name "サイト名" \
  --url "https://your-domain.example" \
  --description "サイト説明" \
  --operator "運営者名" \
  --contact "contact@example.jp"
```

`data/site.json`を直接編集しても構いません。

必要項目:

- 実HTTPS URL
- サイト名
- 運営者表示
- 問い合わせ先
- 説明文

この段階では `PUBLIC_READY=false` のままです。

## 2. Cloudflare Pages（GitHub Actions不要）

Cloudflare PagesをこのGitHubリポジトリへ直接接続します。

- Production branch: `main`
- Framework preset: Astro または None
- Build command: `npm run cloudflare:build`
- Build output directory: `dist`
- Root directory: repository root
- Node.js: 22+

Preview環境:

```text
PUBLIC_READY=false
```

Production環境も最初は `PUBLIC_READY=false` のまま確認します。

`cloudflare:build`はself-test、private-data/secret検査、readiness、Astro check、content/freshness、build、Smoke Testを通します。known preview branchで `PUBLIC_READY=true` は拒否されます。

## 3. A8.net

A8でWebサイトを登録し、案件との提携を行います。案件ごとに成果条件・禁止事項・Web掲載可否を確認してください。

案件登録:

```bash
npm run offer:new -- \
  --id my-offer \
  --name "サービス名" \
  --asp a8 \
  --affiliate-url "https://..." \
  --official-url "https://..." \
  --summary "公式情報で確認した説明" \
  --tags "home-router"

npm run offer:check -- my-offer
npm run offer:activate -- my-offer --confirm-rules-reviewed
```

必ずdraftから開始します。AIは案件をactive化しません。

A8成果は公式CSVを使用します。

```bash
npm run a8:import -- /path/to/report.csv
npm run affiliate:normalize
```

半自動化する場合 `.env.local`:

```text
A8_AUTO_IMPORT_FILE=imports/a8-report.csv
A8_CSV_ENCODING=shift_jis
```

規約不明な自動スクレイピングは行いません。

## 4. ValueCommerce（任意）

利用する場合だけ管理画面からレポートAPI認証情報を取得します。

`.env.local`:

```text
VALUECOMMERCE_CLIENT_KEY=
VALUECOMMERCE_CLIENT_SECRET=
VALUECOMMERCE_LOOKBACK_DAYS=30
```

確認:

```bash
npm run vc:fetch
npm run affiliate:normalize
```

## 5. Search Console

Google Search Consoleでサイト所有権を人間が確認します。その後、サービスアカウントを対象プロパティへ追加します。

`.env.local`:

```text
GSC_CLIENT_EMAIL=
GSC_PRIVATE_KEY=
GSC_SITE_URL=
GSC_DATA_MAX_AGE_HOURS=72
```

確認:

```bash
npm run gsc:fetch
npm run analyze
npm run gap:plan
npm run editor:plan
```

`gap:plan`は既存ページ改善・カニバリ・新ページ候補を提案しますが、新規ページを自動作成しません。

## 6. Google Analytics（任意・初期OFF）

### ブラウザ側

必要な場合だけCloudflare Production/Preview環境へ:

```text
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

未設定ならGoogle tagはHTMLへ出ません。

### Data API

日次分析へaffiliate outbound clickを取り込む場合:

```text
GA_PROPERTY_ID=123456789
GA_FETCH_REQUIRED=false
GA_DATA_MAX_AGE_HOURS=72
```

GA4 PropertyへサービスアカウントをViewerとして追加します。

専用アカウントを使う場合:

```text
GA_CLIENT_EMAIL=
GA_PRIVATE_KEY=
```

未設定ならSearch Console用サービスアカウントを再利用します。

確認:

```bash
npm run ga:fetch
npm run analyze
```

## 7. AI編集（任意・初期OFF）

最初はAIなしで構いません。deterministic analysisだけでも動きます。

利用する場合 `.env.local`:

```text
AI_EDITOR_ENABLED=true
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fast
```

```bash
npm run editor:ai
```

タイトル自動適用にはさらに:

```text
EDITOR_AUTO_APPLY_TITLE=true
```

と `data/editor-policy.json` の `autoApply.title=true` が必要です。

`data/budget.json`で月予算とcall数をハード制限します。

## 8. publicリポジトリのprivate operational data

このrepoはpublicです。以下はGitHubへpushしません。

```text
data/search-console/
data/analytics/
data/affiliate/*.json
data/ai-usage/
reports/
imports/
.env.local
```

`npm run security`でもtracked状態を検査します。

### private backup（任意）

`.env.local`:

```text
LOCAL_BACKUP_DIR=/Users/you/Documents/ASP-HP-AI-private-backups
LOCAL_BACKUP_RETENTION_DAYS=30
LOCAL_BACKUP_REQUIRED=false
```

```bash
npm run local:backup
npm run local:backup:verify
```

バックアップ先はGitリポジトリ外のみ許可され、SHA-256で整合性確認します。

## 9. ローカル自動運転を診断

`.env.local`を設定したら:

```bash
npm run local:doctor
```

主に次を確認します。

- main branch / clean worktree
- 公開URL
- GSC / GA / VCの設定整合
- AI設定整合
- backup必須条件
- backup先がrepo外かつ書込み可能か
- Node/platform

## 10. 公開前総合チェック

実ドメイン・運営者情報・active案件まで揃ったら:

```bash
npm run launch:check
```

これは:

```text
local:doctor
→ strict readiness
→ production verification
```

を通します。

`launch:check` PASS後も `PUBLIC_READY=false` のCloudflare Previewを目視確認してください。

確認項目:

- PR/広告表記
- 比較/診断導線
- ASPリンク
- Privacy
- 外部送信
- 問い合わせ
- モバイル表示
- `/health.json`

## 11. 本公開

最終確認後だけCloudflare Production環境を:

```text
PUBLIC_READY=true
SITE_URL=https://your-domain.example
```

へ変更します。

Cloudflare側で再buildされ、strict gateをPASSした場合のみ公開されます。

公開後、Search ConsoleへSitemapを送信:

```bash
npm run gsc:submit
```

## 12. 日次自動運転（CI不要）

最初は:

```text
LOCAL_AUTOMATION_ENABLED=true
LOCAL_AUTO_PUSH=false
```

手動テスト:

```bash
npm run local:doctor
npm run local:daily
```

公開ページ変更がある場合だけlocal commitが作られます。検索/収益データはlocal-onlyです。

問題なければ:

```text
LOCAL_AUTO_PUSH=true
```

macOSへ登録:

```bash
npm run local:install
```

`local:install`は `.env.local` を読み、doctorがPASSしない限り登録しません。

解除:

```bash
npm run local:uninstall
```

詳細は [LOCAL_AUTOMATION.md](./LOCAL_AUTOMATION.md) を参照してください。

## 13. Secret管理

秘密情報は `.env.local` またはCloudflare側の環境変数/Secretにのみ入れます。

```bash
npm run security
npm run verify
```

private key、典型API token、非公開運用データがGit管理下に入っていれば検証を停止します。
