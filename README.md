# ASP-HP-AI

低固定費で運用する、HP中心の自律成長型アフィリエイトサイトV1です。

## 目標

- HPを主媒体にする
- 動画生成・広告費を前提にしない
- A8 / ValueCommerce等をAdapter化する
- Search Consoleを主なSEO観測データにする
- GA4は任意でaffiliate outbound clickだけ補助観測する
- AIは大量記事生成ではなく、必要な改善だけに使う
- 初期AI予算は月300円・月40callを上限にする
- PR表記、事実ソース、情報鮮度、秘密情報、公開条件をコードで強制する
- GitHub Actions/CIなしで検証・公開・日次運転できる

## 重要: このGitHubリポジトリはpublic

以下の運用データはGitHubへcommitしません。

```text
data/search-console/
data/analytics/
data/affiliate/*.json
data/ai-usage/
reports/
imports/
.env.local
```

日次botが自動commitできるのは原則 `src/pages/**` の公開ページ変更だけです。検索語、アクセス、ASP成果、収益額はMacローカルに残します。

必要なら `LOCAL_BACKUP_DIR` を使い、Gitリポジトリ外へSHA-256付き世代バックアップできます。

## 技術構成

```text
Google Search
  ↓
Astro static site
  ↓
A8 / ValueCommerce

Search Console / GA4 / ASP成果
  ↓
Mac local-only analysis
  ↓
Commercial Intent + deterministic rules
  ↓
optional low-cost AI editor
  ↓
verify
  ↓
public src/pages change only
  ↓
GitHub
  ↓
Cloudflare Pages build gate
```

- Node.js: 22+
- Astro: static-first
- Hosting: Cloudflare Pages
- DB: V1では不要
- CI: GitHub Actions不要
- Scheduler: macOS launchd

## 開始

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

## まず覚えるコマンド

```bash
npm run verify          # ローカル品質ゲート
npm run local:doctor    # 自動運転前の環境診断
npm run launch:check    # 公開前の総合チェック
npm run ops:summary     # 今日の運用状態を1枚にまとめる
```

`verify` は次を実行します。

1. Commercial Intent + private backupの決定論的self-test
2. tracked secret / private operational data検査
3. readiness
4. Astro type/content check
5. content/freshness validation
6. build
7. 内部リンク・PR表記・canonical・sitemap・robots・health・Analytics整合Smoke Test

## サイト基本情報を設定

JSONを直接編集しなくても設定できます。

```bash
npm run site:configure -- \
  --name "サイト名" \
  --url "https://your-domain.example" \
  --description "サイト説明" \
  --operator "運営者名" \
  --contact "contact@example.jp"
```

このコマンドは `PUBLIC_READY` を変更しません。

## 実案件を登録

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

案件は必ずdraftから開始し、ASP/広告主条件を人間が確認した後だけactive化します。AIは案件を勝手にactive化しません。

## Search Console

`.env.local`へ設定すると各npmコマンドが自動で読み込みます。

```text
GSC_CLIENT_EMAIL=
GSC_PRIVATE_KEY=
GSC_SITE_URL=
GSC_DATA_MAX_AGE_HOURS=72
```

```bash
npm run gsc:fetch
npm run analyze
npm run gap:plan
npm run editor:plan
```

### Content Gap

`gap:plan`はSearch Consoleから:

- `EXPAND_EXISTING`
- `CANNIBALIZATION_REVIEW`
- `NEW_PAGE_REVIEW`

を候補化します。

**新規ページは提案のみで、自動作成しません。** 既存ページ改善を優先し、AI記事量産には戻らない設計です。

## A8成果取り込み

```bash
npm run a8:import -- /path/to/a8-report.csv
npm run affiliate:normalize
npm run analyze
```

`.env.local` の `A8_AUTO_IMPORT_FILE` を設定すると、所定の公式CSVを日次運転時に半自動取り込みできます。規約不明なA8スクレイピングは行いません。

## ValueCommerce成果

`.env.local`:

```text
VALUECOMMERCE_CLIENT_KEY=
VALUECOMMERCE_CLIENT_SECRET=
VALUECOMMERCE_LOOKBACK_DAYS=30
```

```bash
npm run vc:fetch
npm run affiliate:normalize
npm run analyze
```

## 任意GA4計測（初期OFF）

ブラウザ計測を使う場合だけ:

