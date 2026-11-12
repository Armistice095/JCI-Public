<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<div class="bar"><div>{@render children()}</div></div>

<style>
  .bar {
    position: fixed; inset: auto 0 0 0; background: var(--bg); border-top: 1px solid var(--line);
    padding: 12px 20px calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 10;
  }
  .bar > div { max-width: 960px; margin: auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .bar :global(small) { display: block; color: var(--mut); font-size: 13px; line-height: 1.3; }
  .bar :global(strong) { font-size: 18px; }
</style>
