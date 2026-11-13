<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import StepTop from '$lib/components/StepTop.svelte';
  import BottomBar from '$lib/components/BottomBar.svelte';
  import Button from '$lib/components/Button.svelte';
  import Field from '$lib/components/Field.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { checkoutFor } from '$lib/checkout.svelte';
  import { formatXof, formatWhen } from '$lib/format';
  import { orderedPosters } from '$lib/event';

  let { data } = $props();
  const slug = $derived(data.event.slug);
  const co = $derived(checkoutFor(slug));
  const ev = $derived(data.event);
  const when = $derived(formatWhen(ev.startsAt, ev.endsAt));
  const cover = $derived(orderedPosters(ev)[0]);
  let ready = $state(false);

  onMount(() => {
    if (!co.count) return void goto(`/evenements/${slug}/billets`, { replaceState: true });
    co.syncHolders();
    if (co.meIdx >= co.count) co.meIdx = -1;
    ready = true;
  });

  // « Ce billet est pour moi » : le bénéficiaire désigné suit l'acheteur tant que l'interrupteur est activé.
  $effect(() => {
    const h = ready ? co.holders[co.meIdx] : undefined;
    if (h) { h.firstName = co.buyer.firstName; h.lastName = co.buyer.lastName; }
  });

  function toggleMe(i: number) {
    if (co.meIdx === i) { co.meIdx = -1; co.holders[i].firstName = ''; co.holders[i].lastName = ''; }
    else {
      const prev = co.holders[co.meIdx];
      if (prev) { prev.firstName = ''; prev.lastName = ''; }
      co.meIdx = i;
    }
    delete co.errors[`tickets.${i}.firstName`]; delete co.errors[`tickets.${i}.lastName`];
    co.save();
  }

  const clearErr = (k: string) => { if (co.errors[k]) delete co.errors[k]; };
  const typed = (i: number, k: string) => { clearErr(k); if (co.meIdx === i) co.meIdx = -1; };

  async function submit(ev: SubmitEvent) {
    ev.preventDefault();
    co.errors = { ...co.validate() };
    const first = Object.keys(co.errors)[0];
    if (first) {
      await tick();
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    co.save();
    goto(`/evenements/${slug}/recap`);
  }
</script>

<svelte:head><title>Vos coordonnées · {data.event.title}</title></svelte:head>

{#if ready}
  <StepTop back={`/evenements/${slug}/billets`} step={2} />

  <div class="wrap">
    <div class="main">
      <div>
        <h1>Vos coordonnées</h1>
        <p class="lead">Qui achète, et qui viendra à l’événement ?</p>
      </div>

      <form id="f" onsubmit={submit} novalidate oninput={() => co.save()}>
        <section class="card" aria-label="Acheteur">
          <h3>Acheteur</h3>
          <div class="two">
            <Field id="bp" label="Prénom" autocomplete="given-name" bind:value={co.buyer.firstName} error={co.errors['buyer.firstName']} oninput={() => clearErr('buyer.firstName')} />
            <Field id="bn" label="Nom" autocomplete="family-name" bind:value={co.buyer.lastName} error={co.errors['buyer.lastName']} oninput={() => clearErr('buyer.lastName')} />
          </div>
          <Field id="bt" type="tel" inputmode="tel" label="Téléphone" autocomplete="tel" bind:value={co.buyer.phone} error={co.errors['buyer.phone']} oninput={() => clearErr('buyer.phone')} />
          <Field id="bm" type="email" inputmode="email" label="E-mail" autocomplete="email" bind:value={co.buyer.email} error={co.errors['buyer.email']} oninput={() => clearErr('buyer.email')} />
          <p class="hint"><Icon name="mail" />Vos billets seront envoyés à cette adresse e-mail.</p>
        </section>

        {#each co.tickets as c, i}
          {#if co.holders[i]}
            {@const me = co.meIdx === i}
            <section class="card" aria-label={`Billet ${i + 1}`}>
              <div class="ch"><span class="num">{i + 1}</span><h3>Billet {i + 1}</h3><span class="pill">{c.name}</span></div>
              <button type="button" class="sw" role="switch" aria-checked={me} onclick={() => toggleMe(i)}>
                <span class="tg" class:on={me}><i></i></span>Ce billet est pour moi
              </button>
              {#if me}
                <div class="me"><Icon name="chk" /><span>{co.buyer.firstName} {co.buyer.lastName} <small>· vous</small></span></div>
              {:else}
                <div class="two">
                  <Field id="pp{i}" label="Prénom du participant" autocomplete="off" bind:value={co.holders[i].firstName} error={co.errors[`tickets.${i}.firstName`]} oninput={() => typed(i, `tickets.${i}.firstName`)} />
                  <Field id="pn{i}" label="Nom du participant" autocomplete="off" bind:value={co.holders[i].lastName} error={co.errors[`tickets.${i}.lastName`]} oninput={() => typed(i, `tickets.${i}.lastName`)} />
                </div>
              {/if}
            </section>
          {/if}
        {/each}
      </form>
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
      <div class="sum t"><span>Total</span><b>{formatXof(co.total)}</b></div>
      <Button type="submit" form="f" block>Continuer<Icon name="arrow" /></Button>
    </aside>
  </div>

  <div class="mbar">
    <BottomBar>
      <div><small>{co.count} billet{co.count > 1 ? 's' : ''}</small><strong>{formatXof(co.total)}</strong></div>
      <Button type="submit" form="f">Continuer<Icon name="arrow" /></Button>
    </BottomBar>
  </div>
{/if}

<style>
  h1 { margin: 4px 0 0; }
  .lead { margin: 6px 0 0; color: var(--mut); }
  .wrap { display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start; }
  .main { flex: 1 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  form { display: flex; flex-direction: column; gap: 16px; }
  .card { margin: 0; border: 1px solid var(--line); border-radius: 16px; padding: 18px; }
  .card h3 { margin: 0 0 14px; font-size: 16px; }
  .side { flex: 0 0 360px; position: sticky; top: 24px; padding: 24px; display: none; }
  .side h3 { margin: 0 0 14px; font-size: 18px; }
  .mbar { display: block; }
  @media (min-width: 900px) {
    .side { display: block; }
    .mbar { display: none; }
    .card { padding: 22px 24px; border-radius: 18px; }
  }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 420px) { .two { grid-template-columns: 1fr; gap: 0; } }
  .hint { margin: 0; display: flex; gap: 8px; align-items: flex-start; color: var(--mut); font-size: 13.5px; }
  .hint :global(.i) { width: 16px; height: 16px; margin-top: 2px; flex: none; }
  .ch { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; }
  .ch h3 { margin: 0; flex: 1; }
  .num { width: 28px; height: 28px; border-radius: 50%; background: var(--soft); color: var(--acc); display: grid; place-items: center; font-weight: 800; font-size: 13px; flex: none; }
  .pill { display: inline-flex; border: 1px solid var(--line); border-radius: 99px; padding: 1px 10px; font-size: 12.5px; font-weight: 700; color: var(--mut); }
  .sw { display: flex; align-items: center; gap: 12px; font: 700 15px var(--font); color: var(--ink); background: none; border: 0; padding: 0; min-height: 44px; margin: 0 0 8px; cursor: pointer; text-align: left; }
  .tg { width: 46px; height: 28px; border-radius: 99px; background: var(--line); position: relative; flex: none; transition: background .15s; }
  .tg i { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: var(--mut); transition: left .15s, background .15s; }
  .tg.on { background: var(--ink); }
  .tg.on i { left: 21px; background: var(--bg); }
  .sw:focus-visible { outline: 3px solid var(--acc); outline-offset: 3px; border-radius: 8px; }
  .me { display: flex; align-items: center; gap: 10px; background: var(--soft); border-radius: 12px; padding: 12px; font-weight: 700; font-size: 14.5px; }
  .me :global(.i) { color: var(--ok); width: 18px; height: 18px; flex: none; }
  .me small { color: var(--mut); font-weight: 600; font-size: inherit; }
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
</style>
