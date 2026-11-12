<script lang="ts">
  import { toast } from '$lib/toast.svelte';
</script>

<div class="toast" class:on={!!toast.message} role="status">{toast.message}</div>

<style>
  .toast {
    position: fixed; left: 50%; bottom: 104px; transform: translateX(-50%);
    background: var(--ink); color: var(--bg); padding: 12px 18px; border-radius: 10px;
    font-weight: 600; font-size: 14px; opacity: 0; pointer-events: none; transition: opacity 0.2s;
    max-width: 90%; text-align: center; z-index: 50;
  }
  .toast.on { opacity: 1; }
</style>
