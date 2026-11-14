<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { replaceState, goto, afterNavigate } from '$app/navigation';
  import { env } from '$env/dynamic/public';
  import Header from '$lib/components/Header.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Button from '$lib/components/Button.svelte';
  import { createApi, unwrap, ApiError, type Schemas, type PublicEvent } from '$lib/api/client';
  import { formatXof, formatWhen, whatsappUrl } from '$lib/format';
  import { safeCheckoutUrl, recallOrder, type OrderMemo } from '$lib/payment';
  import { checkoutFor, clearAllCheckouts } from '$lib/checkout.svelte';
  import { shareEvent } from '$lib/share';

  type Order = Schemas['PublicOrderStatus'];
  const reference = page.params.reference!;
  const api = createApi(env.PUBLIC_API_URL ?? '');

  // Jeton lu une fois à l'ouverture (page rendue dans le navigateur uniquement), gardé en mémoire, puis retiré de la barre d'adresse.
  const token = page.url.searchParams.get('token') ?? '';
  // Indice de FedaPay dans l'adresse de retour (?status=approved|declined|canceled…). Jamais une preuve de paiement :
  // il sert uniquement à PROPOSER de réessayer quand l'acheteur a annulé ; seul le serveur confirme un paiement.
  const hint = page.url.searchParams.get('status');
  const abandoned = !!hint && hint !== 'approved';
  let stripped = false;
  afterNavigate(() => {
    // Aussi ?status=…&id=… ajoutés par FedaPay. (replaceState n'est possible qu'une fois le routeur initialisé.)
    if (!stripped) { stripped = true; replaceState(page.url.pathname, {}); }
  });
  let order = $state<Order | null>(null);
  let notFound = $state(false);
  let unstable = $state(false);
  let memo = $state<OrderMemo | null>(null);
  let event = $state<PublicEvent | null>(null);
  let busy = $state(false);
  let problem = $state('');
  let now = $state(Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fails = 0;
  let fetchedAt = 0;
  const startedAt = Date.now();

  const status = $derived(order?.status);
  const pending = $derived(!order || status === 'PENDING_PAYMENT' || status === 'PAYMENT_IN_PROGRESS');
  const filesPending = $derived(status === 'PAID' && (!order!.tickets.length || order!.tickets.some((t) => !t.filesReady)));
  const left = $derived(order?.reservedUntil ? Math.max(0, Math.floor((Date.parse(order.reservedUntil) - now) / 1000)) : null);
  /** Commande encore « en attente » côté serveur alors que l'acheteur a annulé (ou que rien n'aboutit depuis 45 s) : on propose de réessayer. */
  const offerRetry = $derived(pending && !!order && (left === null || left > 0) && (abandoned || now - startedAt > 45_000));
  const canRetry = $derived(status === 'FAILED' && !!memo && (left === null || left > 0 || !order?.reservedUntil));
  const contact = $derived(whatsappUrl(event?.contactPhone ?? null));
  const when = $derived(event ? formatWhen(event.startsAt, event.endsAt) : null);
  const whenText = $derived(when ? when.title + (when.sub ? ` · ${when.sub}` : '') : '');
  const venue = $derived(event ? [event.venueName, event.city].filter(Boolean).join(', ') : '');
  /** « 2 × Pass Simple » : billets groupés par catégorie. */
  const sums = $derived.by(() => {
    const m = new Map<string, number>();
    for (const t of order?.tickets ?? []) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return [...m].map(([c, n]) => `${n} × ${c}`).join(', ');
  });
  const slugHome = $derived(memo ? `/evenements/${memo.slug}` : undefined);

  const isFinal = (o: Order) =>
    o.status === 'PAID' ? o.tickets.length > 0 && o.tickets.every((t) => t.filesReady) : !['PENDING_PAYMENT', 'PAYMENT_IN_PROGRESS'].includes(o.status);

  async function tick() {
    let delay = Date.now() - startedAt > 20 * 60_000 ? 15_000 : 3000; // jamais plus vite que 3 s (limite serveur)
    try {
      const o = await unwrap<Order>(api.GET('/public/orders/{reference}', { params: { path: { reference }, query: { token } }, cache: 'no-store' }));
      order = o; unstable = false; fetchedAt = Date.now(); fails = 0;
      if (isFinal(o)) return;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 422)) { notFound = true; return; }
      fails++; unstable = fails >= 3 || !!order; // échecs réseau répétés : on le dit, on continue d'essayer
      if (e instanceof ApiError && e.status === 429) delay = Math.max(delay, (e.retryAfter ?? 10) * 1000);
    }
    timer = setTimeout(tick, delay);
  }

  onMount(() => {
    if (token.length < 20) { notFound = true; return; }
    memo = recallOrder(reference);
    tick();
    const clock = setInterval(() => (now = Date.now()), 1000);
    // Les liens de fichiers expirent après 15 min : on les renouvelle au retour sur l'onglet.
    const wake = () => {
      if (!document.hidden && order && isFinal(order) && order.status === 'PAID' && Date.now() - fetchedAt > 10 * 60_000) tick();
    };
    document.addEventListener('visibilitychange', wake);
    return () => { clearTimeout(timer); clearInterval(clock); document.removeEventListener('visibilitychange', wake); };
  });

  // Coordonnées de l'organisation : seulement si l'on sait de quel événement il s'agit.
  $effect(() => {
    if (memo && !event && status && (['PAID', 'FAILED', 'EXPIRED', 'REFUND_REQUIRED'] as string[]).includes(status)) {
      unwrap<PublicEvent>(api.GET('/public/events/{slug}', { params: { path: { slug: memo.slug } } })).then((e) => (event = e)).catch(() => {});
    }
  });

  // Commande terminée (payée, expirée, remboursée, annulée) : plus rien à reprendre → on efface panier, coordonnées et clés.
  // (FAILED et « en attente » : on garde, l'acheteur peut réessayer.) `memo` est déjà copié en mémoire vive pour l'affichage.
  $effect(() => {
    if (status && ['PAID', 'EXPIRED', 'REFUND_REQUIRED', 'REFUNDED', 'CANCELLED'].includes(status)) clearAllCheckouts();
  });

  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  async function retry() {
    if (busy) return;
    busy = true; problem = '';
    try {
      const r = await unwrap<Schemas['PublicOrderCreated']>(
        api.POST('/public/orders/{reference}/retry-payment', { params: { path: { reference }, query: { token } } })
      );
      const url = safeCheckoutUrl(r.checkoutUrl);
      if (!url) throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'La page de paiement n’a pas pu être ouverte. Réessayez dans un instant.');
      location.assign(url);
    } catch (e) {
      busy = false;
      problem = e instanceof ApiError ? e.message : 'Une erreur est survenue. Réessayez dans un instant.';
      if (e instanceof ApiError && e.code === 'INVALID_STATE') { clearTimeout(timer); tick(); } // déjà payée ou expirée
    }
  }

  function restart() {
    if (!memo) return;
    checkoutFor(memo.slug).clear(); // nouvel achat, nouvelle Idempotency-Key
    goto(`/evenements/${memo.slug}/billets`);
  }

  const shareEventLink = () => memo && shareEvent({ title: order?.eventTitle ?? '' }, `${location.origin}/evenements/${memo.slug}`);
