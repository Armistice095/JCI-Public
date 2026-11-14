<script lang="ts">
  import { onMount } from 'svelte';
  import { loadTurnstile } from '$lib/turnstile';

  let { siteKey, ontoken, onerror, oninteractive, onafter, appearance = 'interaction-only' }: {
    siteKey: string; ontoken: (t: string | null) => void; onerror: (code?: string) => void;
    oninteractive?: () => void; onafter?: () => void; appearance?: 'interaction-only' | 'always';
  } = $props();
  let el: HTMLDivElement;
  let id: string | undefined;

  export function reset() {
    ontoken(null);
    if (id) window.turnstile?.reset(id);
  }

  onMount(() => {
    let gone = false;
    loadTurnstile()
      .then((t) => {
        if (gone) return;
        // « interaction-only » : invisible, sauf si Cloudflare demande une action à l'acheteur (on l'amène alors à l'écran).
        id = t.render(el, {
          sitekey: siteKey,
          appearance,
          retry: 'auto',
          'refresh-expired': 'auto',
          language: 'fr',
          callback: (tok: string) => ontoken(tok),
          'expired-callback': () => ontoken(null),
          'before-interactive-callback': () => oninteractive?.(),
          'after-interactive-callback': () => onafter?.(),
          'error-callback': (code?: string) => { ontoken(null); onerror(code ? String(code) : undefined); return true; }
        });
      })
      .catch(() => onerror());
    return () => { gone = true; if (id) window.turnstile?.remove(id); };
  });
</script>

<div bind:this={el} class="ts"></div>

<style>
  .ts:not(:empty) { margin: 0 0 16px; }
</style>
