import site from '../../data/site.json';

export function GET() {
  const publicReady = import.meta.env.PUBLIC_READY === 'true';
  const base = import.meta.env.SITE_URL || site.url || 'https://example.com';
  const body = publicReady
    ? `User-agent: *\nAllow: /\nSitemap: ${base.replace(/\/$/, '')}/sitemap-index.xml\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
