<script lang="ts">
  import Icon from './Icon.svelte';
  let { homeHref, onshare, secure = false }: { homeHref?: string; onshare?: () => void; secure?: boolean } = $props();
</script>

<header class="hd">
  {#if homeHref}
    <a href={homeHref} aria-label="Retour à la page de l’événement"><picture>
    <!-- Mode sombre : logo blanc sur fond transparent -->
    <source srcset="/logo-dark.png" media="(prefers-color-scheme: dark)" />
    <img class="logo" src="/logo.png" alt="JCI Comé Excellence" width="81" height="36" />
  </picture></a>
  {:else}
    <picture>
    <!-- Mode sombre : logo blanc sur fond transparent -->
    <source srcset="/logo-dark.png" media="(prefers-color-scheme: dark)" />
    <img class="logo" src="/logo.png" alt="JCI Comé Excellence" width="81" height="36" />
  </picture>
  {/if}
  {#if secure}
    <div class="sec"><Icon name="lock" /><span class="lg">Paiement sécurisé par FedaPay</span><span class="sm">Paiement sécurisé</span></div>
  {:else if onshare}
    <button class="ib" onclick={onshare} aria-label="Partager l’événement"><Icon name="share" /></button>
  {/if}
</header>

<style>
  .hd { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; }
  .logo { height: 36px; width: auto; display: block; background: #fff; border-radius: 6px; padding: 2px 6px; }
  @media (prefers-color-scheme: dark) { .logo { background: none; padding: 0; border-radius: 0; } }
  .sec { display: flex; align-items: center; gap: 8px; color: var(--mut); font-size: 14px; font-weight: 600; }
  .sec :global(.i) { width: 18px; height: 18px; color: var(--ok); }
  .sec .sm { display: none; }
  @media (max-width: 560px) { .sec { font-size: 12.5px; } .sec .lg { display: none; } .sec .sm { display: inline; } }
  .ib {
    width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); background: none;
    color: var(--ink); display: grid; place-items: center; cursor: pointer;
  }
</style>
