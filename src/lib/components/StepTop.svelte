<script lang="ts">
  import Icon from './Icon.svelte';
  let { back, step }: { back: string; step?: 1 | 2 | 3 } = $props();
</script>

<a class="bk" href={back}><Icon name="back" /> Retour</a>
{#if step}
  <div class="prog" role="img" aria-label="Étape {step} sur 3">
    {#each [1, 2, 3] as k}<i class:on={k <= step}></i>{/each}
  </div>
{/if}

<style>
  .bk { display: inline-flex; gap: 6px; align-items: center; min-height: 44px; color: var(--mut); font-weight: 600; text-decoration: none; }
  .prog { display: flex; gap: 6px; margin: 4px 0 6px; }
  .prog i { flex: 1; height: 4px; border-radius: 2px; background: var(--line); }
  .prog i.on { background: var(--ink); }
</style>
