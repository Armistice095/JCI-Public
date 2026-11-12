import { getPublicEvents } from '$lib/server/eventList';
import type { RequestHandler } from './$types';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export const GET: RequestHandler = async ({ fetch, url }) => {
  const origin = /^(localhost|127\.0\.0\.1)/.test(url.host) ? url.origin : 'https://' + url.host;
  const urls: { loc: string; lastmod?: string }[] = [{ loc: origin + '/' }];
  try {
    // when=all, 100 par page, jusqu'à totalPages (garde-fou : 50 pages) ; cache de 5 min.
    for (let p = 1; p <= 50; p++) {
      const list = await getPublicEvents(fetch, 'all', p, 100, 5 * 60_000);
      for (const e of list.data) urls.push({ loc: `${origin}/evenements/${encodeURIComponent(e.slug)}`, lastmod: e.updatedAt });
      if (p >= list.meta.totalPages) break;
    }
  } catch {
    return new Response('Service indisponible', { status: 503, headers: { 'retry-after': '60' } });
  }
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=300' } });
};
