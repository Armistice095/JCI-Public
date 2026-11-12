<script lang="ts">
  import '@fontsource/plus-jakarta-sans/latin-500.css';
  import '@fontsource/plus-jakarta-sans/latin-600.css';
  import '@fontsource/plus-jakarta-sans/latin-700.css';
  import '@fontsource/plus-jakarta-sans/latin-800.css';
  import '@fontsource/plus-jakarta-sans/latin-ext-500.css';
  import '@fontsource/plus-jakarta-sans/latin-ext-600.css';
  import '@fontsource/plus-jakarta-sans/latin-ext-700.css';
  import '@fontsource/plus-jakarta-sans/latin-ext-800.css';
  import '../app.css';
  import Toast from '$lib/components/Toast.svelte';
  let { children } = $props();
</script>

<div class="app">{@render children()}</div>
<Toast />

<style>
  .app { max-width: 1000px; margin: auto; padding: 0 20px; }
</style>
