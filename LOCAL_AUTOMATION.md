# ローカル日次自動運転（GitHub Actions不要）

GitHub Actions/CIを使わずに、手元のMacで毎日以下を自動実行できます。

```text
git pull --ff-only
↓
A8 CSV自動取り込み（任意）
↓
Search Console / ValueCommerce取得
↓
収益正規化・分析
↓
AI編集候補 / 安全な自動編集（設定時のみ）
↓
verify（公開中はstrict）
↓
許可されたファイルだけcommit
↓
push（明示ON時のみ）
↓
Cloudflare Pages Git integrationがbuild gate + deploy
```

## 安全条件

日次botは次の場合、変更を加えず停止します。

- `LOCAL_AUTOMATION_ENABLED=true` ではない
- 現在branchが指定branch（既定main）ではない
- working treeに人間の未commit変更がある
- `git pull --ff-only` に失敗
- daily処理に失敗
- verifyに失敗
- staged fileがallowlist外へ出た

AIが書き換え可能でも、最終的な品質ゲートを通らなければcommit/pushされません。

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

Search Console / ValueCommerce / AIを使う場合は同ファイルへ必要情報を入れます。

## 2. 手動で1回テスト

mainへ移動し、作業ツリーがcleanな状態で:

```bash
npm run local:daily
```

初回は `LOCAL_AUTO_PUSH=false` のため、正常ならlocal commitまで作られますがpushしません。

内容を確認して問題なければ、そのcommitを手動pushします。

## 3. pushまで自動化

十分確認した後だけ:

```text
LOCAL_AUTO_PUSH=true
```

へ変更します。

以後、正常な日次更新はmainへpushされ、Cloudflare Pages Git integrationが公開前検証を実行します。

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

A8から公式CSVを書き出してそのファイルへ置けば、次回の日次処理で自動取り込みされます。

## 6. 運用中にエラーになったら

botは失敗時に無理にcommit/pushしません。途中生成物がworking treeへ残る場合があります。これは次回実行を意図的に停止させる安全装置でもあります。

確認後:

```bash
git status
npm run verify
```

で原因を確認し、人間が修正・commit/restoreしてworking treeをcleanに戻してから再開します。

## 7. Cloudflareとの役割分担

```text
launchd
= 日次運転の時計

local-daily.mjs
= データ取得・分析・安全な変更・commit/push

Cloudflare Pages Git integration
= push後の独立したbuild gate + deploy

/health.json
= 実際に公開されたcommitの確認
```

GitHub Actionsはこのループに不要です。
