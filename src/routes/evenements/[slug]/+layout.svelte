<script lang="ts">
  import { page } from '$app/state';
  let { data, children } = $props();
  const og = $derived(data.event.og);
  // Origine publique : toujours https hors développement local (le Worker peut voir http derrière Cloudflare).
  const origin = $derived(/^(localhost|127\.0\.0\.1)/.test(page.url.host) ? page.url.origin : 'https://' + page.url.host);
  const url = $derived(origin + page.url.pathname);
  const isTunnel = $derived(/\/(billets|coordonnees|recap)$/.test(page.url.pathname));
  const base = $derived(url.replace(/\/(billets|coordonnees|recap)$/, ''));
  const image = $derived(og.imageUrl ?? origin + '/og-default.png');
  const ev = $derived(data.event);
  const prices = $derived(ev.categories.map((c) => c.priceXof));
  // Données structurées schema.org/Event ; `<` échappé pour qu'aucun contenu ne ferme la balise script.
  const jsonLd = $derived(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: ev.title,
      description: og.description,
      image: [image],
      ...(ev.startsAt ? { startDate: ev.startsAt } : {}),
      ...(ev.endsAt ? { endDate: ev.endsAt } : {}),
      eventStatus: ev.status === 'CANCELLED' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: ev.venueName, address: { '@type': 'PostalAddress', addressLocality: ev.city, addressCountry: 'BJ' } },
      organizer: { '@type': 'Organization', name: 'JCI Comé Excellence', url: 'https://jcicomee.org' },
      ...(prices.length ? { offers: { '@type': 'Offer', url: base, priceCurrency: 'XOF', price: Math.min(...prices), availability: 'https://schema.org/InStock' } } : {})
    }).replace(/</g, '\\u003c')
  );
</script>

<!-- Rendu côté serveur : lu par les robots WhatsApp / Facebook qui n'exécutent pas JavaScript -->
<svelte:head>
  <title>{og.title}</title>
  <meta name="description" content={og.description} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="fr_FR" />
  <meta property="og:site_name" content="JCI Comé Excellence" />
  <meta property="og:title" content={og.title} />
  <meta property="og:description" content={og.description} />
  <meta property="og:url" content={base} />
  <meta property="og:image" content={image} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={og.title} />
  <meta name="twitter:description" content={og.description} />
  <meta name="twitter:image" content={image} />
  <link rel="canonical" href={base} />
  {#if isTunnel}
    <meta name="robots" content="noindex, nofollow" />
  {:else}
    {@html `<script type="application/ld+json">${jsonLd}</script>`}
  {/if}
</svelte:head>

{@render children()}
