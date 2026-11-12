import type { LayoutServerLoad } from './$types';
import { getPublicEvent } from '$lib/server/eventCache';

export const load: LayoutServerLoad = async ({ params, fetch, getClientAddress }) => {
  let ip: string | undefined;
  try { ip = getClientAddress(); } catch { /* pas d'adresse disponible */ }
  return { event: await getPublicEvent(params.slug, fetch, ip) };
};
