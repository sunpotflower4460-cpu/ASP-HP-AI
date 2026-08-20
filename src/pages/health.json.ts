import pkg from '../../package.json';

export function GET() {
  let siteOrigin: string | null = null;
  try {
    siteOrigin = new URL(process.env.SITE_URL || '').origin;
  } catch {}

  const payload = {
    status: 'ok',
    app: 'asp-hp-ai',
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    publicReady: process.env.PUBLIC_READY === 'true',
    siteOrigin,
    branch: process.env.CF_PAGES_BRANCH || null,
    commitSha: process.env.CF_PAGES_COMMIT_SHA || null,
    pagesUrl: process.env.CF_PAGES_URL || null
  };
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
