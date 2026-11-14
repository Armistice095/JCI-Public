<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Header from '$lib/components/Header.svelte';
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';
  import { loadTurnstile } from '$lib/turnstile';
  import { pageState } from '$lib/event';

  let { data, children } = $props();
  const home = $derived(`/evenements/${data.event.slug}`);

  // Le script anti-robots est téléchargé dès l'entrée dans le tunnel : sur une connexion lente, il serait sinon prêt trop tard au moment de payer.
  onMount(() => { if (env.PUBLIC_TURNSTILE_SITE_KEY) loadTurnstile().catch(() => {}); });

  // Billetterie fermée, événement annulé ou complet : retour à la page événement, qui explique la situation.
  $effect(() => {
    if (pageState(data.event) !== 'open') goto(home, { replaceState: true });
  });
</script>

<svelte:head><meta name="robots" content="noindex" /></svelte:head>

<Header homeHref={home} secure />
<main class:wide={/\/(billets|recap|coordonnees)$/.test(page.url.pathname)}>{@render children()}</main>

<style>
  main { max-width: 560px; margin: auto; }
  main.wide { max-width: 1040px; }
</style>
