import { env } from '$env/dynamic/public';
import { createApi, unwrap, type Schemas } from '$lib/api/client';

type List = Schemas['PublicEventList'];
type When = 'upcoming' | 'past' | 'all';

/**
 * Liste publique des événements (guide §7.9 bis), mise en cache 60 s par requête : l'API limite à
 * 120 appels/min/IP et ne voit que l'adresse de sortie du Worker. Panne de l'API : ancienne version
 * servie jusqu'à 10 min ; sinon l'erreur remonte (l'appelant décide de l'affichage).
 */
const TTL = 60_000;
const STALE = 10 * 60_000;
const cache = new Map<string, { at: number; data: List }>();
const inflight = new Map<string, Promise<List>>();

export async function getPublicEvents(fetchFn: typeof fetch, when: When, page: number, pageSize: number, ttl = TTL): Promise<List> {
  const key = `${when}:${page}:${pageSize}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  if (!env.PUBLIC_API_URL) throw new Error('PUBLIC_API_URL est vide');

  let pending = inflight.get(key);
  if (!pending) {
    const api = createApi(env.PUBLIC_API_URL, fetchFn);
    pending = unwrap<List>(api.GET('/public/events', { params: { query: { when, page, pageSize } } }));
    inflight.set(key, pending);
    pending.finally(() => inflight.delete(key)).catch(() => {});
  }
  try {
    const data = await pending;
    if (cache.size > 100) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.error(`[jci-public] GET ${env.PUBLIC_API_URL}/api/v1/public/events a échoué :`, e);
    if (hit && Date.now() - hit.at < STALE) return hit.data;
    throw e;
  }
}
