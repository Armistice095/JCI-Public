import createClient from 'openapi-fetch';
import type { paths, components } from './schema';
import { ApiError, networkError, toApiError } from './errors';

export type Schemas = components['schemas'];
export type PublicEvent = Schemas['PublicEvent'];
export type PublicCategory = Schemas['PublicCategory'];

/** Client typé. `baseUrl` = PUBLIC_API_URL ; `fetch` = celui de SvelteKit (serveur) ou du navigateur. */
export function createApi(baseUrl: string, fetchFn: typeof fetch = fetch, headers?: Record<string, string>) {
  return createClient<paths>({ baseUrl: `${baseUrl.replace(/\/$/, '')}/api/v1`, fetch: fetchFn, headers });
}

/** Renvoie les données ou lève une `ApiError` (code stable, message en français). */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>
): Promise<T> {
  let res;
  try {
    res = await call;
  } catch {
    throw networkError();
  }
  if (res.error !== undefined || !res.response.ok) {
    throw toApiError(res.response.status, res.error, res.response.headers.get('Retry-After'));
  }
  return res.data as T;
}

export { ApiError };
export type PublicEventCard = Schemas['PublicEventCard'];
