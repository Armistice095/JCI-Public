<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  interface Props extends HTMLInputAttributes { label: string; error?: string; value: string }
  let { label, error, value = $bindable(), id, ...rest }: Props = $props();
</script>

<div class="fld">
  <label for={id}>{label}</label>
  <input {id} bind:value aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-e` : undefined} {...rest} />
  {#if error}<p class="err" id="{id}-e">{error}</p>{/if}
</div>

<style>
  .fld { margin: 0 0 16px; }
  label { display: block; font-weight: 600; font-size: 14px; margin: 0 0 6px; }
  input {
    width: 100%; min-height: 48px; border: 1.5px solid var(--line); border-radius: 10px; padding: 0 14px;
    font: 500 16px var(--font); background: var(--bg); color: var(--ink);
  }
  input[aria-invalid='true'] { border-color: var(--err); }
  .err { color: var(--err); font-size: 13px; font-weight: 600; margin: 6px 0 0; }
</style>
