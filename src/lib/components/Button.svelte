<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  interface Props extends HTMLButtonAttributes {
    outline?: boolean; block?: boolean; loading?: boolean; href?: string; target?: string; children: Snippet;
  }
  let { outline = false, block = false, loading = false, href, target, children, ...rest }: Props = $props();
</script>

{#if href}
  <a class="btn" class:o={outline} class:w={block} {href} {target} rel={target === '_blank' ? 'noopener noreferrer' : undefined}>{@render children()}</a>
{:else}
  <button class="btn" class:o={outline} class:w={block} class:ld={loading} aria-busy={loading || undefined} {...rest}>{#if loading}<span class="sp" aria-hidden="true"></span>{/if}{@render children()}</button>
{/if}

<style>
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 24px;
    border-radius: 12px; border: 1.5px solid var(--ink); background: var(--ink); color: var(--bg);
    font: 700 16px var(--font); text-decoration: none; cursor: pointer;
  }
  .btn.o { background: none; color: var(--ink); }
  .btn.w { width: 100%; }
  .btn:disabled { background: var(--soft); border-color: var(--line); color: var(--mut); cursor: not-allowed; }
  .btn.ld:disabled { background: var(--ink); border-color: var(--ink); color: var(--bg); cursor: progress; }
  .btn.o.ld:disabled { background: none; color: var(--ink); }
  .sp { width: 18px; height: 18px; border: 2.5px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: sp .75s linear infinite; flex: none; }
  @keyframes sp { to { transform: rotate(1turn); } }
  @media (prefers-reduced-motion: reduce) { .sp { animation-duration: 2s; } }
</style>
