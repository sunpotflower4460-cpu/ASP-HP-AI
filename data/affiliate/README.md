# Affiliate observations

ASPの成果観測データを置くローカル用ディレクトリです。

**このリポジトリはpublicのため、成果JSONはGitHubへcommitしません。** `.gitignore` と `npm run security` の両方で `data/affiliate/*.json` を公開対象から除外しています。このREADMEだけを追跡します。

## A8
A8の公式レポートを手動取得して取り込みます。

```bash
npm run a8:import -- /path/to/report.csv
npm run affiliate:normalize
```

既定エンコーディングは `shift_jis`。UTF-8 CSVでは `A8_CSV_ENCODING=utf-8` を指定します。
保存時は成果分析に必要な最小列だけをローカルJSONへ残します。元CSVも `imports/` 等のgitignoredな場所へ置いてください。

## ValueCommerce
管理画面「ツール > レポートAPI」でAPI認証キーを発行し、`.env.local` 等のcommitされない環境へ設定します。

```bash
VALUECOMMERCE_CLIENT_KEY=... \
VALUECOMMERCE_CLIENT_SECRET=... \
npm run vc:fetch
npm run affiliate:normalize
```

公式のアフィリエイトサイト向け注文別レポートAPI v3を使い、保留・承認・拒否・請求済みを取得します。取得結果と正規化結果はローカル運用データとして扱います。
