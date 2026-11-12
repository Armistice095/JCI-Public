import type { PublicEvent, PublicCategory } from '$lib/api/client';

export const categoryLabel: Record<PublicEvent['category'], string> = {
  CONFERENCE: 'Conférence',
  FORMATION: 'Formation',
  ATELIER: 'Atelier',
  NETWORKING: 'Réseautage',
  GALA: 'Gala',
  AUTRE: 'Autre'
};

export type PageState = 'open' | 'soon' | 'ended' | 'cancelled' | 'soldout';

/** État affiché, dérivé de `status` / `salesStatus` (jamais d'un sélecteur de démonstration). */
export function pageState(e: PublicEvent): PageState {
  if (e.status === 'CANCELLED') return 'cancelled';
  if (e.salesStatus === 'NOT_OPEN') return 'soon';
  if (e.status === 'CLOSED' || e.salesStatus === 'CLOSED') return 'ended';
  if (!e.categories.some((c) => c.availability === 'AVAILABLE')) return 'soldout';
  return 'open';
}

export const stateInfo: Record<PageState, { label: string; tone: '' | 'ok' | 'wait' | 'err' }> = {
  open: { label: 'Billetterie ouverte', tone: 'ok' },
  soon: { label: 'Billetterie bientôt ouverte', tone: 'wait' },
  ended: { label: 'Ventes terminées', tone: '' },
  cancelled: { label: 'Événement annulé', tone: 'err' },
  soldout: { label: 'Billets épuisés', tone: '' }
};

/** Libellé de disponibilité d'une catégorie (`remaining` est plafonné à 10 : 10 signifie « 10 ou plus », donc « Plus que N » seulement sous 10). */
export function availabilityLabel(c: PublicCategory): string {
  switch (c.availability) {
    case 'AVAILABLE': return c.remaining < 10 ? `Plus que ${c.remaining} place${c.remaining > 1 ? 's' : ''}` : 'Disponible';
    case 'SOLD_OUT': return 'Épuisé';
    case 'NOT_STARTED': return 'Bientôt disponible';
    case 'ENDED': return 'Vente terminée';
    default: return '';
  }
}

/** Couleur d'accent : uniquement #RRGGBB (jamais de CSS arbitraire venant de l'API). */
export const safeAccent = (c: string | null) => (c && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : null);

/** Couverture d'abord, puis les autres affiches dans l'ordre reçu. */
export function orderedPosters(e: PublicEvent) {
  const cover = e.posters.filter((p) => p.isCover);
  return [...cover, ...e.posters.filter((p) => !p.isCover)];
}
