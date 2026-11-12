<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Header from '$lib/components/Header.svelte';
  import { shareEvent } from '$lib/share';
  import { pageState } from '$lib/event';

  let { data, children } = $props();
  const home = $derived(`/evenements/${data.event.slug}`);

  // Billetterie fermée, événement annulé ou complet : retour à la page événement, qui explique la situation.
  $effect(() => {
    if (pageState(data.event) !== 'open') goto(home, { replaceState: true });
  });
</script>

<svelte:head><meta name="robots" content="noindex" /></svelte:head>

<Header homeHref={home} onshare={() => shareEvent(data.event, page.url.origin + home)} />
<main class="narrow">{@render children()}</main>

<style>
  .narrow { max-width: 560px; margin: auto; }
</style>
