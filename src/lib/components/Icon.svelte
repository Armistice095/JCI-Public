<script lang="ts">
  const P: Record<string, string> = {
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chk: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    dl: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>'
  };
  let { name }: { name: keyof typeof P } = $props();
</script>

<!-- Icônes statiques (aucune donnée de l'API dans le SVG) -->
<svg class="i" viewBox="0 0 24 24" aria-hidden="true">{@html P[name]}</svg>

<style>
  .i { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
</style>
