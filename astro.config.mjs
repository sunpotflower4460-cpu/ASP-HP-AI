import './scripts/lib/load-local-env.mjs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE_URL || 'https://example.com',
  integrations: [sitemap()]
});
