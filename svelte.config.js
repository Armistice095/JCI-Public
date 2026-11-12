import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Rendu côté serveur : indispensable pour les aperçus WhatsApp / Facebook (guide §7.9). */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self', 'https://challenges.cloudflare.com'], // Turnstile (étape achat)
        'frame-src': ['https://challenges.cloudflare.com'],
        'style-src': ['self', 'unsafe-inline'],
        'font-src': ['self', 'data:'],
        // + l'origine de l'API, ajoutée à l'exécution depuis PUBLIC_API_URL (src/hooks.server.ts)
        'img-src': ['self', 'data:', 'blob:', 'https:'],
        'connect-src': ['self', 'https://challenges.cloudflare.com'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'frame-ancestors': ['none']
      }
    }
  }
};
