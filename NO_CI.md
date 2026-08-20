# CIなし運用

このプロジェクトはGitHub Actionsを前提にしません。品質ゲートと本番公開は、**ローカルverify → Cloudflare build gate → 公開後remote smoke** の3段構えです。

## 1. どこでも同じローカル検証

```bash
npm run verify
```

`verify` は順番に以下を実行します。

1. URL安全性テスト
2. 日次run排他lockテスト
3. private backup復元/改ざん拒否テスト
4. Commercial Intent / Content Gap / Safety Pause等の決定論的self-test
5. tracked secret / private key /典型API token / private operational data検査
6. 公開準備レポート
7. Astro type/content check
8. content validation
9. 案件情報のfreshness check
10. Astro build
11. 生成後の内部リンク・PR表記・canonical・sitemap・robots・health・Analytics/affiliate CTA整合Smoke Test

本番公開条件まで厳格に確認するときは:

```bash
PUBLIC_READY=true SITE_URL=https://your-domain.jp npm run verify:prod
```

結果は `reports/verification.json` に残ります。

初回公開ではさらに依存関係の再現性を確認します。

```bash
npm run lock:check
npm run launch:check
```

`launch:check` は `package-lock.json` が無い/不整合の場合も停止します。通常開発の`verify`はlockfile未生成でも壊さないため、開発継続と初回公開ゲートを分離しています。

日々の状態を1ファイルで見る場合:

```bash
npm run ops:summary
```

```text
reports/ops-summary.md
```

へ、verify状態・公開準備・収益・GA4外部クリック・commercial intent・GSCページング・次の改善候補をまとめます。

## 2. Cloudflare Pages Git integrationを本番ゲートにする

Cloudflare PagesをGitHubリポジトリへ直接接続します。GitHub Actions経由のDirect Uploadは使いません。

設定値:

- Production branch: `main`
- Framework preset: `Astro` または `None`
- Build command: `npm run cloudflare:build`
- Build output directory: `dist`
- Root directory: repository root
- Node: `.node-version` の22.23.2

Cloudflare Pagesはbuild commandが非0終了した場合、そのbuildを失敗扱いにして公開しません。そのため `cloudflare:build` 自体がデプロイ前品質ゲートになります。

### Preview環境

- `PUBLIC_READY=false`
- feature branchはpreview deploymentとして利用

preview branchで `PUBLIC_READY=true` になっていた場合、`cloudflare:build` は意図的に失敗します。

### Production環境

公開準備中:

- `PUBLIC_READY=false`
- 実サイトをnoindex/robots denyのまま確認可能

本公開時のみ:

- `PUBLIC_READY=true`
- `SITE_URL` を実HTTPSドメインに設定
- strict verificationがCloudflare build内で自動実行される

初回公開は `launch:check` 側でactive案件1件以上を必須にします。一方、公開後の継続deployではactive案件0件も許可します。これは、最後の案件が終了した時に**古いCTAを消すためのdeployが案件0件条件で止まる**逆転事故を防ぐためです。

## 3. 公開されたcommitを確認

デプロイ後に以下へアクセスします。

```text
https://your-domain.jp/health.json
```

Cloudflare環境では以下を確認できます。

- `status`
- `publicReady`
- `branch`
- `commitSha`
- `pagesUrl`

GitHub Actionsのstatusを見られなくても、どのcommitが実際に公開されたか確認できます。

## 4. 公開後Remote Smoke

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

実HTTPで次を確認します。

- `/health.json`
- `/robots.txt`
- `/sitemap-index.xml`
- `/`
- `/comparison/`
- `/privacy/`
- `/external-transmission/`
- public/noindex整合
- canonical origin
- publicReady
- production branch
- 想定外の別origin redirect

Cloudflare上のcommit SHAまでローカルHEADと一致させたい時だけ:

```text
REMOTE_REQUIRE_COMMIT_MATCH=true
```

にします。

## 5. 日次自動運転

GitHub Actions schedulerは使わず、macOS `launchd` と `scripts/local-daily.mjs` を使います。詳細は [LOCAL_AUTOMATION.md](./LOCAL_AUTOMATION.md) を参照してください。

```text
launchd
→ exclusive run lock
→ git pull --ff-only
→ private permission hardening
→ local doctor
→ offer Safety Scan
→ daily data fetch
→ analyze
→ editor plan / optional AI
→ verify
→ ops-summary
→ private backup + SHA verify
→ existing page modification / safe offer pause only commit
→ optional push
→ Cloudflare build gate
```

手動実行とlaunchdが重なっても排他lockで1runだけ進みます。古いlockでも同じMac上のPIDが生きている場合はlockを奪いません。

## 6. private operational data

このrepoはpublicなので、検索クエリ・GA4・ASP成果・AI使用量・reportsはGitHubへ送りません。

バックアップ:

```bash
npm run local:permissions
npm run local:backup
npm run local:backup:verify
```

復元:

```bash
npm run local:backup:restore -- --latest --confirm
```

バックアップ作成・検証・復元のすべてで、path escape / symlink escape / SHA-256不一致を拒否します。`data/affiliate`はruntime JSONだけを対象にし、trackedのREADME等はバックアップ/復元で触りません。

## 7. GitHub Actionsについて

V1では `.github/workflows/` の自動workflowを削除済みです。

- push時のCIなし
- GitHub schedulerなし
- GitHub Actions経由のCloudflare deployなし

正本は:

```text
npm run verify
        +
npm run launch:check   # 初回公開
        +
reports/ops-summary.md
        +
Cloudflare Pages Git integration build gate
        +
npm run remote:smoke
        +
/health.json
```

です。
