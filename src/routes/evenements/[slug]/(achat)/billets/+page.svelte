<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { env } from '$env/dynamic/public';
  import StepTop from '$lib/components/StepTop.svelte';
  import BottomBar from '$lib/components/BottomBar.svelte';
  import Button from '$lib/components/Button.svelte';
  import { createApi, unwrap, type PublicEvent } from '$lib/api/client';
  import { checkoutFor } from '$lib/checkout.svelte';
  import { formatXof } from '$lib/format';
  import { pageState } from '$lib/event';

  let { data } = $props();
  const slug = $derived(data.event.slug);
  const co = $derived(checkoutFor(slug));
  /** Disponibilités rafraîchies à l'ouverture de l'étape (la page événement peut dater d'une minute). */
  let fresh = $state<PublicEvent | null>(null);
  const ev = $derived(fresh ?? data.event);
  const cats = $derived(ev.categories.filter((c) => c.availability !== 'DISABLED'));
  const max = $derived(ev.maxPerOrder);
  const full = $derived(co.count >= max);

  onMount(async () => {
    try {
      const api = createApi(env.PUBLIC_API_URL ?? '');
      const e = await unwrap<PublicEvent>(api.GET('/public/events/{slug}', { params: { path: { slug } }, cache: 'no-store' }));
      fresh = e;
      if (pageState(e) !== 'open') return void goto(`/evenements/${slug}`, { replaceState: true });
    } catch {
      /* on garde les données de la page ; le serveur tranche de toute façon à la commande */
    }
    clamp();
  });

  /** Plafond d'une catégorie : `remaining` n'est exact que sous 10 (il est plafonné à 10 par l'API). */
  function limit(c: (typeof cats)[number]) {
    const stock = c.remaining < 10 ? c.remaining : Infinity;
    return Math.min(c.maxPerOrder, max, stock);
  }
  function clamp() {
    for (const c of cats) {
      const q = co.qty[c.id] ?? 0;
      if (c.availability !== 'AVAILABLE') delete co.qty[c.id];
      else if (q > limit(c)) co.qty[c.id] = limit(c);
    }
    for (const id of Object.keys(co.qty)) if (!cats.some((c) => c.id === id) || !co.qty[id]) delete co.qty[id];
    while (co.count > max) {
      const id = Object.keys(co.qty).at(-1)!;
      co.qty[id]--; if (!co.qty[id]) delete co.qty[id];
    }
    co.cats = cats.filter((c) => c.availability === 'AVAILABLE' || co.qty[c.id]);
    co.save();
  }

  function change(id: string, d: number) {
    const c = cats.find((x) => x.id === id)!;
    const next = (co.qty[id] ?? 0) + d;
    if (next < 0 || next > limit(c) || co.count + d > max) return;
    if (next === 0) delete co.qty[id]; else co.qty[id] = next;
    clamp();
  }

  function next() {
    clamp();
    if (!co.count) return;
    co.syncHolders();
    co.save();
    goto(`/evenements/${slug}/coordonnees`);
  }
</script>

<svelte:head><title>Choisissez vos billets · {data.event.title}</title></svelte:head>

<StepTop back={`/evenements/${slug}`} step={1} />
<h1>Choisissez vos billets</h1>
<p>Maximum {max} billet{max > 1 ? 's' : ''} par commande.</p>

{#each cats as c (c.id)}
  {@const q = co.qty[c.id] ?? 0}
  <div class="cat" class:off={c.availability !== 'AVAILABLE'}>
    <div><b>{c.name}</b><small>{formatXof(c.priceXof)}</small></div>
    {#if c.availability === 'AVAILABLE'}
      <div class="stp">
        <button type="button" onclick={() => change(c.id, -1)} aria-label="Retirer un billet {c.name}" disabled={!q}>−</button>
        <output aria-live="polite">{q}</output>
        <button type="button" onclick={() => change(c.id, 1)} aria-label="Ajouter un billet {c.name}" disabled={full || q >= limit(c)}>+</button>
      </div>
    {:else}
      <b>{c.availability === 'SOLD_OUT' ? 'Épuisé' : c.availability === 'NOT_STARTED' ? 'Bientôt disponible' : 'Vente terminée'}</b>
    {/if}
  </div>
{/each}

{#if full}
  <p class="note" style="margin-top: 16px">Vous avez atteint le maximum de {max} billets par commande.</p>
{/if}

<BottomBar>
  <div><small>{co.count} billet{co.count > 1 ? 's' : ''}</small><strong>{formatXof(co.total)}</strong></div>
  <Button disabled={!co.count} onclick={next}>Continuer</Button>
</BottomBar>

<style>
  .cat { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 0; border-top: 1px solid var(--line); }
  .cat:last-of-type { border-bottom: 1px solid var(--line); }
  .cat small { display: block; color: var(--mut); font-size: 14px; font-weight: 500; }
  .cat.off b { color: var(--mut); }
  .stp { display: flex; align-items: center; gap: 14px; }
  .stp button { width: 44px; height: 44px; border-radius: 50%; border: 1.5px solid var(--ink); background: none; color: var(--ink); font: 700 20px system-ui; cursor: pointer; }
  .stp button:disabled { border-color: var(--line); color: var(--mut); cursor: not-allowed; }
  .stp output { min-width: 20px; text-align: center; font-weight: 800; }
  .note { background: var(--soft); border-radius: 10px; padding: 12px 14px; font-size: 14px; color: var(--mut); }
</style>
