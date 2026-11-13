<script lang="ts">
  import Icon from './Icon.svelte';
  let { back, step }: { back: string; step?: 1 | 2 | 3 } = $props();
  const labels = ['Billets', 'Coordonnées', 'Récapitulatif'];
</script>

<a class="bk" href={back}><Icon name="back" /> Retour</a>
{#if step}
  <!-- Mobile : « Étape N sur 3 » + barre ; ordinateur : étapes nommées avec coches -->
  <div class="mob" role="group" aria-label="Étape {step} sur 3">
    <div class="row"><span>Étape {step} sur 3</span><b>{labels[step - 1]}</b></div>
    <div class="prog" aria-hidden="true">{#each [1, 2, 3] as k}<i class:on={k <= step}></i>{/each}</div>
  </div>
  <ol class="steps" aria-label="Progression de la commande">
    {#each labels as l, i}
      {@const k = i + 1}
      {#if i > 0}<li class="ln" class:on={k <= step} aria-hidden="true"></li>{/if}
      <li class="st" class:done={k < step} class:now={k === step} aria-current={k === step ? 'step' : undefined}>
        <span class="dot">{#if k < step}<Icon name="chk" />{:else}{k}{/if}</span>{l}
      </li>
    {/each}
  </ol>
{/if}

<style>
  .bk { display: inline-flex; gap: 6px; align-items: center; min-height: 44px; color: var(--mut); font-weight: 700; text-decoration: none; }
  .mob { display: flex; flex-direction: column; gap: 8px; margin: 2px 0 6px; }
  .row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: var(--mut); }
  .row b { color: var(--ink); }
  .prog { display: flex; gap: 6px; }
  .prog i { flex: 1; height: 5px; border-radius: 5px; background: var(--line); }
  .prog i.on { background: var(--ink); }
  .steps { display: none; align-items: center; list-style: none; margin: 4px 0 6px; padding: 0; }
  .st { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 14px; color: var(--mut); white-space: nowrap; }
  .dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 800; border: 2px solid var(--line); flex: none; }
  .dot :global(.i) { width: 15px; height: 15px; stroke-width: 2.6; }
  .st.done .dot { background: var(--ok); border-color: var(--ok); color: var(--bg); }
  .st.now { color: var(--ink); }
  .st.now .dot { background: var(--acc); border-color: var(--acc); color: var(--bg); }
  .ln { flex: 1 1 24px; height: 2px; background: var(--line); margin: 0 12px; min-width: 16px; border-radius: 2px; }
  .ln.on { background: var(--ok); }
  @media (min-width: 760px) { .mob { display: none; } .steps { display: flex; } }
</style>
