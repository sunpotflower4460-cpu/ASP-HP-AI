# Production setup

V1はコード側をほぼ無料で動かせるようにしてあります。下記だけは本人確認・外部サービス認証のため人間操作が必要です。

## 1. サイト情報
`data/site.json` を実値に変更します。

- `url`: 独自ドメインまたはPages URL
- `operator`: 運営者表示
- `contact`: 連絡先

本番用環境変数:

- `SITE_URL`
- `PUBLIC_READY=false`（公開確認が終わるまでfalse）

## 2. Cloudflare Pages（GitHub Actions不要）
Cloudflare PagesをこのGitHubリポジトリへ直接接続します。

- Production branch: `main`
- Framework preset: Astro または None
- Build command: `npm run cloudflare:build`
- Build output directory: `dist`
- Root directory: repository root

Preview環境では必ず `PUBLIC_READY=false` にします。
Production環境も最初は `PUBLIC_READY=false` のまま目視確認し、本公開時だけ `PUBLIC_READY=true` にします。

Cloudflareのbuild commandが失敗するとそのデプロイは公開されません。詳細は [NO_CI.md](./NO_CI.md) を参照してください。

公開後は:
```text
https://your-domain.example/health.json
```
でbranch/commit/publicReadyを確認できます。

## 3. Search Console
Google Search Consoleでサイト所有権を人間が確認します。その後、Search Analytics読み取りとSitemap送信に使うサービスアカウントを対象プロパティへ追加します。

- `GSC_CLIENT_EMAIL`
- `GSC_PRIVATE_KEY`
- `GSC_SITE_URL`

手動確認:
```bash
npm run gsc:fetch
PUBLIC_READY=true SITE_URL=https://your-domain.example npm run gsc:submit
```

GitHub Actionsを使わない場合、Sitemap送信は初回公開後に上記コマンドを1回実行すれば構いません。

## 4. A8.net
A8でWebサイトを登録し、案件との提携を行います。案件ごとに成果条件・禁止事項・Web掲載可否を確認します。

```bash
npm run offer:new -- ...
npm run offer:check -- offer-id
npm run offer:activate -- offer-id --confirm-rules-reviewed
```

詳細は [OFFER_SETUP.md](./OFFER_SETUP.md) を参照してください。

A8成果は公式CSVを取り込みます。日次botでは `A8_AUTO_IMPORT_FILE` を設定すると指定CSVを自動取り込みできます。

## 5. ValueCommerce（使う場合）
管理画面からレポートAPI認証キーを発行します。

- `VALUECOMMERCE_CLIENT_KEY`
- `VALUECOMMERCE_CLIENT_SECRET`

ValueCommerce案件にはProgram IDも登録します。

## 6. Google Analytics（任意・初期OFF）
追加の外部クリック計測が必要な場合のみCloudflare Pagesの環境変数へ設定します。

```text
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

設定しない場合、Google tagは生成HTMLへ一切含まれません。

有効時は:

- 通常のGAページ計測
- `affiliate_click`
  - `affiliate_asp`
  - `offer_id`
  - `page_id`
  - `cta_id`
  - `position_id`

を送信します。カスタムイベントへ氏名・メールアドレス等を入れない設計です。
Privacy/外部送信ページは同じ環境変数から表示を自動切替し、矛盾時はSmoke Testでbuild停止します。

## 7. AI編集（任意）
最初はAI編集OFFで構いません。

使う場合のみ:

- `AI_EDITOR_ENABLED=true`
- `CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fast`

タイトル自動変更を使う場合はさらに:

- `EDITOR_AUTO_APPLY_TITLE=true`
- `data/editor-policy.json` の `autoApply.title=true`

収益ページと、提案後に元ソースが変化したページは自動変更から保護されます。

## 8. 公開直前
```bash
PUBLIC_READY=true SITE_URL=https://your-domain.example npm run verify:prod
```

Cloudflare Pagesでも `npm run cloudflare:build` が同じ品質ゲートを実行します。

実サイトを確認し、広告表示・プライバシー・外部送信・問い合わせ導線を目視してから `PUBLIC_READY=true` にします。

## 9. 日次自動運転（CI不要）
```bash
cp .env.local.example .env.local
```

最初は:
```text
LOCAL_AUTOMATION_ENABLED=true
LOCAL_AUTO_PUSH=false
```

手動確認:
```bash
npm run local:daily
```

問題なければ `LOCAL_AUTO_PUSH=true` に変更します。

macOSへ毎日登録:
```bash
npm run local:install
```

解除:
```bash
npm run local:uninstall
```

詳細は [LOCAL_AUTOMATION.md](./LOCAL_AUTOMATION.md) を参照してください。
