# Production checklist

本番公開までの一本道です。チェックが失敗した場合は先へ進まず、`PUBLIC_READY=false` を維持します。秘密情報・Search Console/GA4/ASP成果・`reports/` はpublic repositoryへcommitしません。

## 1. ローカルを再現可能にする

- [ ] `main`へ移動し、`git pull --ff-only origin main`でGitHub上の最新mainへ同期する。
- [ ] `git status --short --branch`がcleanであることを確認し、作業branchを作る。
- [ ] `.node-version`どおりNode.js 22.16.0を使用する。
- [ ] lockfileが無い場合は `npm install --package-lock-only` で実生成し、`package-lock.json`をcommit対象にする。
- [ ] `npm ci`を成功させる。
- [ ] `npm run lock:check`を成功させる。
- [ ] `npm run verify`（特にsecurity/self-test/build/smoke）を成功させる。

## 2. 実情報と実案件を設定する

- [ ] `npm run site:configure -- --name "正式サイト名" --url "https://実ドメイン" --description "説明" --operator "運営者名" --contact "問い合わせ先"` を実行する。
- [ ] `data/site.json`にexample値、仮の運営者情報、仮の問い合わせ先が残っていないことを確認する。
- [ ] A8.net / ValueCommerce等で提携済みの実案件だけをdraft登録し、成果条件・禁止事項・Web掲載可否・公式URL・Fact source/checkedAtを人間が確認する。
- [ ] `npm run offer:check -- <offer-id>`の後、確認済み案件だけを `npm run offer:activate -- <offer-id> --confirm-rules-reviewed` でactive化する。
- [ ] `npm run launch:check`を成功させる（初回公開はfreshなverified active offerが1件以上必要）。

## 3. 外部サービスを接続する

- [ ] Cloudflare PagesをGit連携し、Production branch=`main`、Build command=`npm run cloudflare:build`、Output=`dist`、Node=22.16.0にする。GitHub Actionsは追加しない。
- [ ] Search Consoleの所有権確認とサービスアカウント追加を行い、ローカルの `.env.local` に `GSC_CLIENT_EMAIL`、`GSC_PRIVATE_KEY`、`GSC_SITE_URL`を設定して `npm run gsc:fetch`を確認する。
- [ ] GA4を使う場合だけ `PUBLIC_GA_MEASUREMENT_ID` とData API設定を追加する。使わない場合は空のままにする。
- [ ] Cloudflare Preview/Productionの確認中は `PUBLIC_READY=false` にする。Preview branchでtrueにしない。

## 4. Previewから本番へ進める

- [ ] Cloudflare Previewをdesktop/mobileで確認し、CTA、広告表記、比較/診断/0件表示、Privacy、外部送信、リンク、canonical、noindexを確認する。
- [ ] 実ドメイン・運営者・問い合わせ・実案件・Privacy/外部送信を再確認し、`npm run launch:check`を再実行する。
- [ ] Production環境だけ `PUBLIC_READY=true` にし、strict `npm run cloudflare:build`を成功させる。
- [ ] 公開後 `REMOTE_SITE_URL=https://実ドメイン REMOTE_EXPECT_PUBLIC=true REMOTE_REQUIRE_COMMIT_MATCH=true npm run remote:smoke`を成功させる。
- [ ] `npm run ops:summary`でremote branch/version/commitとlocal HEADを確認する。
- [ ] `npm run gsc:submit`でsitemapを送信する。

## 5. Macの日次運転を開始する

- [ ] `.env.local`で `LOCAL_AUTOMATION_ENABLED=true`、`LOCAL_AUTO_PUSH=false`、repo外の `LOCAL_BACKUP_DIR`を設定する。
- [ ] `npm run local:doctor`を成功させる。
- [ ] cleanなmainで `npm run local:daily`を手動実行し、private dataがGit差分へ出ず、安全な既存ページ変更/Safety Pause以外がcommitされないことを確認する。
- [ ] 手動runと生成された `reports/ops-summary.md`、backup SHA verificationを確認後だけ `LOCAL_AUTO_PUSH=true` にする。
- [ ] `.env.local`の実行時刻を確認し、Macで `npm run local:install`によりlaunchdへ登録する。Node path変更後は再installする。
