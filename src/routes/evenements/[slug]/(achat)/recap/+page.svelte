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
  import { formatXof } from '$lib/format';
  import { safeCheckoutUrl, rememberOrder } from '$lib/payment';

  let { data } = $props();
  const slug = $derived(data.event.slug);
  const co = $derived(checkoutFor(slug));
  const siteKey = env.PUBLIC_TURNSTILE_SITE_KEY ?? '';

  let ready = $state(false);
  let accepted = $state(false);
  let acceptedErr = $state('');
  let loading = $state(false);
  let problem = $state<{ message: string; action?: { label: string; href: string } } | null>(null);
  let token: string | null = null;
  let tokenError = false;
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

  /** Attend le jeton Turnstile (invisible la plupart du temps). Sans clé configurée : pas de captcha (développement). */
  async function captcha(): Promise<string | undefined> {
    if (!siteKey) return undefined;
    for (let i = 0; i < 75; i++) {
      if (token) return token;
      if (tokenError) throw new ApiError(400, 'CAPTCHA_FAILED', 'La vérification anti-robot n’a pas pu se charger. Rechargez la page et réessayez.');
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new ApiError(400, 'CAPTCHA_FAILED', 'La vérification anti-robot prend trop de temps. Réessayez.');
  }

  async function pay(ev: SubmitEvent) {
    ev.preventDefault();
    if (loading) return;
    problem = null;
    if (!accepted) { acceptedErr = 'Vous devez accepter les conditions pour continuer.'; return; }
    acceptedErr = '';
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
      token = null; ts?.reset(); // un jeton Turnstile ne sert qu'une fois
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
  <h1>Récapitulatif</h1>

  {#if problem}
    <div class="ban" role="alert">
      {problem.message}
      {#if problem.action}<br /><a href={problem.action.href}>{problem.action.label}</a>{/if}
    </div>
  {/if}

  <div class="card">
    {#each co.lines as l}<div class="sum"><span>{l.n} × {l.cat.name}</span><span>{formatXof(l.cat.priceXof * l.n)}</span></div>{/each}
    <div class="sum t"><span>Total</span><span>{formatXof(co.total)}</span></div>
  </div>
  <div class="card">
    <h3>Acheteur</h3>
    <p style="margin: 0; color: var(--ink)">{co.buyer.firstName.trim()} {co.buyer.lastName.trim()}<br />{co.buyer.phone.trim()}<br />{co.buyer.email.trim()}</p>
  </div>
  <div class="card">
    <h3>Participants</h3>
    {#each co.tickets as c, i}
      <div class="sum"><span>{co.holders[i]?.firstName.trim()} {co.holders[i]?.lastName.trim()}</span><span>{c.name}</span></div>
    {/each}
  </div>

  <form id="f2" onsubmit={pay} novalidate>
    <label class="chk"><input type="checkbox" bind:checked={accepted} aria-invalid={acceptedErr ? 'true' : undefined} /> J’accepte les conditions d’utilisation du billet.</label>
    {#if acceptedErr}<p class="err" role="alert">{acceptedErr}</p>{/if}
  </form>

  {#if siteKey}
    <Turnstile bind:this={ts} {siteKey} ontoken={(t) => { token = t; if (t) tokenError = false; }} onerror={() => (tokenError = true)} />
  {/if}
  <p class="note" style="margin-top: 16px">Vous serez redirigé vers FedaPay pour payer par Mobile Money ou par carte.</p>

  <BottomBar>
    <div><small>Total</small><strong>{formatXof(co.total)}</strong></div>
    <Button type="submit" form="f2" disabled={loading} aria-busy={loading}>{loading ? 'Redirection…' : `Payer ${formatXof(co.total)}`}</Button>
  </BottomBar>
{/if}

<style>
  .card { border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin: 0 0 16px; }
  .card h3 { margin: 0 0 14px; font-size: 15px; }
  .sum { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; }
  .sum.t { border-top: 1px solid var(--line); font-weight: 800; font-size: 18px; margin-top: 8px; padding-top: 14px; }
  .chk { display: flex; gap: 10px; align-items: flex-start; font-weight: 500; font-size: 15px; }
  .chk input { width: 22px; height: 22px; margin: 0; accent-color: var(--ink); flex: none; }
  .note { background: var(--soft); border-radius: 10px; padding: 12px 14px; font-size: 14px; color: var(--mut); }
  .ban { border: 1.5px solid var(--err); color: var(--err); border-radius: 10px; padding: 12px 14px; font-weight: 700; margin: 0 0 18px; }
  .ban a { color: inherit; }
  .err { color: var(--err); font-size: 13px; font-weight: 600; margin: 6px 0 0; }
</style>
