import { env } from '$env/dynamic/public';
import { getPublicEvents } from '$lib/server/eventList';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 12;

export const load: PageServerLoad = async ({ fetch, url, setHeaders }) => {
  const page = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
  const siteUrl = /^https:\/\/[^\s]+$/.test(env.PUBLIC_SITE_URL ?? '') ? env.PUBLIC_SITE_URL! : 'https://jcicomee.org';
  try {
    const list = await getPublicEvents(fetch, 'upcoming', page, PAGE_SIZE);
    setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60' });
    return { events: list.data, meta: list.meta, failed: false, siteUrl };
  } catch {
    return { events: [], meta: { page, pageSize: PAGE_SIZE, total: 0, totalPages: 0 }, failed: true, siteUrl };
  }
};