</script>

<svelte:head><title>Votre commande · JCI Comé Excellence</title><meta name="robots" content="noindex" /></svelte:head>

<Header homeHref={slugHome} secure />

<main class="narrow" class:wide={status === 'PAID'}>
  {#if notFound}
    <div class="center">
      <div class="big wait"><Icon name="clock" /></div>
      <h1 style="font-size: 28px">Commande introuvable</h1>
      <p>Le lien est incomplet ou n’est plus valide. Ouvrez-le depuis le message que vous avez reçu après votre paiement.</p>
    </div>

  {:else if pending && offerRetry}
    <div class="center">
      <div class="big wait"><Icon name="clock" /></div>
      <h1 style="font-size: 28px">Le paiement n’a pas été finalisé</h1>
      <p>
        Vous pouvez le reprendre tant que vos places sont réservées{#if left !== null} (encore <b class="cd">{mmss(left)}</b>){/if}.
        Si vous avez déjà payé, patientez : cette page se met à jour toute seule.
      </p>
      {#if problem}<div class="ban" role="alert">{problem}</div>{/if}
      <div class="stack">
        <Button block onclick={retry} loading={busy} disabled={busy}>{busy ? 'Redirection…' : 'Réessayer le paiement'}</Button>
        {#if slugHome}<Button outline block href={slugHome}>Retour à l’événement</Button>{/if}
      </div>
    </div>

  {:else if pending}
    <div class="center">
      <div class="spin" role="status" aria-label="Vérification en cours"></div>
      <h1 style="font-size: 26px">Nous vérifions votre paiement</h1>
      <p>Cela prend quelques secondes. Ne fermez pas cette page.</p>
      <ul class="steps"><li><Icon name="chk" />Retour de la page de paiement reçu</li><li class="now"><Icon name="info" />Confirmation du paiement par notre serveur</li><li><Icon name="mail" />Envoi de vos billets par e-mail</li></ul>
      {#if left !== null && order}<p>Places réservées encore <b class="cd">{mmss(left)}</b></p>{/if}
      <p class="note">Votre billet sera valide uniquement après la confirmation de notre serveur.</p>
      {#if unstable}<p class="note">Connexion instable : nouvelle tentative en cours…</p>{/if}
    </div>

  {:else if status === 'PAID'}
    <div class="wrap">
      <div class="mainc">
        <div class="hero">
          <div class="big ok"><Icon name="chk" /></div>
          <h1>Paiement confirmé</h1>
          <p class="lead">
            Commande {order!.reference}, {formatXof(order!.amountXof)}.<br />
            {#if memo?.email}Vos billets ont été envoyés à <b>{memo.email}</b>.{:else}Vos billets vous ont été envoyés par e-mail.{/if}
            Vous pouvez aussi les télécharger ici.
          </p>
        </div>
        <p class="tip m"><Icon name="info" /><span><b>À l’entrée</b>, présentez le QR code du billet : il figure sur l’image et sur le PDF.</span></p>
        {#if filesPending}<p class="note" role="status">Préparation de vos billets…</p>{/if}
        {#each order!.tickets as t}
          <article class="tk" aria-label="Billet {t.number}">
            <div class="h">
              <div class="r1"><span>Billet N° {t.number}</span><span class="pill">{t.category}</span></div>
              <h2>{order!.eventTitle}</h2>
              {#if whenText || venue}
                <div class="meta">
                  {#if whenText}<span><Icon name="cal" />{whenText}</span>{/if}
                  {#if venue}<span><Icon name="pin" />{venue}</span>{/if}
                </div>
              {/if}
            </div>
            <div class="perf" aria-hidden="true"></div>
            <div class="b">
              <div><small>Participant</small><span class="nm">{t.holderName.toUpperCase()}</span><p class="cn">Billet personnel, non transférable.</p></div>
              <div class="acts">
                {#if t.filesReady}
                  <a class="btn p" href={t.pdfUrl} target="_blank" rel="noopener noreferrer"><Icon name="dl" />Télécharger le PDF</a>
                  <a class="btn" href={t.imageUrl} target="_blank" rel="noopener noreferrer"><Icon name="img" />Enregistrer l’image</a>
                {:else}
                  <span class="btn off">Préparation…</span>
                {/if}
              </div>
            </div>
          </article>
        {/each}
        {#if slugHome}<a class="lnk m" href={slugHome}>Retour à l’événement</a>{/if}
      </div>

      <aside class="side" aria-label="Récapitulatif de la commande">
        <h3>Votre commande</h3>
        <dl class="kv"><dt>Référence</dt><dd>{order!.reference}</dd><dt>Billets</dt><dd>{sums}</dd><dt>Total payé</dt><dd>{formatXof(order!.amountXof)}</dd></dl>
        <hr />
        <p class="tip"><Icon name="info" /><span><b>À l’entrée</b>, présentez le QR code du billet : il figure sur l’image et sur le PDF.</span></p>
        {#if memo}<Button outline block onclick={shareEventLink}><Icon name="share" />Partager l’événement</Button>{/if}
        {#if slugHome}<a class="lnk" href={slugHome}>Retour à l’événement</a>{/if}
      </aside>
    </div>
    {#if memo}
      <div class="dock"><Button outline block onclick={shareEventLink}><Icon name="share" />Partager l’événement</Button></div>
    {/if}

  {:else if status === 'FAILED'}
    <div class="center">
      <div class="big err"><Icon name="x" /></div>
      <h1 style="font-size: 28px">Le paiement n’a pas abouti</h1>
      <p>{order!.message ?? 'Aucun billet n’a été émis.'}</p>
      {#if left !== null && left > 0}<p>Places réservées encore <b class="cd">{mmss(left)}</b></p>{/if}
      {#if problem}<div class="ban" role="alert">{problem}</div>{/if}
      <div class="stack">
        {#if canRetry}<Button block onclick={retry} loading={busy} disabled={busy}>{busy ? 'Redirection…' : 'Réessayer le paiement'}</Button>{/if}
        {#if !canRetry && memo}<Button block onclick={restart}>Recommencer ma commande</Button>{/if}
        {#if contact}<Button outline block href={contact} target="_blank">Contacter l’organisation</Button>{/if}
      </div>
    </div>

  {:else if status === 'EXPIRED'}
    <div class="center">
      <div class="big wait"><Icon name="clock" /></div>
      <h1 style="font-size: 28px">Commande expirée</h1>
      <p>{order!.message ?? 'Le délai de paiement est dépassé et les places ne sont plus réservées.'}</p>
      <div class="stack">
        {#if memo}<Button block onclick={restart}>Recommencer ma commande</Button>{/if}
        {#if contact}<Button outline block href={contact} target="_blank">Contacter l’organisation</Button>{/if}
      </div>
    </div>

  {:else}
    <!-- REFUND_REQUIRED, REFUNDED, CANCELLED : le message de l'API, tel quel ; aucune relance de paiement -->
    <div class="center">
      <div class="big wait"><Icon name="clock" /></div>
      <h1 style="font-size: 28px">{status === 'REFUNDED' ? 'Commande remboursée' : status === 'CANCELLED' ? 'Commande annulée' : 'Votre paiement sera remboursé'}</h1>
      <p>{order!.message ?? ''}</p>
      <div class="stack">
        {#if contact}<Button outline block href={contact} target="_blank">Contacter l’organisation</Button>{/if}
        {#if slugHome}<Button outline block href={slugHome}>Retour à l’événement</Button>{/if}
      </div>
    </div>
  {/if}
</main>

<style>
  .narrow { max-width: 560px; margin: auto; }
  .narrow.wide { max-width: 1040px; }
  .center { text-align: center; }
  .stack { display: grid; gap: 10px; margin-top: 20px; }
  .big { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; margin: 28px auto 16px; background: var(--soft); }
  .big.ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 16%, transparent); } .big.err { color: var(--err); background: color-mix(in srgb, var(--err) 16%, transparent); } .big.wait { color: var(--wait); background: color-mix(in srgb, var(--wait) 16%, transparent); }
  .big :global(svg) { width: 28px; height: 28px; stroke-width: 2.4; }
  .spin { width: 56px; height: 56px; border: 5px solid var(--line); border-top-color: var(--acc); border-radius: 50%; animation: s 1s linear infinite; margin: 36px auto 18px; }
  @keyframes s { to { transform: rotate(1turn); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  .cd { font-variant-numeric: tabular-nums; color: var(--ink); font-weight: 800; }
  .note { background: var(--soft); border-radius: 12px; padding: 12px 14px; font-size: 14px; color: var(--mut); margin: 0 0 16px; }
  .ban { border: 1.5px solid var(--err); color: var(--err); border-radius: 10px; padding: 12px 14px; font-weight: 700; margin: 12px 0 0; }
  .steps { list-style: none; margin: 8px auto 12px; padding: 0; display: grid; gap: 10px; text-align: left; width: fit-content; max-width: 100%; }
  .steps li { display: flex; gap: 10px; align-items: center; color: var(--mut); font-size: 14px; }
  .steps li :global(svg) { width: 18px; height: 18px; color: var(--ok); flex: none; }
  .steps li.now :global(svg) { color: var(--acc); }

  .wrap { display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start; }
  .mainc { flex: 1 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .hero { display: flex; flex-direction: column; gap: 10px; }
  .hero .big { margin: 8px 0 0; }
  .hero h1 { margin: 0; }
  .lead { margin: 0; color: var(--mut); }
  .lead b { color: var(--ink); }
  .tip { margin: 0; display: flex; gap: 12px; align-items: flex-start; background: var(--soft); border-radius: 14px; padding: 14px 16px; color: var(--mut); font-size: 14px; }
  .tip :global(svg) { width: 20px; height: 20px; color: var(--acc); flex: none; margin-top: 1px; }
  .tip b { color: var(--ink); }
  .side { display: none; flex: 0 0 340px; position: sticky; top: 24px; border: 1px solid var(--line); border-radius: 18px; padding: 24px; flex-direction: column; gap: 16px; }
  .side h3 { margin: 0; font-size: 18px; }
  .kv { display: grid; grid-template-columns: 96px 1fr; gap: 6px 12px; margin: 0; font-size: 14.5px; }
  .kv dt { color: var(--mut); } .kv dd { margin: 0; font-weight: 700; }
  .side hr { border: 0; border-top: 1px solid var(--line); margin: 0; }
  .lnk { text-align: center; color: var(--acc); font-weight: 700; text-decoration: none; min-height: 44px; display: flex; align-items: center; justify-content: center; }
  .dock { position: fixed; inset: auto 0 0 0; background: var(--bg); border-top: 1px solid var(--line); padding: 12px 16px calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 10; }
  .wrap { padding-bottom: 80px; }
  @media (min-width: 900px) {
    .side { display: flex; } .tip.m, .lnk.m, .dock { display: none; } .wrap { padding-bottom: 0; }
  }

  .tk { border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: var(--bg); }
  .tk .h { background: #16103f; color: #fff; padding: 16px 16px; display: flex; flex-direction: column; gap: 6px; }
  :global(:root) { --tk-hd: #16103f; }
  @media (prefers-color-scheme: dark) { .tk .h { background: var(--soft); } }
  .r1 { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 13px; font-weight: 700; opacity: 0.9; }
  .pill { border: 1px solid currentColor; border-radius: 99px; padding: 1px 11px; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
  .tk h2 { margin: 0; font-size: 18px; line-height: 1.25; font-weight: 800; overflow-wrap: anywhere; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 14px; opacity: 0.9; }
  .meta span { display: flex; gap: 6px; align-items: center; }
  .meta :global(svg) { width: 16px; height: 16px; flex: none; }
  .perf { position: relative; height: 0; border-top: 2px dashed var(--line); margin: 0 14px; }
  .perf::before, .perf::after { content: ''; position: absolute; top: -13px; width: 24px; height: 24px; border-radius: 50%; background: var(--bg); border: 1px solid var(--line); }
  .perf::before { left: -27px; } .perf::after { right: -27px; }
  .tk .b { padding: 16px 16px 18px; display: flex; flex-direction: column; gap: 16px; }
  .tk small { color: var(--mut); font-size: 13px; display: block; }
  .tk .nm { font-size: 18px; font-weight: 800; display: block; overflow-wrap: anywhere; }
  .tk .cn { font-size: 13.5px; color: var(--mut); margin: 2px 0 0; }
  .acts { display: flex; flex-direction: column; gap: 10px; }
  .btn { flex: 1; min-height: 52px; border-radius: 14px; font: 800 15.5px var(--font); display: flex; align-items: center; justify-content: center; gap: 9px; border: 1.5px solid var(--ink); background: none; color: var(--ink); text-decoration: none; }
  .btn.p { background: var(--ink); color: var(--bg); }
  .btn.off { border-color: var(--line); color: var(--mut); }
  .btn :global(svg) { width: 20px; height: 20px; }
  @media (min-width: 900px) {
    .tk .h { padding: 20px 24px; } .tk h2 { font-size: 21px; } .tk .b { padding: 20px 24px 24px; } .tk .nm { font-size: 20px; }
    .perf { margin: 0 18px; } .perf::before { left: -31px; } .perf::after { right: -31px; }
    .acts { flex-direction: row; gap: 12px; }
  }
</style>
