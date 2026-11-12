import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

/** Origine de l'API, lue dans PUBLIC_API_URL au démarrage du serveur (jamais écrite en dur). */
let apiOrigin: string | null = null;
function origin(): string {
  if (apiOrigin === null) {
    try { apiOrigin = new URL(env.PUBLIC_API_URL ?? '').origin; } catch { apiOrigin = ''; }
  }
  return apiOrigin;
}

/** Origines facultatives des fichiers de billets (stockage), pour le partage du visuel en pièce jointe : PUBLIC_FILES_ORIGIN="https://xxx.supabase.co". */
function filesOrigins(): string[] {
  return (env.PUBLIC_FILES_ORIGIN ?? '').split(/[\s,]+/).filter((o) => /^https:\/\/[^\s/]+$/.test(o));
}

/** Ajoute l'origine de l'API aux directives `connect-src` (appels du navigateur) et `img-src` (affiches servies par l'API). */
function withApiOrigin(csp: string): string {
  const api = origin();
  if (!api) return csp;
  const connect = [api, ...filesOrigins()].join(' ');
  return csp
    .split(';')
    .map((d) => {
      const name = d.trim().split(/\s+/)[0];
      return name === 'connect-src' ? `${d.trim()} ${connect}` : name === 'img-src' ? `${d.trim()} ${api}` : d;
    })
    .join(';');
}

export const handle: Handle = async ({ event, resolve }) => {
  const res = await resolve(event);
  const csp = res.headers.get('content-security-policy');
  if (csp) res.headers.set('content-security-policy', withApiOrigin(csp));
  // Le jeton de suivi de commande (?token=) ne doit jamais fuiter via le Referer (guide §7.1).
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (event.url.protocol === 'https:') res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Pages du tunnel et de suivi de commande : jamais indexées.
  if (/^\/(commande\/|evenements\/[^/]+\/(billets|coordonnees|recap))/.test(event.url.pathname)) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
};
