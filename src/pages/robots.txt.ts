import type { APIRoute } from 'astro';
import site from '../../data/site.json';

export const GET: APIRoute = ({ site: astroSite }) => {
  const publicReady = import.meta.env.PUBLIC_READY === 'true';
  const base = astroSite || new URL(site.url || 'https://example.com');
  const sitemap = new URL('sitemap-index.xml', base).toString();
  const body = publicReady
    ? `User-agent: *\nAllow: /\nSitemap: ${sitemap}\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
