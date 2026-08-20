# ASP-HP-AI

低コストで運用する、HP中心の自律型アフィリエイトサイト基盤です。

## V1の方針
- 動画生成なし / 広告費なし
- Astro + Cloudflare Pages想定
- A8 / ValueCommerce等をAdapter化
- Search Consoleを主な観測データにする
- AIは大量記事生成ではなく「必要な改善だけ」を行う
- PR表記・事実ソース・予算上限をコードで強制
- `PUBLIC_READY=true` になるまで `noindex` を維持

## 開始
```bash
npm install
cp .env.example .env
npm run dev
```

## 品質確認
```bash
npm run validate
npm run check
npm run build
```

## Search Console
`GSC_CLIENT_EMAIL`、`GSC_PRIVATE_KEY`、`GSC_SITE_URL` を設定後:
```bash
npm run gsc:fetch
npm run analyze
```

## 公開前に必須
1. `data/site.json` の運営者情報・URLを設定
2. `data/offers/*.json` に実案件を登録し、公式情報源を付ける
3. ASPの媒体登録・提携を完了
4. `PUBLIC_READY=true` を設定
5. CIが全てPASSしていることを確認

詳細は `ARCHITECTURE.md` / `AFFILIATE_RULES.md` / `CONTENT_POLICY.md` を参照してください。
