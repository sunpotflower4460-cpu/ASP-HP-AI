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

詳しい本番設定は [SETUP.md](./SETUP.md) を参照してください。

## 開始
```bash
npm install
npm run dev
```

## 品質確認
```bash
npm run validate
npm run freshness
npm run check
npm run build
```

## 公開準備チェック
```bash
npm run readiness
```
`reports/readiness.json` に、URL・運営者情報・連絡先・active案件・Search Consoleなどの準備状態を出力します。公開前に厳格チェックしたい場合は `READINESS_STRICT=true npm run readiness` を使います。

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
既定はShift_JISです。UTF-8の場合は `A8_CSV_ENCODING=utf-8` を指定します。CSV全列は保存せず、成果分析に必要な最小データのみ残します。

## ValueCommerce成果自動取得
```bash
VALUECOMMERCE_CLIENT_KEY=... \
VALUECOMMERCE_CLIENT_SECRET=... \
npm run vc:fetch
npm run affiliate:normalize
npm run analyze
```
公式注文別レポートAPI v3から、保留・承認・拒否・請求済みを取得して共通収益イベントへ正規化します。

## AI編集長（初期値は停止）
`npm run editor:plan` はSearch Consoleと収益データから編集候補を作ります。AIを使わないので0円です。

Cloudflare Workers AIで提案を作る場合のみ:
```bash
AI_EDITOR_ENABLED=true
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-8b-instruct
npm run editor:ai
```

### Cost Governor
`data/budget.json` で月AI予算（初期値300円）と月間AI呼び出し上限（初期値40回）を強制します。AI呼び出しは `data/ai-usage/YYYY-MM.json` に記録されます。

- 有料/第三者モデルは `ALLOW_PAID_AI=true` がない限り拒否
- 有料利用を許可する場合は `AI_ESTIMATED_COST_PER_CALL_JPY` も必須
- 予測費用が月予算を超える呼び出しは実行前に停止
- 呼び出し回数上限を超える処理も実行前に停止

`EDITOR_AUTO_APPLY_TITLE=true` と `data/editor-policy.json` の `autoApply.title=true` が両方有効な場合だけ、安全条件を通ったSEOタイトル変更を自動適用します。確定収益のあるページはページID台帳によって保護されます。

## 日次パイプライン
```bash
npm run daily
```
GitHub Actionsの日次実行はRepository Variable `AUTOMATION_ENABLED=true` にするまで動きません。

## Cloudflare Pages自動公開
`deploy-pages.yml` はmainへのサイト影響変更で動きますが、`CLOUDFLARE_DEPLOY_ENABLED=true` にするまでdeployしません。公開前にはreadiness/buildを必ず通します。

## 安全思想
- AIが外部情報を勝手に事実として追加しない
- active案件の事実が期限切れならbuildを止める
- active案件のリンク・公式情報源はHTTPSのみ
- A8以外のASPリンクに未知の追跡パラメータを勝手に付けない
- AIを止めても静的サイトと収益導線は動き続ける
- 自動編集はSearch Consoleの実データがあるページだけを対象にする
- 確定収益があるページは自動変更より保護を優先する
