# ローカル日次自動運転（GitHub Actions不要）

GitHub Actions/CIを使わずに、手元のMacで毎日以下を自動実行できます。

```text
exclusive local run lock
↓
git pull --ff-only
↓
private permission補正
↓
local doctor
↓
active案件Safety Scan（安全側pauseのみ）
↓
A8 CSV自動取り込み（任意）
↓
Search Console / GA4 / ValueCommerce取得
↓
収益正規化・commercial intent分析
↓
AI編集候補 / 安全な既存ページ編集（設定時のみ）
↓
verify（公開中はstrict）
↓
ops-summary生成
↓
ローカル専用データを任意バックアップ＋整合性確認
↓
既存公開ページ変更 / 検証済みSafety Pauseだけcommit
↓
push（明示ON時のみ）
↓
Cloudflare Pages Git integrationがbuild gate + deploy
↓
remote smoke（公開後の手動確認）
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
logs/
```

`.gitignore`だけでなく`npm run security`でも、これらがtrackedになった場合はverifyを失敗させます。

日次botが自動commitできるのは次だけです。

```text
1. 既存 src/pages/** の modification-only 変更
2. 意味的に検証済みの active → paused Safety Pause
```

新規ページ・削除・rename・copy・想定外tracked/untrackedファイルはcommit前に拒否します。観測だけの日はcommit自体を作りません。

## 安全条件

日次botは次の場合、公開変更をcommitせず停止します。

- `LOCAL_AUTOMATION_ENABLED=true` ではない
- 現在branchが指定branch（既定main）ではない
- working treeに人間の未commit変更がある
- 別の日次runがlockを保持している
- `git pull --ff-only` に失敗
- local doctorに失敗
- 必須のローカル処理に失敗
- verifyに失敗
- 新規/削除/rename等のページ変更が発生
- tracked/untracked fileが自動変更ルール外へ出た
- Safety Pauseがstatus以外の案件内容まで変更している
- `LOCAL_BACKUP_REQUIRED=true`でバックアップまたは整合性確認に失敗

外部API取得だけが失敗した場合はdegraded observation modeとして分析記録を継続できますが、その日はAI編集を行いません。

`verify`にはURL safety、run-lock、backup restore、Commercial Intent/Content Gap/Safety Pause self-test、tracked secret/private-data scan、readiness、Astro check、content/freshness、build/smokeが含まれます。

## 1. 初回準備

```bash
npm install
cp .env.local.example .env.local
```

`.env.local` は `.gitignore` 済みです。

最初は必ず:

```text
LOCAL_AUTOMATION_ENABLED=true
LOCAL_AUTO_PUSH=false
LOCAL_RUN_LOCK_MAX_AGE_HOURS=6
```

にします。

Search Console / GA4 / ValueCommerce / AIを使う場合は同ファイルへ必要情報を入れます。

## 2. 二重起動防止

`npm run local:daily` は開始時に:

```text
logs/local-daily.lock
```

を排他的に取得します。

- fresh lockがある → 後発runは停止
- 正常終了 / SIGINT / SIGTERM → 自分のlockだけ削除
- crash等でlockが残る → 設定時間を超えた時だけ回収候補
- 同じMac上で既存PIDが生きている → 古いlockでも絶対に奪わない
- 既定寿命 → 6時間

設定:

```text
LOCAL_RUN_LOCK_MAX_AGE_HOURS=6
```

lockは`logs/`配下なのでGitHubへcommitしません。

## 3. 手動で1回テスト

mainへ移動し、作業ツリーがcleanな状態で:

```bash
npm run local:doctor
npm run local:daily
```

初回は`LOCAL_AUTO_PUSH=false`です。

- AIが既存公開ページの安全な変更を作った場合だけlocal commitを作成
- Safety Scanでactive案件を安全側pauseした場合だけ、その案件status変更もcommit候補
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

公開変更がある場合は`git show`等でcommit内容を確認してから手動pushします。

## 4. pushまで自動化

十分確認した後だけ:

```text
LOCAL_AUTO_PUSH=true
```

へ変更します。

以後、verifyを通った既存ページ変更 / 検証済みSafety Pauseだけmainへpushされ、Cloudflare Pages Git integrationが再度公開前検証します。

## 5. macOS launchdへ登録

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

`local:install`は`.env.local`を読み、doctorがPASSしない限り登録しません。

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

## 6. A8 CSVの半自動取り込み

A8にメディア向け汎用成果APIがない前提のため、規約不明な自動スクレイピングは行いません。

代わりに `.env.local` へ:

```text
A8_AUTO_IMPORT_FILE=imports/a8-report.csv
A8_CSV_ENCODING=shift_jis
```

