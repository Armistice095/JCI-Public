import type { PublicEvent } from '$lib/api/client';
import { formatShortDay } from '$lib/format';
import { toast } from '$lib/toast.svelte';

/** Partage natif (« J’y serai ! ») ou, à défaut, copie du lien de la page événement. */
export async function shareEvent(e: Pick<PublicEvent, 'title'> & { startsAt?: string | null; city?: string }, url: string) {
  const text = `J’y serai ! ${e.title}${e.startsAt ? ', ' + formatShortDay(e.startsAt) : ''}${e.city ? ', ' + e.city : ''}.`;
  try {
    if (navigator.share) await navigator.share({ title: e.title, text, url });
    else {
      await navigator.clipboard.writeText(url);
      toast.show('Lien copié');
    }
  } catch {
    /* partage annulé */
  }
}