```text
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Data APIを日次分析へ入れる場合:

```text
GA_PROPERTY_ID=123456789
GA_FETCH_REQUIRED=false
```

`GA_CLIENT_EMAIL` / `GA_PRIVATE_KEY` を空にするとSearch Console用サービスアカウントを再利用します。

```bash
npm run ga:fetch
npm run analyze
```

GA4がOFFならGoogle tagはHTMLへ出ません。ONの場合はPrivacy/外部送信表示との矛盾もSmoke Testで検知します。

## AI編集長（初期OFF）

まず0円のdeterministic engineが改善候補を作ります。

```bash
npm run analyze
npm run editor:plan
```

Cloudflare Workers AIを使う場合のみ `.env.local`へ:

```text
AI_EDITOR_ENABLED=true
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fast
```

```bash
npm run editor:ai
```

検索クエリはUNTRUSTED DATAとして扱い、AIは未確認の価格・順位・体験談・緊急性・案件を追加できません。

### Cost Governor

`data/budget.json`で初期値:

- 月AI予算: 300円
- 月AI call上限: 40回

を強制します。有料AIは `ALLOW_PAID_AI=true` がない限り拒否します。

タイトル自動適用は:

- `EDITOR_AUTO_APPLY_TITLE=true`
- `data/editor-policy.json` の `autoApply.title=true`

が両方有効な場合だけです。確定収益ページ・proposal後にソースが変わったページは保護します。

## ローカル日次自動運転（CI不要）

最初は必ず:

```text
LOCAL_AUTOMATION_ENABLED=true
LOCAL_AUTO_PUSH=false
```

事前診断:

```bash
npm run local:doctor
```

手動で1回:

```bash
npm run local:daily
```

十分確認した後だけ `LOCAL_AUTO_PUSH=true` にします。

macOSへ登録:

```bash
npm run local:install
```

`local:install`は `.env.local` を読み、doctorがPASSしない限りlaunchd登録しません。

解除:

```bash
npm run local:uninstall
```

## private operational backup

任意で `.env.local`へ:

```text
LOCAL_BACKUP_DIR=/Users/you/Documents/ASP-HP-AI-private-backups
LOCAL_BACKUP_RETENTION_DAYS=30
LOCAL_BACKUP_REQUIRED=false
```

手動確認:

```bash
npm run local:backup
npm run local:backup:verify
```

- Gitリポジトリ外のみ許可
- `.env.local` / private key / raw A8 CSV / Git履歴はコピーしない
- 各snapshotにSHA-256 manifest
- `LOCAL_BACKUP_REQUIRED=true`ならbackup/verify失敗時に自動commitを停止

## CIなしのCloudflare公開

Cloudflare PagesをGitHubへ直接接続します。

- Production branch: `main`
- Build command: `npm run cloudflare:build`
- Output directory: `dist`
- Preview: `PUBLIC_READY=false`

known preview branchで `PUBLIC_READY=true` はbuild失敗します。`PUBLIC_READY=true`のbuildは原則strict verificationになります。

デプロイ後:

```text
https://your-domain.example/health.json
```

で実際のbranch/commit/publicReadyを確認できます。

## 公開直前

```bash
npm run launch:check
```

これは:

```text
local:doctor
→ strict readiness
→ full production verification
```

を通します。

`launch:check`がPASSしても、最終Cloudflare Previewを目視確認するまでは `PUBLIC_READY=false` を維持してください。本公開時だけProduction環境で `PUBLIC_READY=true` にします。

## 安全思想

- AIが外部情報を勝手に事実化しない
- active案件の事実が期限切れならbuild停止
- active案件のURL・公式情報源はHTTPSのみ
- A8以外へ未知の追跡パラメータを勝手に付けない
- AI停止中でも静的サイトと収益導線は稼働する
- 古いGSC/GAデータでは自動編集しない
- 確定収益ページを自動変更より優先保護する
- 新規ページはSearch Consoleから提案のみ、自動量産しない
- ローカルbotは `src/pages/**` 以外を自動commitしない
- operational data / secretsがtrackedならverifyを失敗させる
- Cloudflare build gateが落ちた変更は公開しない

詳細:

- [SETUP.md](./SETUP.md)
- [NO_CI.md](./NO_CI.md)
- [LOCAL_AUTOMATION.md](./LOCAL_AUTOMATION.md)
- [OFFER_SETUP.md](./OFFER_SETUP.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
