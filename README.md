# ASP-HP-AI

低固定費で運用する、自律成長型アフィリエイト特化サイトのV1です。

## 方針
- HPを主媒体にする
- 動画生成・広告費を前提にしない
- A8 / ValueCommerce等をAdapter化
- Search Consoleを主な観測データにする
- AIは大量記事生成ではなく「必要な改善だけ」を行う
- PR表記・事実ソース・情報鮮度・AI呼び出し回数・予算上限をコードで強制
- `PUBLIC_READY=true` になるまで `noindex` + robots拒否を維持
- AI自動編集は明示的にONにするまで提案だけで止める
- 案件はAIが勝手にactive化しない
- GitHub Actions/CIがなくても検証・公開できる

本番設定は [SETUP.md](./SETUP.md)、CIなし運用は [NO_CI.md](./NO_CI.md)、実案件登録は [OFFER_SETUP.md](./OFFER_SETUP.md) を参照してください。

## 開始
```bash
npm install
npm run dev
```

## 品質確認
基本はこれだけです。
```bash
npm run verify
```

本番条件まで厳格に確認:
```bash
PUBLIC_READY=true SITE_URL=https://your-domain.example npm run verify:prod
```

`verify` はreadiness、Astro check、content/freshness validation、build、内部リンク・PR表記・canonical・sitemap・robots・healthのSmoke Testまで実行し、結果を `reports/verification.json` に残します。

## CIなしのCloudflare公開
Cloudflare PagesをGitHubへ直接接続します。

- Production branch: `main`
- Build command: `npm run cloudflare:build`
- Output directory: `dist`
- Preview環境: `PUBLIC_READY=false`

build gateが失敗した場合はCloudflare側で公開されません。デプロイ後は `/health.json` で実際に公開されたbranch/commitを確認できます。

## 実案件を登録
```bash
npm run offer:new -- --id my-offer --name "サービス名" --asp a8 --affiliate-url "https://..." --official-url "https://..." --summary "公式情報で確認した説明" --tags "home-router"
npm run offer:check -- my-offer
npm run offer:activate -- my-offer --confirm-rules-reviewed
```
必ずdraftから開始し、ASP/広告主条件を人間が確認した後だけ明示的にactive化します。

## Search Console
```bash
npm run gsc:fetch
npm run analyze
npm run editor:plan
```

## A8成果取り込み
```bash
npm run a8:import -- /path/to/a8-report.csv
npm run affiliate:normalize
npm run analyze
```
既定はShift_JISです。UTF-8の場合は `A8_CSV_ENCODING=utf-8` を指定します。

## ValueCommerce成果自動取得
```bash
VALUECOMMERCE_CLIENT_KEY=... \
VALUECOMMERCE_CLIENT_SECRET=... \
npm run vc:fetch
npm run affiliate:normalize
npm run analyze
```

## AI編集長（初期値は停止）
`npm run editor:plan` はSearch Consoleと収益データから0円で編集候補を作ります。

Cloudflare Workers AIを使う場合のみ:
```bash
AI_EDITOR_ENABLED=true
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fast
npm run editor:ai
```
検索クエリは信頼できない入力として扱い、出力はJSON Schemaで制約します。

### Cost Governor
`data/budget.json` で月AI予算（初期300円）と月間AI呼び出し上限（初期40回）を強制します。

- 有料AIは `ALLOW_PAID_AI=true` がない限り拒否
- 有料利用時は `AI_ESTIMATED_COST_PER_CALL_JPY` 必須
- 予算/回数超過は呼び出し前に停止

`EDITOR_AUTO_APPLY_TITLE=true` と `data/editor-policy.json` の `autoApply.title=true` が両方有効な場合だけ、安全条件を通ったタイトル変更を自動適用します。確定収益ページや、提案後にソースが変化したページは保護します。

## 日次パイプライン
```bash
npm run daily
```
GitHub Actionsは補助扱いです。CIなしの日次自動運転はローカルschedulerを使う構成へ移行します。

## 安全思想
- AIが外部情報を勝手に事実として追加しない
- active案件の事実が期限切れならbuild停止
- active案件のリンク・公式情報源はHTTPSのみ
- A8以外へ未知の追跡パラメータを付けない
- AI停止中でも静的サイトと収益導線は稼働
- 自動編集はSearch Console実データがあるページだけ
- 確定収益ページを自動変更より優先保護
- 案件分類タグは中央レジストリの確認済み値だけ
