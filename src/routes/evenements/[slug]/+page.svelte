<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { env } from '$env/dynamic/public';
  import Header from '$lib/components/Header.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Carousel from '$lib/components/Carousel.svelte';
  import BottomBar from '$lib/components/BottomBar.svelte';
  import Button from '$lib/components/Button.svelte';
  import { shareEvent } from '$lib/share';
  import { formatXof, formatWhen, formatProgrammeTime, whatsappUrl } from '$lib/format';
  import { categoryLabel, pageState, stateInfo, availabilityLabel, safeAccent, orderedPosters } from '$lib/event';

  let { data } = $props();
  const e = $derived(data.event);
  const state = $derived(pageState(e));
  const info = $derived(stateInfo[state]);
  const when = $derived(formatWhen(e.startsAt, e.endsAt));
  const posters = $derived(orderedPosters(e));
  const accent = $derived(safeAccent(e.accentColor));
  const cats = $derived(e.categories.filter((c) => c.availability !== 'DISABLED'));
  const minPrice = $derived(
    Math.min(...e.categories.filter((c) => c.availability === 'AVAILABLE').map((c) => c.priceXof))
  );
  const whatsapp = $derived(whatsappUrl(e.contactPhone));
  const infos = $derived(
    [
      { title: 'Infos pratiques', text: e.practicalInfo },
      { title: 'Conditions d’utilisation du billet', text: e.ticketTerms },
      { title: 'Annulation et remboursement', text: e.refundPolicy }
    ].filter((s) => s.text && s.text.trim())
  );

  /** Une seule vue par chargement, dans le navigateur uniquement (jamais pendant le rendu serveur : les robots gonfleraient le compteur). */
  onMount(() => {
    fetch(`${(env.PUBLIC_API_URL ?? '').replace(/\/$/, '')}/api/v1/public/events/${encodeURIComponent(e.slug)}/views`, {
      method: 'POST',
      keepalive: true
    }).catch(() => {});
  });

  const share = () => shareEvent(e, page.url.origin + page.url.pathname);
</script>

<Header homeHref={page.url.pathname} onshare={share} />

<main id="v" style:--acc={accent ?? undefined}>
  <div class="ev" class:solo={!posters.length}>
    {#if posters.length}
      <div class="poster"><Carousel {posters} title={e.title} /></div>
    {/if}
    <div>
      {#if state === 'cancelled'}
        <div class="ban" role="alert">Cet événement est annulé. Les acheteurs seront remboursés par e-mail.</div>
      {/if}
      <span class="pill">{categoryLabel[e.category]}</span><span class="pill {info.tone}"><i></i>{info.label}</span>
      <h1>{e.title}</h1>
      <ul class="facts">
        {#if when}
          <li><Icon name="cal" /><div><b>{when.title}</b>{#if when.sub}<span>{when.sub}</span>{/if}</div></li>
        {/if}
        {#if e.venueName || e.city}
          <li><Icon name="pin" /><div>{#if e.venueName}<b>{e.venueName}</b>{/if}{#if e.city}<span>{e.city}, Bénin</span>{/if}</div></li>
        {/if}
      </ul>

      {#if cats.length}
        <section>
          <h2>Billets</h2>
          {#each cats as c}
            <div class="cat" class:off={c.availability !== 'AVAILABLE'}>
              <div><b>{c.name}</b>{#if c.conditions}<small>{c.conditions}</small>{/if}</div>
              <div class="pr">{formatXof(c.priceXof)}{#if state === 'open'}<small>{availabilityLabel(c)}</small>{/if}</div>
            </div>
          {/each}
        </section>
      {/if}

      {#if e.description}
        <section><h2>À propos</h2><p class="txt">{e.description}</p></section>
      {/if}

      {#if e.programme.length}
        <section>
          <h2>Programme</h2>
          <dl class="pg">
            {#each e.programme as item}<dt>{formatProgrammeTime(item.time)}</dt><dd>{item.label}</dd>{/each}
          </dl>
        </section>
      {/if}

      {#if e.organizers.length}
        <section>
          <h2>Organisé par</h2>
          {#each e.organizers as o}<p><b class="org">{o.name}</b>{#if o.description}, {o.description}{/if}</p>{/each}
        </section>
      {/if}

      {#if infos.length}
        <section>
          <h2>Informations</h2>
          {#each infos as s}
            <details><summary>{s.title}</summary><p class="txt">{s.text}</p></details>
          {/each}
        </section>
      {/if}

      {#if e.faq.length}
        <section>
          <h2>Questions fréquentes</h2>
          {#each e.faq as f}
            <details><summary>{f.question}</summary><p class="txt">{f.answer}</p></details>
          {/each}
        </section>
      {/if}

      {#if whatsapp}
        <section><h2>Une question ?</h2><Button outline href={whatsapp} target="_blank">Écrire sur WhatsApp</Button></section>
      {/if}
    </div>
  </div>
</main>

<BottomBar>
  {#if state === 'open'}
    <div><small>À partir de</small><strong>{formatXof(minPrice)}</strong></div>
    <Button href={`${page.url.pathname}/billets`}>Acheter un billet</Button>
  {:else}
    <div>
      <small>
        {#if state === 'soon'}Les ventes ne sont pas encore ouvertes
        {:else if state === 'ended'}La vente en ligne est terminée
        {:else if state === 'soldout'}Tous les billets sont vendus
        {:else}Aucun achat possible{/if}
      </small>
    </div>
    <Button disabled>
      {#if state === 'soon'}Bientôt disponible{:else if state === 'ended'}Ventes terminées{:else if state === 'soldout'}Billets épuisés{:else}Événement annulé{/if}
    </Button>
  {/if}
</BottomBar>

<style>
  @media (min-width: 900px) {
    .ev:not(.solo) { display: grid; grid-template-columns: 360px 1fr; gap: 64px; align-items: start; }
    .poster { position: sticky; top: 16px; }
  }
  .txt { white-space: pre-line; }
  .org { color: var(--ink); }
  .pill { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--line); border-radius: 99px; padding: 4px 12px; font-size: 13px; font-weight: 700; margin: 0 6px 6px 0; }
  .pill i { width: 8px; height: 8px; border-radius: 50%; background: var(--mut); }
  .pill.ok i { background: var(--ok); }
  .pill.wait i { background: var(--wait); }
  .pill.err i { background: var(--err); }
  .facts { list-style: none; padding: 0; margin: 0; }
  .facts li { display: flex; gap: 14px; margin: 0 0 16px; }
  .facts b { display: block; }
  .facts span { color: var(--mut); }
  .cat { display: flex; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid var(--line); }
  .cat:last-of-type { border-bottom: 1px solid var(--line); }
  .cat small { display: block; color: var(--mut); font-size: 14px; font-weight: 500; }
  .cat .pr { text-align: right; white-space: nowrap; font-weight: 800; }
  .cat.off b { color: var(--mut); }
  .pg { display: grid; grid-template-columns: 64px 1fr; gap: 10px 12px; margin: 0; }
  .pg dt { font-weight: 700; }
  .pg dd { margin: 0; color: var(--mut); }
  details { border-top: 1px solid var(--line); padding: 14px 0; }
  details:last-of-type { border-bottom: 1px solid var(--line); }
  summary { cursor: pointer; font-weight: 700; list-style: none; display: flex; justify-content: space-between; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: '+'; }
  details[open] summary::after { content: '−'; }
  details p { margin: 10px 0 0; }
  .ban { border: 1.5px solid var(--err); color: var(--err); border-radius: 10px; padding: 12px 14px; font-weight: 700; margin: 0 0 18px; }
</style>
