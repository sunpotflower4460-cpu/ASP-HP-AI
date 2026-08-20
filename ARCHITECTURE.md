# Architecture

## V1
Google Search → Astro static site → ASP conversion.
Search Console is the primary feedback signal. Git is the initial state/history store.

## Safety boundaries
- `PUBLIC_READY=false` by default: site stays noindex.
- Offer `status=draft` cannot render an affiliate CTA.
- Active offers require an affiliate URL and sourced facts.
- Daily automation is disabled unless GitHub variable `AUTOMATION_ENABLED=true`.
- Deterministic analysis runs before any future LLM editor.

## Growth path
1. Search observation + rule-based opportunity detection
2. A8 report import / ValueCommerce API adapter
3. AI proposal generation under hard budget
4. low-risk edits only
5. DB addition only after repository files become insufficient
