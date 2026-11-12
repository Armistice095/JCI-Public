/** URL de paiement acceptée : https uniquement (jamais de `javascript:` ni de redirection en clair). */
export function safeCheckoutUrl(raw: string | null | undefined): string | null {
  try {
    const u = raw ? new URL(raw) : null;
    return u && u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Mémoire de l'onglet : relie une commande à son événement et à l'e-mail saisi (l'API ne renvoie ni l'un ni l'autre au retour de paiement). Jamais le jeton. */
export type OrderMemo = { slug: string; email: string };
const key = (ref: string) => `jci:order:${ref}`;
export function rememberOrder(ref: string, m: OrderMemo) {
  try { sessionStorage.setItem(key(ref), JSON.stringify(m)); } catch { /* ignoré */ }
}
export function recallOrder(ref: string): OrderMemo | null {
  try { const r = sessionStorage.getItem(key(ref)); return r ? JSON.parse(r) : null; } catch { return null; }
}
