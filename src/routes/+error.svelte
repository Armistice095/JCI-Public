<script lang="ts">
  import { page } from '$app/state';
  import Header from '$lib/components/Header.svelte';
  const notFound = $derived(page.status === 404);
</script>

<svelte:head><title>{notFound ? 'Page introuvable' : 'Service indisponible'} · JCI Comé Excellence</title><meta name="robots" content="noindex" /></svelte:head>

<Header />
<main class="narrow">
  <h1>{notFound ? 'Page introuvable' : 'Un instant…'}</h1>
  <p>{notFound ? 'Cet événement n’existe pas ou n’est plus disponible. Vérifiez le lien que vous avez reçu.' : page.error?.message}</p>
</main>

<style>
  .narrow { max-width: 560px; margin: auto; }
</style>
