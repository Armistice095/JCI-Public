<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { replaceState, goto, afterNavigate } from '$app/navigation';
  import { env } from '$env/dynamic/public';
  import Header from '$lib/components/Header.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Button from '$lib/components/Button.svelte';
  import { createApi, unwrap, ApiError, type Schemas, type PublicEvent } from '$lib/api/client';
  import { formatXof, whatsappUrl } from '$lib/format';
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
  let showTickets = $state(false);
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
    if (memo && !event && status && (['FAILED', 'EXPIRED', 'REFUND_REQUIRED'] as string[]).includes(status)) {
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

<Header homeHref={slugHome} />

<main class="narrow">
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
        <Button block onclick={retry} disabled={busy} aria-busy={busy}>{busy ? 'Redirection…' : 'Réessayer le paiement'}</Button>
        {#if slugHome}<Button outline block href={slugHome}>Retour à l’événement</Button>{/if}
      </div>
    </div>

  {:else if pending}
    <div class="center">
      <div class="spin" role="status" aria-label="Vérification en cours"></div>
      <h1 style="font-size: 26px">Nous vérifions votre paiement</h1>
      <p>Cela prend quelques secondes. Ne fermez pas cette page.</p>
      {#if left !== null && order}<p>Places réservées encore <b class="cd">{mmss(left)}</b></p>{/if}
      <p class="note">Votre billet sera valide uniquement après la confirmation de notre serveur.</p>
      {#if unstable}<p class="note">Connexion instable : nouvelle tentative en cours…</p>{/if}
    </div>

  {:else if status === 'PAID' && showTickets}
    <button class="bk" onclick={() => (showTickets = false)}><Icon name="back" /> Commande</button>
    <h1>Vos billets</h1>
    <p>Un billet par participant. Présentez le QR code à l’entrée : il figure sur l’image et sur le PDF de chaque billet.</p>
    {#if filesPending}<p class="note" role="status">Préparation de vos billets…</p>{/if}
    <div class="tks">
      {#each order!.tickets as t}
        <article class="tk">
          <div class="h"><small>Billet d’accès, N° {t.number}</small><b>{order!.eventTitle.toUpperCase()}</b></div>
          <div class="b">
            <small>Participant</small><span class="nm">{t.holderName.toUpperCase()}</span>
            <div class="g2"><div><small>Catégorie</small><b>{t.category}</b></div></div>
            <p class="cn">Billet personnel, non transférable.</p>
          </div>
          <div class="acts">
            {#if t.filesReady}
              <a class="btn" href={t.imageUrl} target="_blank" rel="noopener noreferrer">Image</a>
              <a class="btn" href={t.pdfUrl} target="_blank" rel="noopener noreferrer">PDF</a>
            {:else}
              <span class="btn off">Image</span><span class="btn off">PDF</span>
            {/if}
          </div>
        </article>
      {/each}
    </div>
    {#if memo}
      <div class="stack"><Button outline block onclick={shareEventLink}>Partager l’événement (« J’y serai ! »)</Button></div>
    {/if}

  {:else if status === 'PAID'}
    <div class="center">
      <div class="big ok"><Icon name="chk" /></div>
      <h1 style="font-size: 28px">Paiement confirmé</h1>
      <p>
        Commande {order!.reference}, {formatXof(order!.amountXof)}.<br />
        {#if memo?.email}Vos billets ont été envoyés à {memo.email}.{:else}Vos billets vous ont été envoyés par e-mail.{/if}
      </p>
      {#if filesPending}<p class="note" role="status">Préparation de vos billets…</p>{/if}
      <div class="stack">
        <Button block onclick={() => (showTickets = true)}>Voir mes billets</Button>
        {#if slugHome}<Button outline block href={slugHome}>Retour à l’événement</Button>{/if}
      </div>
    </div>

  {:else if status === 'FAILED'}
    <div class="center">
      <div class="big err"><Icon name="x" /></div>
      <h1 style="font-size: 28px">Le paiement n’a pas abouti</h1>
      <p>{order!.message ?? 'Aucun billet n’a été émis.'}</p>
      {#if left !== null && left > 0}<p>Places réservées encore <b class="cd">{mmss(left)}</b></p>{/if}
      {#if problem}<div class="ban" role="alert">{problem}</div>{/if}
      <div class="stack">
        {#if canRetry}<Button block onclick={retry} disabled={busy} aria-busy={busy}>{busy ? 'Redirection…' : 'Réessayer le paiement'}</Button>{/if}
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
  .tks, .bk { display: grid; }
  .center { text-align: center; }
  .stack { display: grid; gap: 10px; margin-top: 20px; }
  .big { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; margin: 28px auto 16px; border: 2px solid; }
  .big.ok { color: var(--ok); } .big.err { color: var(--err); } .big.wait { color: var(--wait); }
  .big :global(svg) { width: 30px; height: 30px; }
  .spin { width: 44px; height: 44px; border: 4px solid var(--line); border-top-color: var(--ink); border-radius: 50%; animation: s 1s linear infinite; margin: 36px auto 18px; }
  @keyframes s { to { transform: rotate(1turn); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  .cd { font-variant-numeric: tabular-nums; color: var(--ink); }
  .note { background: var(--soft); border-radius: 10px; padding: 12px 14px; font-size: 14px; color: var(--mut); margin: 0 0 16px; }
  .ban { border: 1.5px solid var(--err); color: var(--err); border-radius: 10px; padding: 12px 14px; font-weight: 700; margin: 12px 0 0; }
  .bk { display: inline-flex; gap: 6px; align-items: center; min-height: 44px; color: var(--mut); font: 600 16px var(--font); background: none; border: 0; padding: 0; cursor: pointer; }
  .tks { gap: 24px; margin-top: 20px; }
  .tk { border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: #fff; color: #16103f; }
  .tk .h { background: #16103f; color: #fff; padding: 18px 20px; }
  .tk .h small { display: block; font-size: 12px; color: #fff; opacity: 0.85; }
  .tk .h b { display: block; font-size: 24px; line-height: 1.1; font-weight: 800; margin-top: 6px; overflow-wrap: anywhere; }
  .tk .b { padding: 18px 20px; }
  .tk small { color: #5d5a78; font-size: 12px; display: block; }
  .tk .nm { font-size: 19px; font-weight: 800; display: block; margin: 0 0 14px; overflow-wrap: anywhere; }
  .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0 0 12px; }
  .tk b { font-size: 14px; }
  .tk .h b { font-size: 24px; }
  .tk .cn { font-size: 12px; color: #5d5a78; margin: 12px 0 0; text-align: center; }
  .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 20px 20px; }
  .acts .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 10px; font: 700 14px var(--font); background: #fff; color: #16103f; border: 1.5px solid #16103f; border-radius: 12px; text-decoration: none; }
  .acts .btn.off { opacity: 0.45; }
</style>
