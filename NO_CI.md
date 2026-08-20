# CIなし運用

このプロジェクトはGitHub Actionsを前提にしません。品質ゲートと本番公開は以下の2段構えです。

## 1. どこでも同じ検証

```bash
npm run verify
```

`verify` は順番に以下を実行します。

1. 公開準備レポート
2. Astro/type/content check
3. content validation
4. 案件情報のfreshness check
5. Astro build
6. 生成後の内部リンク・PR表記・canonical・sitemap・robots・health smoke test

本番公開条件まで厳格に確認するときは:

```bash
PUBLIC_READY=true SITE_URL=https://your-domain.example npm run verify:prod
```

結果は `reports/verification.json` に残ります。

## 2. Cloudflare Pages Git integrationを本番ゲートにする

Cloudflare PagesをGitHubリポジトリへ直接接続します。GitHub Actions経由のDirect Uploadは使いません。

設定値:

- Production branch: `main`
- Framework preset: `Astro` または `None`
- Build command: `npm run cloudflare:build`
- Build output directory: `dist`
- Root directory: repository root

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
- `npm run verify:prod` 相当のstrict checkがCloudflare build内で自動実行される

## 3. 公開されたcommitを確認

デプロイ後に以下へアクセスします。

```text
https://your-domain.example/health.json
```

Cloudflare環境では以下を確認できます。

- `status`
- `publicReady`
- `branch`
- `commitSha`
- `pagesUrl`

GitHub Actionsのstatusを見られなくても、どのcommitが実際に公開されたか確認できます。

## 4. GitHub Actionsについて

`.github/workflows/` は補助/将来用として残してありますが、V1の公開可否・品質保証の正本ではありません。

正本は:

```text
npm run verify
        +
Cloudflare Pages Git integration build gate
```

です。
