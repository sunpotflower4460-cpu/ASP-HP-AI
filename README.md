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

日次botが自動commitできるのは、既存 `src/pages/**` の安全な変更と、意味的に検証済みの `active → paused` Safety Pauseだけです。検索語、アクセス、ASP成果、収益額はMacローカルに残します。

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
public page edit / safe offer pause only
  ↓
GitHub
  ↓
Cloudflare Pages build gate
  ↓
remote smoke
```

- Node.js: 22+ (`.node-version`で22.16.0を固定)
- Astro: static-first
- Hosting: Cloudflare Pages
- DB: V1では不要
- CI: GitHub Actions不要
- Scheduler: macOS launchd

## 開始

本番公開までの順序と停止条件は [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) を正本として進めてください。

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
npm run remote:smoke    # 公開後の実HTTP確認
```

`verify` は次を実行します。

1. URL安全性テスト
2. 日次run排他lockテスト
3. private backup復元・改ざん拒否テスト
4. Commercial Intent / Content Gap / Safety Pause等の決定論的self-test
5. tracked secret / private operational data検査
6. readiness
7. Astro type/content check
8. content/freshness validation
9. build
10. 内部リンク・PR表記・canonical・sitemap・robots・health・Analytics/affiliate CTA整合Smoke Test

## サイト基本情報を設定

JSONを直接編集しなくても設定できます。

```bash
npm run site:configure -- \
  --name "サイト名" \
  --url "https://your-domain.jp" \
  --description "サイト説明" \
  --operator "運営者名" \
  --contact "contact@your-domain.jp"
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

案件終了・期限切れ・重要条件不整合など、安全側に倒す必要がある場合は:

```bash
npm run offer:pause -- my-offer --reason "campaign ended"
npm run offer:safety-scan
```

日次botのSafety Scanは **active → pausedのみ** を自動化します。事実・URL・タグを書き換えたり、draft/pausedをactiveへ戻したりしません。

## Search Console

`.env.local`へ設定すると各npmコマンドが自動で読み込みます。

```text
GSC_CLIENT_EMAIL=
GSC_PRIVATE_KEY=
GSC_SITE_URL=
GSC_DATA_MAX_AGE_HOURS=72
GSC_MAX_PAGES=4
```

Search Analytics APIは1レスポンス最大25,000行なので、`startRow`でページングします。`GSC_MAX_PAGES`は1回の日次取得で読むページ数の安全上限です。

ただしGoogle Search Console側の内部制限により、`query/page`の詳細データは全検索語を完全列挙できるとは限りません。`Content Gap`は「観測できた検索意図」からの提案として扱い、全検索語を網羅した一覧とはみなしません。

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
LOCAL_RUN_LOCK_MAX_AGE_HOURS=6
```

事前診断:

```bash
npm run local:doctor
```

手動で1回:

```bash
npm run local:daily
```

`local:daily`は`logs/local-daily.lock`を排他的に取得します。手動実行とlaunchdが重なった場合、後発runは何も変更せず停止します。古いlockでも同じMac上のPIDが生きていれば奪いません。

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
npm run local:permissions
npm run local:backup
npm run local:backup:verify
```

- Gitリポジトリ外へ**実体パスで**解決できる場所だけ許可
- `.env.local` / private key / raw A8 CSV / Git履歴はコピーしない
- symlinkはバックアップ対象から除外
- 各snapshotにSHA-256 manifest
- `latest.json`も検証時にrepo外へのpath/symlink escapeを拒否
- `LOCAL_BACKUP_REQUIRED=true`ならbackup/verify失敗時に自動commitを停止
- POSIX環境ではprivate file 600 / directory 700をbest-effortで適用

復元:

```bash
npm run local:backup:restore -- --latest --confirm
```

復元前にmanifestのサイズ・SHA-256・path・symlinkをすべて検証します。Search Console / GA4 / ASP正規化成果 / AI使用量 / reportsだけが復元対象で、`.env.local`、案件設定、`src/`、raw CSV、Git履歴は変更しません。

## CIなしのCloudflare公開

Cloudflare PagesをGitHubへ直接接続します。

- Production branch: `main`
- Build command: `npm run cloudflare:build`
- Output directory: `dist`
- Preview: `PUBLIC_READY=false`

known preview branchで `PUBLIC_READY=true` はbuild失敗します。`PUBLIC_READY=true`のbuildは原則strict verificationになります。

デプロイ後:

```text
https://your-domain.jp/health.json
```

で実際のbranch/commit/publicReadyを確認できます。

さらにMac側から:

```bash
npm run remote:smoke
```

`.env.local`:

```text
REMOTE_SITE_URL=https://your-domain.jp
REMOTE_EXPECT_PUBLIC=true
REMOTE_REQUIRE_COMMIT_MATCH=false
REMOTE_SMOKE_TIMEOUT_MS=10000
```

`remote:smoke`はhealth / robots / sitemap / top / comparison / privacy / external-transmissionへ実HTTPでアクセスし、noindex、canonical origin、publicReady、branch、想定外の別origin redirectを確認します。

Cloudflareへ反映されたcommitまでローカルHEADと一致させたい時だけ `REMOTE_REQUIRE_COMMIT_MATCH=true` にします。

## 公開直前

```bash
npm run launch:check
```

これは:

```text
local:doctor
→ strict readiness（初回公開はactive案件必須）
→ full production verification
```

を通します。

`launch:check`がPASSしても、最終Cloudflare Previewを目視確認するまでは `PUBLIC_READY=false` を維持してください。本公開時だけProduction環境で `PUBLIC_READY=true` にします。

## 安全思想

- AIが外部情報を勝手に事実化しない
- active案件の事実が期限切れならSafety Pause/build gateで止める
- active案件のURL・公式情報源はHTTPSのみ
- A8以外へ未知の追跡パラメータを勝手に付けない
- AI停止中でも静的サイトと収益導線は稼働する
- 古いGSC/GAデータでは自動編集しない
- 確定収益ページを自動変更より優先保護する
- 新規ページはSearch Consoleから提案のみ、自動量産しない
- ローカルbotのページ変更は既存ページの`M`だけ。新規/削除/renameは拒否する
- 案件の自動変更は意味的に検証済みの`active → paused`だけ
- operational data / secretsがtrackedならverifyを失敗させる
- private backupはGit実体パス外のみ許可する
- Cloudflare build gateが落ちた変更は公開しない
- 公開後は`remote:smoke`で実HTTP状態を確認できる

詳細:

- [SETUP.md](./SETUP.md)
- [NO_CI.md](./NO_CI.md)
- [LOCAL_AUTOMATION.md](./LOCAL_AUTOMATION.md)
- [OFFER_SETUP.md](./OFFER_SETUP.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
