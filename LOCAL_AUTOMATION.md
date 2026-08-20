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

`verify`には収益意図ロジックのself-test、tracked secret scan、readiness、Astro check、content/freshness、build/smokeが含まれます。AIが書き換え可能でも、最終品質ゲートを通らなければcommit/pushされません。

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

初回は `LOCAL_AUTO_PUSH=false` のため、正常ならlocal commitまで作られますがpushしません。

確認する主なファイル:

```text
reports/ops-summary.md
reports/verification.json
reports/latest.json
reports/editor-plan.json
```

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

日次botは直近28日分の`affiliate_click`をページ単位で`data/analytics/latest.json`へ保存します。GA4を使わない場合は設定せず、その処理だけskipします。

## 7. Operations Summary

日次処理成功後に:

```text
reports/ops-summary.md
```

を作ります。

ここには:

- verify状態
- 公開準備状態
- 確定/未確定/否認報酬
- 28日GA4 affiliate_click
- commercial intent上位ページ
- 次の自動改善候補
- 公開前に残るrequired項目

をまとめます。CI画面の代わりに、まずこの1ファイルを見る運用を想定しています。

## 8. 運用中にエラーになったら

botは失敗時に無理にcommit/pushしません。途中生成物がworking treeへ残る場合があります。これは次回実行を意図的に停止させる安全装置でもあります。

確認後:

```bash
git status
npm run verify
npm run ops:summary
```

で原因を確認し、人間が修正・commit/restoreしてworking treeをcleanに戻してから再開します。

## 9. Cloudflareとの役割分担

```text
launchd
= 日次運転の時計

local-daily.mjs
= データ取得・分析・安全な変更・verify・commit/push

Cloudflare Pages Git integration
= push後の独立したbuild gate + deploy

/health.json
= 実際に公開されたcommitの確認

reports/ops-summary.md
= 今日の運用状態の確認
```

GitHub Actionsはこのループに不要です。
