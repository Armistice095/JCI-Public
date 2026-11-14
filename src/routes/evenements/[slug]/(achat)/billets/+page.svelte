<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { env } from '$env/dynamic/public';
  import StepTop from '$lib/components/StepTop.svelte';
  import BottomBar from '$lib/components/BottomBar.svelte';
  import Button from '$lib/components/Button.svelte';
  import { createApi, unwrap, type PublicEvent } from '$lib/api/client';
  import { checkoutFor } from '$lib/checkout.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { formatXof, formatWhen } from '$lib/format';
  import { pageState, orderedPosters } from '$lib/event';

  let { data } = $props();
  const slug = $derived(data.event.slug);
  const co = $derived(checkoutFor(slug));
  /** Disponibilités rafraîchies à l'ouverture de l'étape (la page événement peut dater d'une minute). */
  let fresh = $state<PublicEvent | null>(null);
  const ev = $derived(fresh ?? data.event);
  const cats = $derived(ev.categories.filter((c) => c.availability !== 'DISABLED'));
  const max = $derived(ev.maxPerOrder);
  const full = $derived(co.count >= max);
  const when = $derived(formatWhen(ev.startsAt, ev.endsAt));
  const cover = $derived(orderedPosters(ev)[0]);

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

<div class="wrap">
  <div class="main">
    <div>
      <h1>Choisissez vos billets</h1>
      <p class="lead">Maximum {max} billet{max > 1 ? 's' : ''} par commande.</p>
    </div>

    <div class="list">
      {#each cats as c (c.id)}
        {@const q = co.qty[c.id] ?? 0}
        <section class="card cat" class:off={c.availability !== 'AVAILABLE'} class:sel={q > 0} aria-label={c.name}>
          <div class="inf">
            <b class="nm">{c.name}</b>
            <span class="pr">{formatXof(c.priceXof)}</span>
            {#if c.conditions}<small>{c.conditions}</small>{/if}
          </div>
          {#if c.availability === 'AVAILABLE'}
            <div class="stp">
              <button type="button" onclick={() => change(c.id, -1)} aria-label="Retirer un billet {c.name}" disabled={!q}>−</button>
              <output aria-live="polite">{q}</output>
              <button type="button" onclick={() => change(c.id, 1)} aria-label="Ajouter un billet {c.name}" disabled={full || q >= limit(c)}>+</button>
            </div>
          {:else}
            <span class="pill">{c.availability === 'SOLD_OUT' ? 'Épuisé' : c.availability === 'NOT_STARTED' ? 'Bientôt disponible' : 'Vente terminée'}</span>
          {/if}
        </section>
      {/each}
    </div>

    {#if full}
      <p class="note">Vous avez atteint le maximum de {max} billets par commande.</p>
    {/if}
  </div>

  <aside class="card side" aria-label="Votre commande">
    <div class="mini">
      {#if cover}
        <img class="poster" src={cover.url} alt="" width="48" height="60" />
      {:else}
        <div class="poster ph" aria-hidden="true"><Icon name="cal" /></div>
      {/if}
      <div>
        <b>{ev.title}</b>
        {#if when}<small>{when.title}{when.sub ? ` · ${when.sub}` : ''}</small>{/if}
        {#if ev.venueName || ev.city}<small>{[ev.venueName, ev.city].filter(Boolean).join(', ')}</small>{/if}
      </div>
    </div>
    <h3>Votre commande</h3>
    {#each co.lines as l}<div class="sum"><div><b>{l.cat.name}</b><small>{l.n} × {formatXof(l.cat.priceXof)}</small></div><b>{formatXof(l.cat.priceXof * l.n)}</b></div>{/each}
    {#if !co.count}<p class="empty">Aucun billet sélectionné.</p>{/if}
    <div class="sum t"><span>Total</span><b>{formatXof(co.total)}</b></div>
    <Button block disabled={!co.count} onclick={next}>Continuer<Icon name="arrow" /></Button>
  </aside>
</div>

<div class="mbar">
  <BottomBar>
    <div><small>{co.count} billet{co.count > 1 ? 's' : ''}</small><strong>{formatXof(co.total)}</strong></div>
    <Button disabled={!co.count} onclick={next}>Continuer<Icon name="arrow" /></Button>
  </BottomBar>
</div>

<style>
  h1 { margin: 4px 0 0; }
  .lead { margin: 6px 0 0; color: var(--mut); }
  .wrap { display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start; }
  .main { flex: 1 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .list { display: flex; flex-direction: column; gap: 12px; }
  .card { margin: 0; border: 1px solid var(--line); border-radius: 16px; padding: 18px; }
  .side { flex: 0 0 360px; position: sticky; top: 24px; padding: 24px; display: none; }
  .side h3 { margin: 0 0 14px; font-size: 18px; }
  .mbar { display: block; }
  @media (min-width: 900px) {
    .side { display: block; }
    .mbar { display: none; }
    .card { padding: 22px 24px; border-radius: 18px; }
  }
  .cat { display: flex; justify-content: space-between; align-items: center; gap: 16px; transition: border-color .15s; }
  .cat.sel { border-color: var(--acc); box-shadow: inset 0 0 0 1px var(--acc); }
  .cat.off { background: var(--soft); border-color: transparent; }
  .inf { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .nm { font-size: 17px; }
  .pr { font-weight: 800; font-size: 18px; }
  .cat small { color: var(--mut); font-size: 13.5px; line-height: 1.4; margin-top: 2px; }
  .cat.off .nm, .cat.off .pr { color: var(--mut); }
  .pill { display: inline-flex; border: 1px solid var(--line); border-radius: 99px; padding: 2px 11px; font-size: 13px; font-weight: 700; color: var(--mut); white-space: nowrap; background: var(--bg); }
  .stp { display: flex; align-items: center; gap: 12px; flex: none; }
  .stp button { width: 44px; height: 44px; border-radius: 50%; border: 1.5px solid var(--ink); background: none; color: var(--ink); font: 700 20px system-ui; cursor: pointer; }
  .stp button:focus-visible { outline: 3px solid var(--acc); outline-offset: 2px; }
  .stp button:disabled { border-color: var(--line); color: var(--mut); cursor: not-allowed; }
  .stp output { min-width: 22px; text-align: center; font-weight: 800; font-size: 17px; }
  .note { margin: 0; background: var(--soft); border-radius: 12px; padding: 12px 14px; font-size: 14px; color: var(--mut); }
  .mini { display: flex; gap: 12px; align-items: center; padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid var(--line); }
  .poster { width: 48px; height: 60px; border-radius: 9px; flex: none; object-fit: cover; }
  .poster.ph { background: linear-gradient(150deg, #3a2f9c, #1553b8); display: grid; place-items: center; color: #fff; }
  .mini b { display: block; line-height: 1.3; }
  .mini small { display: block; color: var(--mut); font-size: 13px; line-height: 1.4; }
  .sum { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; }
  .sum small { display: block; color: var(--mut); font-size: 14px; }
  .sum b { white-space: nowrap; }
  .sum.t { align-items: baseline; border-top: 1px dashed var(--line); margin: 10px 0 16px; padding-top: 14px; }
  .sum.t b { font-size: 28px; letter-spacing: -.02em; }
  .empty { margin: 0; color: var(--mut); font-size: 14px; }
</style>
