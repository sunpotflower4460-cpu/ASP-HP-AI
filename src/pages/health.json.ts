export function GET() {
  const payload = {
    status: 'ok',
    app: 'asp-hp-ai',
    generatedAt: new Date().toISOString(),
    publicReady: process.env.PUBLIC_READY === 'true',
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
