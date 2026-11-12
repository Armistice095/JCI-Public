<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  let { posters, title }: { posters: { url: string }[]; title: string } = $props();

  const n = $derived(posters.length);
  let ci = $state(0);
  let paused = $state(false);
  /** Seule la couverture est chargée d'emblée ; la suivante est préchargée, les autres à la demande. */
  let seen = $state<number[]>([0]);
  /** Images paysage : affichées en entier sur fond flou (variante « fit » de la maquette). */
  let fit = $state<Record<number, boolean>>({});
  let touchX = 0;

  onMount(() => {
    paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (n > 1) seen = [0, 1]; // précharge la suivante une fois la couverture affichée
    const onLoad = (e: Event) => e.target instanceof HTMLImageElement && measure(e.target);
    trk.addEventListener('load', onLoad, true);
    // la couverture peut être déjà chargée avant l'hydratation
    trk.querySelectorAll<HTMLImageElement>('img.main').forEach((img) => img.complete && measure(img));
    return () => trk.removeEventListener('load', onLoad, true);
  });

  function go(i: number) {
    ci = (i + n) % n;
    const next = (ci + 1) % n;
    seen = [...new Set([...seen, ci, next])];
  }

  $effect(() => {
    if (paused || n < 2) return;
    const t = setTimeout(() => go(ci + 1), 4500);
    return () => clearTimeout(t);
  });

  /**
   * Détecte les images paysage. Écouteur délégué (capture) plutôt qu'`onload`/`use:` sur l'<img> :
   * Svelte écrit alors un gestionnaire en ligne dans le HTML serveur, que notre CSP bloque.
   */
  let trk: HTMLElement;
  function measure(img: HTMLImageElement) {
    const i = Number(img.dataset.i);
    if (img.naturalHeight && img.naturalWidth / img.naturalHeight > 0.9) fit[i] = true;
  }
  function onkey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') go(ci + 1);
    if (e.key === 'ArrowLeft') go(ci - 1);
  }
  function touchEnd(e: TouchEvent) {
    const d = e.changedTouches[0].clientX - touchX;
    if (Math.abs(d) > 40) go(ci + (d < 0 ? 1 : -1));
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="car"
  class:ps={paused}
  role="region"
  aria-roledescription="carrousel"
  aria-label="Visuels de l’événement"
  tabindex="0"
  onkeydown={onkey}
  ontouchstart={(e) => (touchX = e.touches[0].clientX)}
  ontouchend={touchEnd}
>
  <div class="vp">
    <div class="trk" bind:this={trk} style:transform="translateX(-{ci * 100}%)">
      {#each posters as p, i}
        <div class="sl" role="group" aria-label="Visuel {i + 1} sur {n}" aria-hidden={i !== ci} inert={i !== ci}>
          <div class="ph" class:fit={fit[i]}>
            {#if seen.includes(i)}
              {#if fit[i]}<img class="bg" src={p.url} alt="" />{/if}
              <img class="main" src={p.url} alt={i === 0 ? `Affiche : ${title}` : `${title}, visuel ${i + 1}`} data-i={i} fetchpriority={i === 0 ? 'high' : 'auto'} />
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
  {#if n > 1}
    <div class="cc">
      <div class="dots">
        {#each posters as _, i}
          <button class="d" class:on={i === ci} onclick={() => go(i)} aria-label="Voir le visuel {i + 1}" aria-current={i === ci ? 'true' : undefined}><i><b></b></i></button>
        {/each}
      </div>
      <button class="ib" onclick={() => (paused = !paused)} aria-label="{paused ? 'Reprendre' : 'Mettre en pause'} le défilement">
        <Icon name={paused ? 'play' : 'pause'} />
      </button>
    </div>
  {/if}
</div>

<style>
  .car { border-radius: 16px; }
  .vp { overflow: hidden; border-radius: 16px; }
  .trk { display: flex; transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
  .sl { flex: 0 0 100%; min-width: 0; }
  .ph { position: relative; aspect-ratio: 4 / 5; overflow: hidden; background: #16103f; }
  .main { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .fit .main { height: auto; top: 50%; bottom: auto; transform: translateY(-50%); object-fit: initial; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(14px) brightness(0.85); transform: scale(1.25); }
  .cc { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
  .dots { display: flex; }
  .d { width: 24px; height: 24px; border: 0; background: none; padding: 0; cursor: pointer; display: grid; place-items: center; transition: width 0.3s; }
  .d i { display: block; height: 6px; width: calc(100% - 6px); border-radius: 3px; background: var(--line); overflow: hidden; }
  .d.on { width: 52px; }
  .d.on b { display: block; height: 100%; background: var(--ink); animation: f 4.5s linear forwards; }
  .car.ps .d.on b { animation: none; width: 100%; }
  @keyframes f { from { width: 0; } to { width: 100%; } }
  .ib { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); background: none; color: var(--ink); display: grid; place-items: center; cursor: pointer; }
  @media (prefers-reduced-motion: reduce) {
    .trk { transition: none; }
    .d.on b { animation: none; width: 100%; }
  }
</style>
