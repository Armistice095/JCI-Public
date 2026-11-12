import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
  // Même durée que l'API : un CDN placé devant peut garder la page événement 60 s.
  setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60' });
};
