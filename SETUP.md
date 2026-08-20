# Production setup

V1はコード側をほぼ無料で動かせるようにしてあります。下記だけは本人確認・外部サービス認証のため人間操作が必要です。

## 1. サイト情報
`data/site.json` を実値に変更します。

- `url`: 独自ドメインまたはPages URL
- `operator`: 運営者表示
- `contact`: 連絡先

GitHub Repository Variablesにも以下を登録します。

- `SITE_URL`
- `PUBLIC_READY=false`（公開確認が終わるまでfalse）

## 2. Cloudflare Pages
CloudflareでPages projectを1つ作成します。GitHub ActionsからDirect Uploadする構成です。

GitHub Secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

GitHub Variables:
- `CLOUDFLARE_PAGES_PROJECT`
- `CLOUDFLARE_DEPLOY_ENABLED=false`

初回はfalseのままにし、設定確認後にtrueへ変更します。

## 3. Search Console
Google Search Consoleでサイト所有権を人間が確認します。その後、Search Analyticsの読み取りとSitemap送信に使うサービスアカウントを、対象プロパティへ必要な権限で追加します。

GitHub Secrets:
- `GSC_CLIENT_EMAIL`
- `GSC_PRIVATE_KEY`
- `GSC_SITE_URL`

日次分析はread-only scopeで検索データを取得します。本番デプロイ成功後は `PUBLIC_READY=true` かつ認証が揃っている場合だけ `sitemap-index.xml` をSearch Console APIへ自動送信します。送信に失敗しても公開済みサイト自体は巻き戻しません。

手動確認:
```bash
npm run gsc:fetch
PUBLIC_READY=true SITE_URL=https://your-domain.example npm run gsc:submit
```

## 4. A8.net
A8でWebサイトを登録し、案件との提携を行います。案件ごとに成果条件・禁止事項・Web掲載可否を確認します。

実案件はJSONを直接書く代わりに、原則 [OFFER_SETUP.md](./OFFER_SETUP.md) のCLIを使います。

```bash
npm run offer:new -- ...
npm run offer:check -- offer-id
npm run offer:activate -- offer-id --confirm-rules-reviewed
```

A8成果は公式レポートCSVを取り込みます。

## 5. ValueCommerce（使う場合）
管理画面 `ツール > レポートAPI` からAPI認証キーを発行します。

GitHub Secrets:
- `VALUECOMMERCE_CLIENT_KEY`
- `VALUECOMMERCE_CLIENT_SECRET`

ValueCommerce案件を作る際はProgram IDも登録します。

## 6. 日次自動運転
最初はGitHub Variable `AUTOMATION_ENABLED=false` のまま運用します。
Search Consoleの取得・成果取り込み・分析が正常なことを確認後trueへ変更します。

AI編集を使う場合のみ:
- `AI_EDITOR_ENABLED=true`
- `CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-8b-instruct-fast`

タイトルまで自動変更する場合はさらに:
- `EDITOR_AUTO_APPLY_TITLE=true`
- `data/editor-policy.json` の `autoApply.title=true`

収益が確認されたページは自動変更から保護されます。提案作成後にページ本体が変わった場合も、自動適用は拒否されます。

## 7. 公開直前
```bash
READINESS_STRICT=true npm run readiness
npm run validate
npm run freshness
npm run check
npm run build
```

`build` は静的生成後の内部リンク・PR表記・canonical・sitemap・robots整合も検査します。

実サイトを確認し、広告表示・プライバシー・外部送信・問い合わせ導線を目視します。その後だけ `PUBLIC_READY=true` にします。
