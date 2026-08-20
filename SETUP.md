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
Google Search Consoleへサイトを登録し、read-onlyで利用するサービスアカウントをプロパティへ追加します。

GitHub Secrets:
- `GSC_CLIENT_EMAIL`
- `GSC_PRIVATE_KEY`
- `GSC_SITE_URL`

## 4. A8.net
A8でWebサイトを登録し、案件との提携を行います。案件ごとに成果条件・禁止事項・Web掲載可否を確認します。

`data/offers/*.json` に案件を登録し、active化する前に:
- 公式URL
- アフィリエイトURL
- Web掲載可
- 事実ソース
- 最終確認日
- TTL
を設定します。

A8成果は公式レポートCSVを取り込みます。

## 5. ValueCommerce（使う場合）
管理画面 `ツール > レポートAPI` からAPI認証キーを発行します。

GitHub Secrets:
- `VALUECOMMERCE_CLIENT_KEY`
- `VALUECOMMERCE_CLIENT_SECRET`

## 6. 日次自動運転
最初はGitHub Variable `AUTOMATION_ENABLED=false` のまま運用します。
Search Consoleの取得・成果取り込み・分析が正常なことを確認後trueへ変更します。

AI編集を使う場合のみ:
- `AI_EDITOR_ENABLED=true`
- `CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-8b-instruct`

タイトルまで自動変更する場合はさらに:
- `EDITOR_AUTO_APPLY_TITLE=true`
- `data/editor-policy.json` の `autoApply.title=true`

収益が確認されたページは自動変更から保護されます。

## 7. 公開直前
```bash
READINESS_STRICT=true npm run readiness
npm run validate
npm run freshness
npm run check
npm run build
```

実サイトを確認し、広告表示・プライバシー・外部送信・問い合わせ導線を目視します。
その後だけ `PUBLIC_READY=true` にします。
