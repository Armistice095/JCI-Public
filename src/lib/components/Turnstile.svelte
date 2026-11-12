<script lang="ts">
  import { onMount } from 'svelte';
  import { loadTurnstile } from '$lib/turnstile';

  let { siteKey, ontoken, onerror }: { siteKey: string; ontoken: (t: string | null) => void; onerror: () => void } = $props();
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
        // « interaction-only » : invisible, sauf si Cloudflare demande une action à l'acheteur.
        id = t.render(el, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          language: 'fr',
          callback: (tok: string) => ontoken(tok),
          'expired-callback': () => ontoken(null),
          'error-callback': () => { ontoken(null); onerror(); }
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
