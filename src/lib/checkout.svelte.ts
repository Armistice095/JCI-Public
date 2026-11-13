import { browser } from '$app/environment';
import type { PublicCategory } from '$lib/api/client';

export type Buyer = { firstName: string; lastName: string; phone: string; email: string };
export type Holder = { firstName: string; lastName: string };

/** UUID (16–80 caractères exigés par l'API). */
export function newKey(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (x: number) => x.toString(16).padStart(2, '0')).join('');
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Panier de l'acheteur, conservé le temps de l'achat. Données personnelles : gardées en mémoire et dans
 * `sessionStorage` (onglet courant uniquement) ; JAMAIS le jeton de suivi de commande.
 * Les pages d'achat ne sont pas rendues côté serveur : cet état ne peut donc jamais être partagé entre visiteurs.
 */
class Checkout {
  qty = $state<Record<string, number>>({});
  buyer = $state<Buyer>({ firstName: '', lastName: '', phone: '', email: '' });
  holders = $state<Holder[]>([]);
  /** Index du billet destiné à l'acheteur (« Ce billet est pour moi »), -1 si aucun. */
  meIdx = $state(0);
  errors = $state<Record<string, string>>({});
  /** Clé d'idempotence : réutilisée tant que le contenu de la commande ne change pas. */
  idemKey = newKey();
  private keySig = '';
  private keyAt = 0;
  /** Catégories (nom, prix) vues à l'étape « billets ». */
  cats = $state<PublicCategory[]>([]);

  constructor(private slug: string) {
    if (!browser) return;
    try {
      const raw = sessionStorage.getItem(`jci:checkout:${slug}`);
      if (raw) {
        const d = JSON.parse(raw);
        this.qty = d.qty ?? {};
        this.buyer = { ...this.buyer, ...d.buyer };
        this.holders = d.holders ?? [];
        this.meIdx = typeof d.meIdx === 'number' ? d.meIdx : d.forMe === false ? -1 : 0;
        this.idemKey = d.idemKey ?? this.idemKey;
        this.keySig = d.keySig ?? '';
        this.keyAt = d.keyAt ?? 0;
        this.cats = d.cats ?? [];
      }
    } catch { /* stockage indisponible : tout reste en mémoire */ }
  }

  save() {
    if (!browser) return;
    try {
      sessionStorage.setItem(
        `jci:checkout:${this.slug}`,
        JSON.stringify({ qty: this.qty, buyer: this.buyer, holders: this.holders, meIdx: this.meIdx, idemKey: this.idemKey, keySig: this.keySig, keyAt: this.keyAt, cats: this.cats })
      );
    } catch { /* ignoré */ }
  }

  /** Nouvel achat : panier vide, nouvelle clé d'idempotence (les coordonnées restent pré-remplies). */
  clear() {
    this.qty = {}; this.holders = []; this.errors = {}; this.meIdx = 0;
    this.idemKey = newKey(); this.keySig = ''; this.keyAt = 0;
    try { sessionStorage.removeItem(`jci:checkout:${this.slug}`); } catch { /* ignoré */ }
  }

  get count() { return Object.values(this.qty).reduce((a, b) => a + b, 0); }
  get total() { return this.cats.reduce((s, c) => s + c.priceXof * (this.qty[c.id] ?? 0), 0); }
  /** Un élément par billet, dans l'ordre des catégories (comme la maquette). */
  get tickets(): PublicCategory[] { return this.cats.flatMap((c) => Array<PublicCategory>(this.qty[c.id] ?? 0).fill(c)); }
  get lines() { return this.cats.filter((c) => (this.qty[c.id] ?? 0) > 0).map((c) => ({ cat: c, n: this.qty[c.id] })); }

  /** Aligne le nombre de bénéficiaires sur le nombre de billets. */
  syncHolders() {
    const n = this.count;
    while (this.holders.length < n) this.holders.push({ firstName: '', lastName: '' });
    if (this.holders.length > n) this.holders.length = n;
  }

  payload() {
    const t = (s: string) => s.trim();
    return {
      buyer: { firstName: t(this.buyer.firstName), lastName: t(this.buyer.lastName), email: t(this.buyer.email), phone: t(this.buyer.phone) },
      tickets: this.tickets.map((c, i) => ({ categoryId: c.id, firstName: t(this.holders[i]?.firstName ?? ''), lastName: t(this.holders[i]?.lastName ?? '') })),
      acceptedTerms: true as const
    };
  }

  /**
   * Même contenu → même clé (double clic, retour arrière) ; contenu modifié → nouvelle clé.
   * Au-delà de la durée de réservation (15 min), on repart d'une clé neuve : la rejouer renverrait une commande expirée.
   */
  keyFor(body: object): string {
    const sig = JSON.stringify(body);
    if (sig !== this.keySig || Date.now() - this.keyAt > 14 * 60_000) {
      this.idemKey = newKey(); this.keySig = sig; this.keyAt = Date.now(); this.save();
    }
    return this.idemKey;
  }

  /** Règles de saisie (messages français). Clés = chemins de l'API (`buyer.email`, `tickets.0.firstName`). */
  validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const req = (k: string, v: string) => {
      const s = v.trim();
      if (!s) e[k] = 'Champ obligatoire.';
      else if (s.length > 80) e[k] = '80 caractères maximum.';
    };
    req('buyer.firstName', this.buyer.firstName);
    req('buyer.lastName', this.buyer.lastName);
    const phone = this.buyer.phone.trim();
    if (!phone) e['buyer.phone'] = 'Champ obligatoire.';
    else if (!/^[+0-9()\s.-]+$/.test(phone) || phone.replace(/\D/g, '').length < 8) e['buyer.phone'] = 'Numéro de téléphone invalide.';
    const mail = this.buyer.email.trim();
    if (!mail) e['buyer.email'] = 'Champ obligatoire.';
    else if (!emailRe.test(mail)) e['buyer.email'] = 'Adresse e-mail invalide.';
    this.holders.forEach((h, i) => { req(`tickets.${i}.firstName`, h.firstName); req(`tickets.${i}.lastName`, h.lastName); });
    return e;
  }
}

const store = new Map<string, Checkout>();

/**
 * Efface TOUT ce que l'achat a laissé dans l'onglet : paniers, coordonnées, clés d'idempotence, mémoire des commandes.
 * À appeler dès qu'une commande est terminée (payée, expirée, remboursée…) : sinon un nouvel achat identique
 * rejouerait l'ancienne commande, et les données personnelles resteraient sur un appareil peut-être partagé.
 */
export function clearAllCheckouts() {
  store.clear();
  if (!browser) return;
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('jci:checkout:') || k.startsWith('jci:order:')) sessionStorage.removeItem(k);
  } catch { /* ignoré */ }
}
export function checkoutFor(slug: string): Checkout {
  if (!browser) return new Checkout(slug); // jamais partagé côté serveur
  let c = store.get(slug);
  if (!c) store.set(slug, (c = new Checkout(slug)));
  return c;
}
