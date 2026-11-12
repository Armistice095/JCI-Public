import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { createApi, ApiError, unwrap, type PublicEvent } from '$lib/api/client';

/**
 * Cache mémoire de la page publique (guide §7.9) : l'API limite à 120 appels/min/IP et ne voit que
 * l'adresse de ce serveur. Une entrée vit 60 s (comme le `s-maxage` de l'API) ; une panne de l'API
 * sert l'ancienne version jusqu'à 5 min plutôt qu'une page d'erreur. Les 404 sont gardés 15 s.
 */
const TTL = 60_000;
const STALE_ON_ERROR = 5 * 60_000;
const TTL_404 = 15_000;
const MAX_ENTRIES = 500;

type Entry = { at: number; event: PublicEvent | null };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<PublicEvent>>();

function store(slug: string, event: PublicEvent | null) {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.delete(slug);
  cache.set(slug, { at: Date.now(), event });
}

export async function getPublicEvent(
  slug: string,
  fetchFn: typeof fetch,
  clientIp?: string
): Promise<PublicEvent> {
  const hit = cache.get(slug);
  if (hit) {
    const age = Date.now() - hit.at;
    if (hit.event === null && age < TTL_404) throw error(404, 'Événement introuvable');
    if (hit.event && age < TTL) return hit.event;
  }

  if (!env.PUBLIC_API_URL) {
    console.error('[jci-public] PUBLIC_API_URL est vide : créez le fichier .env (voir .env.example) puis relancez le serveur.');
    throw error(503, 'Le service est momentanément indisponible. Réessayez dans un instant.');
  }

  let pending = inflight.get(slug);
  if (!pending) {
    // X-Forwarded-For : l'API peut ainsi garder le plafond par visiteur (appel déclenché par ce visiteur).
    const api = createApi(env.PUBLIC_API_URL ?? '', fetchFn, clientIp ? { 'X-Forwarded-For': clientIp } : undefined);
    pending = unwrap<PublicEvent>(api.GET('/public/events/{slug}', { params: { path: { slug } } }));
    inflight.set(slug, pending);
    pending.finally(() => inflight.delete(slug)).catch(() => {});
  }

  try {
    const event = await pending;
    store(slug, event);
    return event;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      store(slug, null);
      throw error(404, 'Événement introuvable');
    }
    // Cause réelle dans le terminal du serveur (jamais affichée au visiteur).
    console.error(
      `[jci-public] GET ${env.PUBLIC_API_URL}/api/v1/public/events/${slug} a échoué :`,
      e instanceof ApiError ? `HTTP ${e.status} ${e.code} — ${e.message}` : e
    );
    if (hit?.event && Date.now() - hit.at < STALE_ON_ERROR) return hit.event;
    if (e instanceof ApiError && e.status === 429) throw error(503, 'Beaucoup de monde en ce moment. Réessayez dans un instant.');
    throw error(503, 'Le service est momentanément indisponible. Réessayez dans un instant.');
  }
}
