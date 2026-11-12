<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import StepTop from '$lib/components/StepTop.svelte';
  import BottomBar from '$lib/components/BottomBar.svelte';
  import Button from '$lib/components/Button.svelte';
  import Field from '$lib/components/Field.svelte';
  import { checkoutFor } from '$lib/checkout.svelte';
  import { formatXof } from '$lib/format';

  let { data } = $props();
  const slug = $derived(data.event.slug);
  const co = $derived(checkoutFor(slug));
  let ready = $state(false);

  onMount(() => {
    if (!co.count) return void goto(`/evenements/${slug}/billets`, { replaceState: true });
    co.syncHolders();
    ready = true;
  });

  // « Ce billet est pour moi » : le premier bénéficiaire suit l'acheteur tant que la case est cochée.
  $effect(() => {
    if (ready && co.forMe && co.holders[0]) {
      co.holders[0].firstName = co.buyer.firstName;
      co.holders[0].lastName = co.buyer.lastName;
    }
  });

  const clearErr = (k: string) => { if (co.errors[k]) delete co.errors[k]; };

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
  <h1>Vos coordonnées</h1>

  <form id="f" onsubmit={submit} novalidate oninput={() => co.save()}>
    <div class="card">
      <h3>Acheteur</h3>
      <div class="two">
        <Field id="bp" label="Prénom" autocomplete="given-name" bind:value={co.buyer.firstName} error={co.errors['buyer.firstName']} oninput={() => clearErr('buyer.firstName')} />
        <Field id="bn" label="Nom" autocomplete="family-name" bind:value={co.buyer.lastName} error={co.errors['buyer.lastName']} oninput={() => clearErr('buyer.lastName')} />
      </div>
      <Field id="bt" type="tel" label="Téléphone" autocomplete="tel" bind:value={co.buyer.phone} error={co.errors['buyer.phone']} oninput={() => clearErr('buyer.phone')} />
      <Field id="bm" type="email" label="E-mail" autocomplete="email" bind:value={co.buyer.email} error={co.errors['buyer.email']} oninput={() => clearErr('buyer.email')} />
      <p style="margin: 0">Vos billets seront envoyés à cette adresse.</p>
    </div>

    {#each co.tickets as c, i}
      {#if co.holders[i]}
        <div class="card">
          <h3>Billet {i + 1}, {c.name}</h3>
          {#if i === 0}
            <label class="chk" style="margin: 0 0 14px"><input type="checkbox" bind:checked={co.forMe} /> Ce billet est pour moi</label>
          {/if}
          <div class="two">
            <Field id="pp{i}" label="Prénom du participant" bind:value={co.holders[i].firstName} error={co.errors[`tickets.${i}.firstName`]}
              oninput={() => { clearErr(`tickets.${i}.firstName`); if (i === 0) co.forMe = false; }} />
            <Field id="pn{i}" label="Nom du participant" bind:value={co.holders[i].lastName} error={co.errors[`tickets.${i}.lastName`]}
              oninput={() => { clearErr(`tickets.${i}.lastName`); if (i === 0) co.forMe = false; }} />
          </div>
        </div>
      {/if}
    {/each}
  </form>

  <BottomBar>
    <div><small>{co.count} billet{co.count > 1 ? 's' : ''}</small><strong>{formatXof(co.total)}</strong></div>
    <Button type="submit" form="f">Continuer</Button>
  </BottomBar>
{/if}

<style>
  .card { border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin: 0 0 16px; }
  .card h3 { margin: 0 0 14px; font-size: 15px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 420px) { .two { grid-template-columns: 1fr; } }
  .chk { display: flex; gap: 10px; align-items: flex-start; font-weight: 500; font-size: 15px; }
  .chk input { width: 22px; height: 22px; margin: 0; accent-color: var(--ink); flex: none; }
</style>
