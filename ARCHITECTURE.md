# Architecture

## V1

```text
Google Search
  ↓
Astro static site
  ↓
A8 / ValueCommerce conversion

Search Console / GA4 / ASP observations
  ↓
Mac local-only analysis
  ↓
Commercial Intent + deterministic rules
  ↓
optional low-cost AI editor
  ↓
verify
  ↓
public src/pages change only
  ↓
GitHub main
  ↓
Cloudflare Pages build gate
```

Search Console is the primary SEO feedback signal. GA4 affiliate-click observation and ASP revenue are optional commercial signals.

## State boundaries

### Public Git state

Git stores reproducible site source, offer manifests, validation rules and public page history.

### Local-only operational state

This repository is public. The following must never be committed:

- Search Console queries/results
- GA4 observations
- A8 / ValueCommerce revenue JSON
- AI usage logs
- operations reports
- raw A8 CSV imports
- `.env.local` / credentials

`security-scan.mjs` rejects tracked operational data/secrets, and `local-daily.mjs` only stages `src/pages/**` for autonomous commits.

Optional local snapshots can be stored outside the repository with `LOCAL_BACKUP_DIR`; each snapshot has SHA-256 manifest verification.

## Safety boundaries

- `PUBLIC_READY=false` by default: site stays noindex + robots deny.
- Offer `status=draft` cannot render an affiliate CTA.
- Active offers require an affiliate URL, official/sourced facts and freshness metadata.
- Daily automation is disabled unless local `.env.local` sets `LOCAL_AUTOMATION_ENABLED=true`.
- Autonomous push is disabled unless `LOCAL_AUTO_PUSH=true`.
- Deterministic analysis runs before the optional AI editor.
- Degraded/freshness-unsafe observations do not trigger AI edits.
- Confirmed-revenue pages are protected from automatic edits.
- Cloudflare Pages Git integration runs `npm run cloudflare:build`; a failed build is not published.
- GitHub Actions are not part of the V1 control plane.

## Growth path

1. Search observation + deterministic opportunity detection
2. A8 official CSV import / ValueCommerce report API
3. GA4 outbound-click observation when useful
4. Commercial Intent scoring and revenue-protected editing
5. AI proposal generation under hard budget
6. low-risk edits only
7. DB/server addition only after local files become demonstrably insufficient
