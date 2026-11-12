<script lang="ts">
  import Icon from './Icon.svelte';
  let { homeHref, onshare }: { homeHref?: string; onshare?: () => void } = $props();
</script>

<header class="hd">
  {#if homeHref}
    <a href={homeHref} aria-label="Retour à la page de l’événement"><img class="logo" src="/logo.png" alt="JCI Comé Excellence" width="81" height="36" /></a>
  {:else}
    <img class="logo" src="/logo.png" alt="JCI Comé Excellence" width="81" height="36" />
  {/if}
  {#if onshare}
    <button class="ib" onclick={onshare} aria-label="Partager l’événement"><Icon name="share" /></button>
  {/if}
</header>

<style>
  .hd { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; }
  .logo { height: 36px; width: auto; display: block; background: #fff; border-radius: 6px; padding: 2px 6px; }
  .ib {
    width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); background: none;
    color: var(--ink); display: grid; place-items: center; cursor: pointer;
  }
</style>
