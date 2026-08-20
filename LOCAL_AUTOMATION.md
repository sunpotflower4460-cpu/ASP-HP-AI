# ローカル日次自動運転（GitHub Actions不要）

GitHub Actions/CIを使わずに、手元のMacで毎日以下を自動実行できます。

```text
git pull --ff-only
↓
A8 CSV自動取り込み（任意）
↓
Search Console / GA4 / ValueCommerce取得
↓
収益正規化・commercial intent分析
↓
AI編集候補 / 安全な自動編集（設定時のみ）
↓
verify（公開中はstrict）
↓
ops-summary生成
↓
公開サイトのsrc/pages変更だけcommit
↓
push（明示ON時のみ）
↓
Cloudflare Pages Git integrationがbuild gate + deploy
```

## 最重要: このリポジトリはpublic

検索クエリ、GA4観測、A8/ValueCommerce成果、収益額、AI使用履歴、運用レポートは**GitHubへcommitしません**。

ローカル専用:

```text
data/search-console/
data/analytics/
data/affiliate/*.json
data/ai-usage/
reports/
imports/
.env.local
```

`.gitignore`だけでなく`npm run security`でも、これらがtrackedになった場合はverifyを失敗させます。

日次botがGitへcommitできるのは原則:

```text
src/pages/**
```

だけです。観測だけの日はcommit自体を作りません。

## 安全条件

日次botは次の場合、変更を加えず停止します。

- `LOCAL_AUTOMATION_ENABLED=true` ではない
- 現在branchが指定branch（既定main）ではない
- working treeに人間の未commit変更がある
- `git pull --ff-only` に失敗
- 必須のローカル処理に失敗
- verifyに失敗
- staged fileが公開コンテンツallowlist外へ出た

外部API取得だけが失敗した場合はdegraded observation modeとして分析記録を継続できますが、その日はAI編集を行いません。

`verify`には収益意図ロジックのself-test、tracked secret/private-data scan、readiness、Astro check、content/freshness、build/smokeが含まれます。

## 1. 初回準備

```bash
cp .env.local.example .env.local
```

`.env.local` は `.gitignore` 済みです。

最初は必ず:

```text
LOCAL_AUTOMATION_ENABLED=true
LOCAL_AUTO_PUSH=false
```

にします。

Search Console / GA4 / ValueCommerce / AIを使う場合は同ファイルへ必要情報を入れます。

## 2. 手動で1回テスト

mainへ移動し、作業ツリーがcleanな状態で:

```bash
npm run local:daily
```

初回は`LOCAL_AUTO_PUSH=false`です。

- AIが安全な公開ページ変更を作った場合だけlocal commitを作成
- 観測データだけ更新された場合はcommitなし
- 検索/収益データはローカルに残る

確認する主なローカルファイル:

```text
reports/ops-summary.md
reports/daily-run.json
reports/verification.json
reports/latest.json
reports/editor-plan.json
```

公開ページ変更がある場合は`git show`等でcommit内容を確認してから手動pushします。

## 3. pushまで自動化

十分確認した後だけ:

```text
LOCAL_AUTO_PUSH=true
```

へ変更します。

以後、verifyを通った`src/pages/**`の変更だけmainへpushされ、Cloudflare Pages Git integrationが再度公開前検証します。

## 4. macOS launchdへ登録

既定は毎日07:20（Macのローカル時刻）です。

時刻を変更する場合は `.env.local` に:

```text
LOCAL_SCHEDULE_HOUR=7
LOCAL_SCHEDULE_MINUTE=20
```

を設定した上で:

```bash
npm run local:install
```

ログ:

```text
logs/launchd.out.log
logs/launchd.err.log
```

解除:

```bash
npm run local:uninstall
```

Nodeのインストール場所が変わった場合（Node更新・nvm構成変更など）は `npm run local:install` を再実行してください。

## 5. A8 CSVの半自動取り込み

A8にメディア向け汎用成果APIがない前提のため、規約不明な自動スクレイピングは行いません。

代わりに `.env.local` へ:

```text
A8_AUTO_IMPORT_FILE=imports/a8-report.csv
A8_CSV_ENCODING=shift_jis
```

と設定します。

A8から公式CSVを書き出してそのファイルへ置けば、次回の日次処理で自動取り込みされます。`imports/`はGitHubへcommitされません。

## 6. GA4外部クリックの自動取得（任意）

ブラウザ側計測:

```text
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Data API:

```text
GA_PROPERTY_ID=123456789
```

GA4 PropertyへサービスアカウントをViewerとして追加します。`GA_CLIENT_EMAIL` / `GA_PRIVATE_KEY`を空にすると、Search Console用のサービスアカウントを再利用します。

日次botは直近28日分の`affiliate_click`をページ単位で`data/analytics/latest.json`へ保存します。これはローカル専用です。

## 7. Operations Summary

日次処理後に:

```text
reports/ops-summary.md
```

を作ります。

ここには:

- daily run / verify状態
- GSC/GAデータ鮮度
- 公開準備状態
- 確定/未確定/否認報酬
- 28日GA4 affiliate_click
- commercial intent上位ページ
- 次の自動改善候補
- degraded観測
- 公開前に残るrequired項目

をまとめます。**このファイルもローカル専用です。** CI画面の代わりにまずこれを確認します。

## 8. ローカルデータのバックアップ

検索・収益データはGitHubへ置かないため、必要なら別のローカルディレクトリへ自動バックアップできます。詳細は`.env.local.example`の`LOCAL_DATA_BACKUP_DIR`を参照してください。

## 9. 運用中にエラーになったら

botは失敗時に無理にcommit/pushしません。

確認:

```bash
git status
npm run verify
npm run ops:summary
```

`reports/ops-summary.md`と`reports/daily-run.json`を見て、必要なら修正して再開します。

## 10. Cloudflareとの役割分担

```text
launchd
= 日次運転の時計

local-daily.mjs
= 非公開データ取得・分析・安全な公開ページ変更・verify

ローカルデータ
= GitHubへ送らない

Cloudflare Pages Git integration
= 公開ページ変更push後の独立build gate + deploy

/health.json
= 実際に公開されたcommitの確認

reports/ops-summary.md
= ローカルの運用状態確認
```

GitHub Actionsはこのループに不要です。
