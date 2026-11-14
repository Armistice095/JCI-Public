import type { RequestHandler } from './$types';
import { getPublicEvent } from '$lib/server/eventCache';

/**
 * Image d'aperçu du lien (Open Graph), servie depuis NOTRE domaine : adresse stable et courte, qui ne dépend ni de
 * l'expiration d'une URL signée ni de la lenteur du stockage (WhatsApp et Facebook abandonnent l'image au moindre doute).
 * On ne relaie que l'image `og.imageUrl` donnée par l'API pour ce slug (jamais une adresse fournie par le visiteur).
 */
const MAX_BYTES = 5 * 1024 * 1024;
const RASTER = /^image\/(jpeg|png|webp|gif)\b/i;

export const GET: RequestHandler = async ({ params, fetch, getClientAddress }) => {
  const fallback = () => new Response(null, { status: 302, headers: { location: '/og-default.png', 'cache-control': 'public, max-age=300' } });
  try {
    let ip: string | undefined;
    try { ip = getClientAddress(); } catch { /* pas d'adresse disponible */ }
    const ev = await getPublicEvent(params.slug, fetch, ip);
    const src = ev.og.imageUrl;
    if (!src || !/^https?:\/\//i.test(src)) return fallback();
    const res = await fetch(src, { headers: { accept: 'image/jpeg,image/png,image/webp,*/*;q=0.5' } });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !RASTER.test(type)) return fallback();
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return fallback();
    return new Response(buf, {
      headers: {
        'content-type': type.split(';')[0],
        'content-length': String(buf.byteLength),
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
        'x-content-type-options': 'nosniff'
      }
    });
  } catch {
    return fallback();
  }
};