と設定します。

A8から公式CSVを書き出してそのファイルへ置けば、次回の日次処理で自動取り込みされます。`imports/`はGitHubへcommitされません。

## 7. GA4外部クリックの自動取得（任意）

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

## 8. Search Consoleページング

`.env.local`:

```text
GSC_MAX_PAGES=4
GSC_DATA_MAX_AGE_HOURS=72
```

Search Analyticsは1ページ25,000行で`startRow`ページングします。全ページ成功してAPIの終端ページへ到達した場合だけ`latest.json`を置き換えます。

ただしquery/page詳細データはGoogle側の内部制限により全検索語完全列挙を保証しません。Content Gapは観測できた検索意図の提案として扱います。

## 9. Operations Summary

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
- 1検索クリック/1ASPクリック当たりの確定報酬
- 次の自動改善候補
- degraded観測
- 公開前に残るrequired項目

をまとめます。**このファイルもローカル専用です。** CI画面の代わりにまずこれを確認します。

## 10. ローカル専用データの権限・バックアップ

### 権限補正

```bash
npm run local:permissions
```

POSIX環境ではprivate fileを原則600、directoryを700へbest-effortで補正します。symlinkは変更しません。

### バックアップ

GitHubへ置かない検索・収益データを、Gitリポジトリ外のディレクトリへ世代バックアップできます。

`.env.local`:

```text
LOCAL_BACKUP_DIR=/Users/you/Documents/ASP-HP-AI-private-backups
LOCAL_BACKUP_RETENTION_DAYS=30
LOCAL_BACKUP_REQUIRED=false
```

手動実行:

```bash
npm run local:backup
npm run local:backup:verify
```

バックアップ対象:

- Search Console取得結果
- GA4取得結果
- A8/ValueCommerceのローカル成果JSONと正規化データ
- AI使用量
- 運用レポート

バックアップしないもの:

- `.env.local`
- private key / API token
- raw A8 CSV (`imports/`)
- Git履歴
- launchdログ
- サイトソース
- `data/offers/`

安全条件:

- backup先は**実体パスでGit repo外**のみ
- repo外に見えてsymlinkでrepo内へ戻るパスも拒否
- source内symlinkはコピーしない
- 各snapshotにSHA-256付き`manifest.json`
- `latest.json`のpath escape / symlink escapeもverifyで拒否
- retentionは1〜3650日の整数のみ

`LOCAL_BACKUP_REQUIRED=true`にすると、バックアップまたはSHA-256整合性確認に失敗した日は、公開変更をcommitする前に日次botを停止します。

### 復元

最新snapshotから戻す場合:

```bash
npm run local:backup:restore -- --latest --confirm
```

復元前にsnapshot全体を検証します。欠損・SHA不一致・path escape・symlinkが1つでもあれば、**現在のローカル運用データを削除する前に停止**します。

復元対象は次だけです。

```text
data/search-console/
data/analytics/
data/affiliate/
data/ai-usage/
reports/
```

`.env.local`、`data/offers/`、`src/`、`imports/`、`.git/`は触りません。

## 11. 運用中にエラーになったら

botは失敗時に無理にcommit/pushしません。

確認:

```bash
git status
npm run verify
npm run ops:summary
npm run local:backup:verify
```

`reports/ops-summary.md`と`reports/daily-run.json`を見て、必要なら修正して再開します。

## 12. Cloudflareとの役割分担

```text
launchd
= 日次運転の時計

local-daily.mjs
= 非公開データ取得・分析・Safety Scan・既存ページ変更・verify

ローカルデータ / private backup
= GitHubへ送らない

Cloudflare Pages Git integration
= push後の独立build gate + deploy

/health.json
= 実際に公開されたbranch / commit / publicReady確認

reports/ops-summary.md
= ローカルの運用状態確認
```

GitHub Actionsはこのループに不要です。

## 13. 公開後の実HTTP確認

`.env.local`:

```text
REMOTE_SITE_URL=https://your-domain.jp
REMOTE_EXPECT_PUBLIC=true
REMOTE_REQUIRE_COMMIT_MATCH=false
REMOTE_SMOKE_TIMEOUT_MS=10000
```

実行:

```bash
npm run remote:smoke
```

health / robots / sitemap / top / comparison / privacy / external-transmissionへ実HTTPアクセスし、noindex・canonical・publicReady・branch・別origin redirectを検査します。

ローカルHEADとCloudflareのcommit SHAまで一致させたい場合だけ:

```text
REMOTE_REQUIRE_COMMIT_MATCH=true
```

にします。
