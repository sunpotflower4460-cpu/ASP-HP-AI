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
Cloudflare PagesをこのGitHubリポジトリへ直接接続します。V1の推奨経路はこちらです。

設定:

- Production branch: `main`
- Framework preset: Astro または None
- Build command: `npm run cloudflare:build`
- Build output directory: `dist`
- Root directory: repository root

Preview環境では必ず:

- `PUBLIC_READY=false`

Production環境も最初は `PUBLIC_READY=false` のままPages URL/独自ドメインで目視確認します。本公開時だけ `PUBLIC_READY=true` にします。

Cloudflareのbuild commandが失敗するとそのデプロイは公開されません。`cloudflare:build` は本番時にstrict readinessまで含めて検証します。

詳細は [NO_CI.md](./NO_CI.md) を参照してください。

### 公開commit確認
デプロイ後:

```text
https://your-domain.example/health.json
```

でbranch/commit/publicReadyを確認できます。

## 3. Search Console
Google Search Consoleでサイト所有権を人間が確認します。その後、Search Analyticsの読み取りとSitemap送信に使うサービスアカウントを対象プロパティへ追加します。

必要な秘密情報:

- `GSC_CLIENT_EMAIL`
- `GSC_PRIVATE_KEY`
- `GSC_SITE_URL`

手動確認:
```bash
npm run gsc:fetch
PUBLIC_READY=true SITE_URL=https://your-domain.example npm run gsc:submit
```

## 4. A8.net
A8でWebサイトを登録し、案件との提携を行います。案件ごとに成果条件・禁止事項・Web掲載可否を確認します。

実案件は [OFFER_SETUP.md](./OFFER_SETUP.md) のCLIを使います。

```bash
npm run offer:new -- ...
npm run offer:check -- offer-id
npm run offer:activate -- offer-id --confirm-rules-reviewed
```

A8成果は公式レポートCSVを取り込みます。

## 5. ValueCommerce（使う場合）
管理画面からレポートAPI認証キーを発行します。

- `VALUECOMMERCE_CLIENT_KEY`
- `VALUECOMMERCE_CLIENT_SECRET`

ValueCommerce案件にはProgram IDも登録します。

## 6. AI編集（任意）
最初はAI編集OFFで構いません。

使う場合のみ:

- `AI_EDITOR_ENABLED=true`
- `CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fast`

タイトル自動変更を使う場合はさらに:

- `EDITOR_AUTO_APPLY_TITLE=true`
- `data/editor-policy.json` の `autoApply.title=true`

収益ページと、提案後に元ソースが変化したページは自動変更から保護されます。

## 7. 公開直前
まずローカルで:

```bash
PUBLIC_READY=true SITE_URL=https://your-domain.example npm run verify:prod
```

Cloudflare Pagesでも同じ品質ゲートを `npm run cloudflare:build` が実行します。

実サイトを確認し、広告表示・プライバシー・外部送信・問い合わせ導線を目視してから `PUBLIC_READY=true` にします。

## 8. 日次自動運転
GitHub Actionsを前提にしないため、V1ではローカルschedulerで `npm run daily` → `npm run verify` → 安全な変更だけcommit/pushする経路を用意します。設定は [NO_CI.md](./NO_CI.md) と今後のlocal scheduler手順を参照してください。
