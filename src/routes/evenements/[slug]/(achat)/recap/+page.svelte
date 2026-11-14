<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { env } from '$env/dynamic/public';
  import StepTop from '$lib/components/StepTop.svelte';
  import BottomBar from '$lib/components/BottomBar.svelte';
  import Button from '$lib/components/Button.svelte';
  import Turnstile from '$lib/components/Turnstile.svelte';
  import { createApi, unwrap, ApiError, type Schemas } from '$lib/api/client';
  import { checkoutFor } from '$lib/checkout.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { formatXof, formatWhen } from '$lib/format';
  import { categoryLabel, orderedPosters } from '$lib/event';
  import { safeCheckoutUrl, rememberOrder } from '$lib/payment';

  let { data } = $props();
  const slug = $derived(data.event.slug);
  const co = $derived(checkoutFor(slug));
  const siteKey = env.PUBLIC_TURNSTILE_SITE_KEY ?? '';
  const ev = $derived(data.event);
  const when = $derived(formatWhen(ev.startsAt, ev.endsAt));
  const cover = $derived(orderedPosters(ev)[0]);
  const initials = (f: string, l: string) => ((f.trim()[0] ?? '') + (l.trim()[0] ?? '')).toUpperCase();
  const nLabel = $derived(co.count + (co.count > 1 ? ' billets' : ' billet'));

  let ready = $state(false);
  let accepted = $state(false);
  let loading = $state(false);
  let problem = $state<{ message: string; action?: { label: string; href: string } } | null>(null);
  let token: string | null = null;
  let tokenError = false;
  let errorCode = '';
  /** Cloudflare demande une action à l'acheteur : le widget est alors montré et amené à l'écran. */
  let interactive = $state(false);
  let widgetMode = $state<'interaction-only' | 'always'>('interaction-only');
  let waiting = $state(false);
  let capEl: HTMLDivElement | undefined = $state();
  let ts: { reset: () => void } | undefined = $state();

  onMount(() => {
    if (!co.count || Object.keys(co.validate()).length) {
      return void goto(`/evenements/${slug}/${co.count ? 'coordonnees' : 'billets'}`, { replaceState: true });
    }
    ready = true;
    // Retour depuis la page de paiement (cache de navigation) : on rend la main à l'acheteur.
    const back = (e: PageTransitionEvent) => { if (e.persisted) { loading = false; ts?.reset(); } };
    addEventListener('pageshow', back);
    return () => removeEventListener('pageshow', back);
  });

  /** Attend le jeton Turnstile : invisible la plupart du temps ; sur réseau lent ou si Cloudflare demande une action, on laisse le temps et on montre le widget. */
  async function captcha(): Promise<string | undefined> {
    if (!siteKey) return undefined;
    const start = Date.now();
    waiting = true;
    try {
      for (;;) {
        if (token) return token;
        if (tokenError) {
          widgetMode = 'always'; interactive = true;
          throw new ApiError(400, 'CAPTCHA_FAILED', `La vérification anti-robot n’a pas pu aboutir${errorCode ? ` (code ${errorCode})` : ''}. Vérifiez votre connexion, puis réessayez.`);
        }
        const limit = interactive ? 180_000 : 40_000; // plus long quand l'acheteur doit agir
        if (Date.now() - start > limit) {
          widgetMode = 'always'; interactive = true; tokenError = false;
          throw new ApiError(400, 'CAPTCHA_FAILED', 'La vérification de sécurité est lente. Terminez-la dans le cadre ci-dessous, puis appuyez de nouveau sur Payer.');
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally { waiting = false; }
  }

  function showWidget() {
    interactive = true;
    queueMicrotask(() => capEl?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }

  async function pay(ev: SubmitEvent) {
    ev.preventDefault();
    if (loading) return;
    problem = null;
    if (!accepted) return; // le bouton est désactivé tant que la case n'est pas cochée
    loading = true;
    try {
      const body: Schemas['PublicOrderCreate'] = { ...co.payload(), captchaToken: await captcha() };
      const api = createApi(env.PUBLIC_API_URL ?? '');
      const key = co.keyFor(co.payload()); // sans le jeton captcha : il change à chaque essai
      const res = await unwrap<Schemas['PublicOrderCreated']>(
        api.POST('/public/events/{slug}/orders', { params: { path: { slug }, header: { 'Idempotency-Key': key } }, body })
      );
      const url = safeCheckoutUrl(res.checkoutUrl);
      if (!url) {
        throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'La page de paiement n’a pas pu être ouverte. Réessayez dans un instant.');
      }
      // Aucun billet n'existe encore : la page de retour interrogera l'API. On quitte le site vers FedaPay.
      rememberOrder(res.reference, { slug, email: co.buyer.email.trim() });
      location.assign(url);
    } catch (e) {
      loading = false;
      token = null; ts?.reset(); tokenError = false; // un jeton Turnstile ne sert qu'une fois
      fail(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', 'Une erreur est survenue. Réessayez dans un instant.'));
    }
  }

  function fail(e: ApiError) {
    const back = { label: 'Modifier mes billets', href: `/evenements/${slug}/billets` };
    if (e.code === 'VALIDATION_ERROR') {
      const mine = Object.keys(e.fields).filter((k) => k.startsWith('buyer.') || k.startsWith('tickets.'));
      if (mine.length) {
        co.errors = { ...e.fields };
        return void goto(`/evenements/${slug}/coordonnees`);
      }
    }
    switch (e.code) {
      case 'QUOTA_EXCEEDED': case 'MAX_PER_ORDER_EXCEEDED':
        problem = { message: e.message, action: back }; break;
      case 'SALES_CLOSED': case 'NOT_FOUND': case 'EVENT_NOT_PUBLISHED':
        problem = { message: e.message, action: { label: 'Retour à l’événement', href: `/evenements/${slug}` } }; break;
      case 'RATE_LIMITED':
        problem = { message: e.retryAfter ? `Trop de tentatives. Réessayez dans ${e.retryAfter} secondes.` : e.message }; break;
      case 'PAYMENT_PROVIDER_ERROR':
        problem = { message: 'Le service de paiement est momentanément indisponible. Aucune place n’a été retenue : réessayez dans un instant.' }; break;
      default:
        problem = { message: e.message };
    }
  }
</script>

<svelte:head><title>Récapitulatif · {data.event.title}</title></svelte:head>

{#if ready}
  <StepTop back={`/evenements/${slug}/coordonnees`} step={3} />

  <div class="wrap">
    <div class="main">
      <div>
        <h1>Vérifiez votre commande</h1>
        <p class="lead">Dernière étape : vous paierez ensuite sur la page sécurisée FedaPay.</p>
      </div>

      {#if problem}
        <div class="ban" role="alert">
          {problem.message}
          {#if problem.action}<br /><a href={problem.action.href}>{problem.action.label}</a>{/if}
        </div>
      {/if}

      <section class="card evc" aria-label="Événement">
        {#if cover}
          <img class="poster" src={cover.url} alt="" width="92" height="116" />
        {:else}
          <div class="poster ph" aria-hidden="true"><Icon name="cal" /></div>
        {/if}
        <div>
          <span class="pill">{categoryLabel[ev.category]}</span>
          <h2>{ev.title}</h2>
          {#if when}<div class="meta"><Icon name="cal" />{when.title}{when.sub ? ` · ${when.sub}` : ''}</div>{/if}
          {#if ev.venueName || ev.city}<div class="meta"><Icon name="pin" />{[ev.venueName, ev.city].filter(Boolean).join(', ')}</div>{/if}
        </div>
      </section>

      <section class="card ordm" aria-label="Commande">
        <div class="ch"><h3>Votre commande</h3></div>
        {#each co.lines as l}<div class="sum"><div><b>{l.cat.name}</b><small>{l.n} × {formatXof(l.cat.priceXof)}</small></div><b>{formatXof(l.cat.priceXof * l.n)}</b></div>{/each}
        <div class="sum t"><span>Total</span><b>{formatXof(co.total)}</b></div>
      </section>

      <section class="card" aria-label="Acheteur">
        <div class="ch"><h3>Acheteur</h3><a class="edit" href={`/evenements/${slug}/coordonnees`}>Modifier</a></div>
        <dl class="kv">
          <dt>Nom</dt><dd>{co.buyer.firstName.trim()} {co.buyer.lastName.trim()}</dd>
          <dt>Téléphone</dt><dd>{co.buyer.phone.trim()}</dd>
          <dt>E-mail</dt><dd>{co.buyer.email.trim()}</dd>
        </dl>
        <p class="hint"><Icon name="mail" />Vos billets seront envoyés à cette adresse e-mail.</p>
      </section>

      <section class="card" aria-label="Participants">
        <div class="ch"><h3>Participants · {co.tickets.length}</h3><a class="edit" href={`/evenements/${slug}/coordonnees`}>Modifier</a></div>
        <ul class="pl">
          {#each co.tickets as c, i}
            <li class="pr">
              <span class="av" aria-hidden="true">{initials(co.holders[i]?.firstName ?? '', co.holders[i]?.lastName ?? '')}</span>
              <span class="pn">{co.holders[i]?.firstName.trim()} {co.holders[i]?.lastName.trim()}</span>
              <span class="pill">{c.name}</span>
            </li>
          {/each}
        </ul>
      </section>

      <form id="f2" onsubmit={pay} novalidate>
        <label class="chk">
          <input type="checkbox" bind:checked={accepted} />
          <span class="box" aria-hidden="true"><Icon name="chk" /></span>
          <span class="t">J’accepte les <a href={`/evenements/${slug}#faq`} target="_blank" rel="noopener">conditions d’utilisation du billet</a>.</span>
        </label>
      </form>

      {#if siteKey}
        <div class="cap" class:show={interactive} bind:this={capEl}>
          {#if interactive}<p class="caph"><Icon name="lock" />Une vérification rapide est nécessaire : cochez la case ci-dessous, puis appuyez sur Payer.</p>{/if}
          {#key widgetMode}
            <Turnstile bind:this={ts} {siteKey} appearance={widgetMode}
              ontoken={(t) => { token = t; if (t) { tokenError = false; errorCode = ''; } }}
              onerror={(c) => { tokenError = true; errorCode = c ?? ''; }}
              oninteractive={showWidget} onafter={() => { if (token) interactive = false; }} />
          {/key}
        </div>
      {/if}
    </div>

    <aside class="card side" aria-label="Votre commande">
      <h3>Votre commande</h3>
      {#each co.lines as l}<div class="sum"><div><b>{l.cat.name}</b><small>{l.n} × {formatXof(l.cat.priceXof)}</small></div><b>{formatXof(l.cat.priceXof * l.n)}</b></div>{/each}
      <div class="sum t"><span>Total</span><b>{formatXof(co.total)}</b></div>
      <Button type="submit" form="f2" block disabled={loading || !accepted} aria-busy={loading}>
        {#if loading}{waiting ? 'Vérification…' : 'Redirection…'}{:else}<Icon name="lock" />Payer {formatXof(co.total)}{/if}
      </Button>
      {#if !accepted}<p class="need">Acceptez les conditions pour continuer.</p>{/if}
      <ul class="notes">
        <li><Icon name="card" />Mobile Money (MTN, Moov) ou carte bancaire, sur la page FedaPay.</li>
        <li><Icon name="clock" />Vos places sont retenues quelques minutes pour finaliser le paiement.</li>
      </ul>
    </aside>
  </div>

  <div class="mbar">
    <BottomBar>
      <div><small>Total</small><strong>{formatXof(co.total)}</strong></div>
      <Button type="submit" form="f2" disabled={loading || !accepted} aria-busy={loading}>{loading ? (waiting ? 'Vérification…' : 'Redirection…') : 'Payer'}</Button>
    </BottomBar>
    {#if !accepted}<p class="need nb">Acceptez les conditions pour continuer.</p>{/if}
  </div>
{/if}

<style>
  h1 { margin: 4px 0 0; }
  .lead { margin: 6px 0 0; color: var(--mut); }
  .wrap { display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start; }
  .main { flex: 1 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .card { margin: 0; border: 1px solid var(--line); border-radius: 16px; padding: 18px; }
  .side { flex: 0 0 360px; position: sticky; top: 24px; padding: 24px; display: none; }
  .side h3 { margin: 0 0 14px; font-size: 18px; }
  .ordm { display: block; }
  .mbar { display: block; }
  @media (min-width: 900px) {
    .side { display: block; }
    .ordm, .mbar { display: none; }
    .card { padding: 22px 24px; border-radius: 18px; }
  }
  .evc { display: flex; gap: 14px; align-items: center; background: var(--soft); border-color: transparent; }
  .poster { width: 64px; height: 80px; border-radius: 10px; flex: none; object-fit: cover; }
  .poster.ph { background: linear-gradient(150deg, #3a2f9c, #1553b8); display: grid; place-items: center; color: #fff; }
  .evc h2 { margin: 6px 0 2px; font-size: 17px; line-height: 1.25; }
  .meta { display: flex; gap: 8px; align-items: flex-start; color: var(--mut); font-size: 13.5px; line-height: 1.4; }
  .meta :global(.i) { width: 16px; height: 16px; margin-top: 2px; }
  @media (min-width: 900px) { .poster { width: 92px; height: 116px; } .evc h2 { font-size: 21px; } .meta { font-size: 15px; } }
  .pill { display: inline-flex; border: 1px solid var(--line); border-radius: 99px; padding: 1px 10px; font-size: 12.5px; font-weight: 700; color: var(--mut); background: var(--bg); }
  .ch { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; }
  .ch h3 { margin: 0; font-size: 16px; }
  .edit { color: var(--acc); font-weight: 700; font-size: 14px; text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; margin: -10px -4px; padding: 0 4px; }
  .edit:hover { text-decoration: underline; }
  .kv { display: grid; grid-template-columns: 92px 1fr; gap: 6px 12px; margin: 0; font-size: 14.5px; }
  .kv dt { color: var(--mut); }
  .kv dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  .hint { margin: 12px 0 0; display: flex; gap: 8px; align-items: flex-start; color: var(--mut); font-size: 13.5px; }
  .hint :global(.i) { width: 16px; height: 16px; margin-top: 2px; }
  .pl { list-style: none; margin: 0; padding: 0; }
  .pr { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
  .pr:first-child { border-top: 0; padding-top: 0; }
  .pr:last-child { padding-bottom: 0; }
  .av { width: 36px; height: 36px; border-radius: 50%; background: var(--soft); display: grid; place-items: center; font-weight: 800; font-size: 13px; color: var(--acc); flex: none; }
  .pn { flex: 1; font-weight: 700; font-size: 14.5px; overflow-wrap: anywhere; }
  .sum { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; }
  .sum small { display: block; color: var(--mut); font-size: 13.5px; }
  .sum b { white-space: nowrap; }
  .sum.t { display: flex; align-items: baseline; border-top: 1px dashed var(--line); margin: 10px 0 16px; padding-top: 14px; }
  .sum.t span { font-weight: 700; }
  .sum.t b { font-size: 26px; letter-spacing: -0.02em; }
  .ordm .sum.t { margin-bottom: 0; }
  .ordm .sum.t b { font-size: 22px; }
  .chk { position: relative; display: flex; gap: 12px; align-items: flex-start; padding: 2px; cursor: pointer; font-size: 14.5px; }
  .chk input { position: absolute; opacity: 0; width: 26px; height: 26px; margin: 0; cursor: pointer; }
  .box { width: 26px; height: 26px; border-radius: 8px; border: 2px solid var(--mut); flex: none; margin-top: 1px; display: grid; place-items: center; color: transparent; background: var(--bg); }
  .box :global(.i) { width: 16px; height: 16px; stroke-width: 3; }
  .chk input:checked + .box { background: var(--acc); border-color: var(--acc); color: var(--bg); }
  .chk input:focus-visible + .box { outline: 3px solid var(--acc); outline-offset: 2px; }
  .chk .t { font-weight: 600; }
  .chk a { color: var(--acc); }
  .cap { margin: 0; scroll-margin-bottom: 140px; }
  .cap.show { border: 1px solid var(--line); border-radius: 16px; padding: 16px; background: var(--soft); }
  .caph { margin: 0 0 12px; display: flex; gap: 8px; align-items: flex-start; font-size: 14px; color: var(--ink); font-weight: 600; }
  .caph :global(svg) { width: 18px; height: 18px; color: var(--acc); flex: none; margin-top: 1px; }
  .need { margin: 10px 0 0; text-align: center; color: var(--mut); font-size: 13px; }
  .nb { position: fixed; inset: auto 0 calc(78px + env(safe-area-inset-bottom, 0px)) 0; margin: 0; z-index: 9; background: var(--bg); padding: 6px 0 0; }
  .notes { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 10px; color: var(--mut); font-size: 14px; }
  .notes li { display: flex; gap: 10px; align-items: flex-start; }
  .notes :global(.i) { width: 18px; height: 18px; margin-top: 1px; color: var(--ok); }
  .ban { border: 1.5px solid var(--err); color: var(--err); border-radius: 10px; padding: 12px 14px; font-weight: 700; }
  .ban a { color: inherit; }
</style>
