import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';

/** La billetterie n'a pas de page d'accueil : on renvoie vers le site principal (PUBLIC_SITE_URL, https://jcicomee.org par défaut). */
export const load: PageServerLoad = () => {
  const target = /^https:\/\/[^\s]+$/.test(env.PUBLIC_SITE_URL ?? '') ? env.PUBLIC_SITE_URL! : 'https://jcicomee.org';
  redirect(302, target);
};
