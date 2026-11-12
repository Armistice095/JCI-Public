import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const origin = /^(localhost|127\.0\.0\.1)/.test(url.host) ? url.origin : 'https://' + url.host;
  const body = `User-agent: *
Allow: /
Disallow: /commande/
Disallow: /evenements/*/billets
Disallow: /evenements/*/coordonnees
Disallow: /evenements/*/recap

Sitemap: ${origin}/sitemap.xml
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
