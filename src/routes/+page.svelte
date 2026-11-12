<script lang="ts">
  import { page } from '$app/state';
  import Header from '$lib/components/Header.svelte';
  import { formatShortDay, formatTime, formatXof } from '$lib/format';
  import { categoryLabel, safeAccent } from '$lib/event';
  import type { PublicEventCard } from '$lib/api/client';
  let { data } = $props();

  const origin = $derived(/^(localhost|127\.0\.0\.1)/.test(page.url.host) ? page.url.origin : 'https://' + page.url.host);

  function status(e: PublicEventCard): { label: string; tone: '' | 'ok' | 'wait' } | null {
    if (e.soldOut) return { label: 'Billets épuisés', tone: '' };
    if (e.salesStatus === 'OPEN') return { label: 'Billetterie ouverte', tone: 'ok' };
    if (e.salesStatus === 'NOT_OPEN') return { label: 'Bientôt ouverte', tone: 'wait' };
    if (e.salesStatus === 'CLOSED') return { label: 'Ventes terminées', tone: '' };
    return null;
  }
  const where = (e: PublicEventCard) => [e.venueName, e.city].filter(Boolean).join(', ');
</script>

<svelte:head>
  <title>Événements · JCI Comé Excellence</title>
  <meta name="description" content="Billetterie officielle de JCI Comé Excellence : conférences, formations, ateliers et soirées. Réservez vos billets en ligne." />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="fr_FR" />
  <meta property="og:site_name" content="JCI Comé Excellence" />
  <meta property="og:title" content="Événements · JCI Comé Excellence" />
  <meta property="og:description" content="Billetterie officielle de JCI Comé Excellence. Réservez vos billets en ligne." />
  <meta property="og:url" content={origin + '/'} />
  <meta property="og:image" content={origin + '/og-default.png'} />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href={origin + '/'} />
</svelte:head>

<Header />
<h1>Nos événements</h1>

{#if data.failed}
  <p class="state" role="alert">Les événements ne peuvent pas être affichés pour le moment. <a href="/" data-sveltekit-reload>Réessayer</a></p>
{:else if data.events.length === 0}
  <p class="state">Aucun événement à venir pour le moment. Revenez bientôt !</p>
{:else}
  <ul class="grid">
    {#each data.events as e (e.slug)}
      {@const st = status(e)}
      <li style={safeAccent(e.accentColor) ? `--acc:${safeAccent(e.accentColor)}` : undefined}>
        <a class="card" href="/evenements/{e.slug}">
          {#if e.coverUrl}
            <img src={e.coverUrl} alt="" loading="lazy" width="600" height="338" />
          {:else}
            <div class="ph" aria-hidden="true"></div>
          {/if}
          <div class="body">
            <div>
              <span class="pill">{categoryLabel[e.category]}</span>
              {#if st}<span class="pill {st.tone}"><i></i>{st.label}</span>{/if}
            </div>
            <h2>{e.title}</h2>
            {#if e.startsAt}<p>{formatShortDay(e.startsAt)} · {formatTime(e.startsAt)}</p>{/if}
            {#if where(e)}<p>{where(e)}</p>{/if}
            {#if e.priceFromXof !== null && !e.soldOut}<p class="price">À partir de {formatXof(e.priceFromXof)}</p>{/if}
          </div>
        </a>
      </li>
    {/each}
  </ul>

  {#if data.meta.totalPages > 1}
    <nav class="pager" aria-label="Pages">
      {#if data.meta.page > 1}<a href={data.meta.page === 2 ? '/' : `/?page=${data.meta.page - 1}`} rel="prev">← Précédent</a>{/if}
      <span>Page {data.meta.page} sur {data.meta.totalPages}</span>
      {#if data.meta.page < data.meta.totalPages}<a href="/?page={data.meta.page + 1}" rel="next">Suivant →</a>{/if}
    </nav>
  {/if}
{/if}

<footer><a href={data.siteUrl}>← Retour au site JCI Comé Excellence</a></footer>

<style>
  .grid { list-style: none; padding: 0; margin: 0; display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .card { display: block; color: inherit; text-decoration: none; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--bg); height: 100%; }
  .card:hover { border-color: var(--acc); }
  img, .ph { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; background: var(--soft); }
  .body { padding: 14px 16px 16px; }
  h2 { margin: 6px 0 6px; font-size: 18px; }
  .body p { margin: 0 0 3px; font-size: 14px; }
  .price { color: var(--ink); font-weight: 700; }
  .pill { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--line); border-radius: 99px; padding: 3px 10px; font-size: 12px; font-weight: 700; margin: 0 6px 4px 0; }
  .pill i { width: 8px; height: 8px; border-radius: 50%; background: var(--mut); }
  .pill.ok i { background: var(--ok); }
  .pill.wait i { background: var(--wait); }
  .state { padding: 40px 0; text-align: center; }
  .pager { display: flex; justify-content: center; align-items: center; gap: 18px; margin: 28px 0; }
  .pager a, footer a { color: var(--acc); font-weight: 700; text-decoration: none; }
  footer { margin: 36px 0 20px; text-align: center; }
</style>
