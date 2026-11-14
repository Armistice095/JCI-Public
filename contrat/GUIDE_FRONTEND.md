# JCI Comé Labs — Guide d'intégration frontend

**API v0.13.0** · module Événements & Billetterie · à lire avec `openapi.yaml` (référence exacte) et `api.html` (même contenu, lisible dans un navigateur).

> **Ce que ce document garantit.** `openapi.yaml` ne décrit que ce qui est **déjà en place** côté backend (50 routes). Il est vérifié automatiquement : à chaque modification du backend, des tests comparent les vraies réponses au contrat (route, code HTTP, types, champs obligatoires, valeurs d'énumération, champs non documentés). Si vous constatez un écart, c'est un bug backend : signalez-le.

---

## 1. Démarrer en 10 minutes

### Générer un client TypeScript typé (recommandé pour SvelteKit)
```bash
npm i -D openapi-typescript typescript@5
npm i openapi-fetch
npx openapi-typescript openapi.yaml -o src/lib/api/schema.d.ts
```
> `openapi-typescript` exige TypeScript 5.x (la v6+ provoque une erreur `createKeywordTypeNode`).

```ts
// src/lib/api/client.ts
import createClient from 'openapi-fetch';
import type { paths, components } from './schema';

export type EventSummary = components['schemas']['EventSummary'];
export const api = createClient<paths>({ baseUrl: `${import.meta.env.VITE_API_URL}/api/v1` });

// Appel authentifié : une route ou un statut qui n'existe pas dans le contrat est refusé à la compilation.
const { data, error } = await api.GET('/events', {
  params: { query: { status: 'PUBLISHED', upcoming: 'true', sort: 'startsAt' } },
  headers: { Authorization: `Bearer ${session.access_token}` },
});
```
Regénérez `schema.d.ts` à chaque nouvelle version du contrat (voir `CHANGELOG.md`) : les écarts apparaissent immédiatement à la compilation.

### Serveur de simulation (optionnel, travail hors-ligne)
```bash
npx @stoplight/prism-cli@5 mock openapi.yaml -p 4010 -d
```
Les données sont **aléatoires** (utile pour afficher des écrans, pas pour tester une logique). Pour un vrai développement, utilisez l'environnement de **staging** (URL à communiquer par l'équipe backend).

### Routes que VOS applications doivent exposer
Le backend génère des liens vers votre interface : ces pages doivent exister.

| Route | Application | Utilisée pour |
|---|---|---|
| `/evenements/:slug` | Public | Lien partagé sur WhatsApp / Facebook (`publicUrl` d'un événement) |
| `/commande/:reference?token=…` | Public | Page de retour après paiement FedaPay |
| `/definir-mot-de-passe` | Admin | Lien des e-mails d'invitation et de réinitialisation de mot de passe |
| `/billet/:token` | Public | Page ouverte quand on **scanne le QR code d'un billet avec l'appareil photo** (le QR encode `{PUBLIC_WEB_URL}/billet/{token}`). Appelle `GET /public/tickets/{token}` : affiche événement, catégorie, nom abrégé et statut. **Elle ne valide jamais l'entrée** (la validation se fait avec l'application de contrôle) |

CORS : donnez à l'équipe backend les origines exactes (dev, staging, prod) de chaque application.

---

## 2. Authentification (administration)

La connexion **ne passe pas par notre API** : elle se fait avec le SDK Supabase (`@supabase/supabase-js`), avec l'URL du projet et la clé **anon** (publique). Ne jamais utiliser la clé `service_role` côté client.

```ts
// Connexion
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
// Appels API : Authorization: Bearer <data.session.access_token>
```

1. Après la connexion, appeler **`GET /me`** : profil, rôles, permissions. Le stocker (store Svelte) pour piloter l'interface.
2. **`401`** : jeton expiré ou invalide → `supabase.auth.refreshSession()` puis **une** nouvelle tentative ; en cas d'échec, retour à la page de connexion.
3. **`403` sur `/me`** : le compte Supabase existe mais n'est pas activé dans JCI Comé Labs, ou a été désactivé → afficher le `message` (« Contactez un administrateur »).
4. « Mot de passe oublié » et « Se souvenir de moi » : fonctions Supabase (`resetPasswordForEmail`, durée de session), pas de route API.
5. **Création de compte** : uniquement par un administrateur (`POST /users`). Il n'y a pas d'inscription libre. L'utilisateur reçoit un e-mail ; le lien ouvre `/definir-mot-de-passe` avec une session temporaire Supabase :
   ```ts
   // page /definir-mot-de-passe (le mécanisme exact dépend du flux Supabase configuré : implicite ou PKCE)
   supabase.auth.onAuthStateChange(async (event) => {
     if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') showPasswordForm();
   });
   await supabase.auth.updateUser({ password: nouveauMotDePasse });
   ```

---

## 3. Conventions de l'API

| Sujet | Règle |
|---|---|
| Base URL | `{serveur}/api/v1` |
| Format | JSON (sauf envoi d'affiche : `multipart/form-data`) |
| Montants | Entiers en **XOF** (`3000` = 3 000 F CFA). Formater : `new Intl.NumberFormat('fr-FR').format(n) + ' XOF'` |
| Dates (réponses) | ISO 8601 **UTC** : `2026-11-28T07:00:00.000Z`. Afficher en heure du Bénin : `toLocaleString('fr-FR', { timeZone: 'Africa/Porto-Novo' })` |
| Dates (formulaires) | `date` (`AAAA-MM-JJ`), `startTime`/`endTime` (`HH:mm`) en **heure locale du Bénin**, sans conversion. Les champs `salesOpensAt`/`salesClosesAt` sont des instants : envoyer avec le décalage, ex. `2026-10-01T08:00:00+01:00` |
| `EventDetail` | Renvoie aussi `date`, `startTime`, `endTime` (heure locale) pour **pré-remplir** le formulaire de modification |
| Téléphones | Saisie libre acceptée (`0195789513`, `+229 01 95 78 95 13`, `95789513`) ; l'API renvoie `+2290195789513` |
| `null` / absent | Les champs `nullable` sont toujours présents (valeur `null`). Dans un `PATCH`, **absent = inchangé**, `null` = effacer (là où c'est autorisé) |
| Pagination | `?page=1&pageSize=10` (max 100) → `{ data, meta: { page, pageSize, total, totalPages } }` |
| Listes à onglets | `meta.statusCounts` donne les compteurs de **tous** les onglets en un seul appel |
| `PATCH` de listes | `programme` et `organizers` **remplacent** la liste entière : renvoyer la liste complète |
| Identifiants | UUID ; `reference` (`CMD-0012`) et `ticketNumber` (`JCI-2026-000001`) sont des libellés d'affichage |

### Erreurs : toujours `{ code, message, details? }`
Se baser sur `code` (stable) ; `message` est en français et affichable tel quel.

| Statut | `code` | Quand | Que faire |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Jeton absent / expiré | Rafraîchir la session, sinon page de connexion |
| 403 | `FORBIDDEN` | Permission manquante, compte non activé ou désactivé | Message ; ne pas réessayer |
| 404 | `NOT_FOUND` | Inconnu **ou hors du périmètre** de l'utilisateur | Page « introuvable » (on ne distingue pas volontairement) |
| 409 | `INVALID_STATE` | Action impossible dans l'état actuel (ex. modifier un événement clôturé) | Afficher `message`, rafraîchir les données |
| 409 | `QUOTA_EXCEEDED` | Plus assez de places | Rafraîchir les disponibilités, proposer de réduire |
| 409 | `SALES_CLOSED` / `MAX_PER_ORDER_EXCEEDED` | Billetterie fermée / trop de billets | Message |
| 409 | `DUPLICATE_REQUEST` | `Idempotency-Key` déjà utilisée à un autre usage | Générer une nouvelle clé |
| 409 | `CONFLICT` | Doublon (e-mail, nom de catégorie…) | Message sous le champ |
| 422 | `VALIDATION_ERROR` | Données invalides | `details.fields` → afficher chaque message **sous son champ** |
| 400/503 | `CAPTCHA_FAILED` | Turnstile échoué | Recharger le widget Turnstile |
| 429 | `RATE_LIMITED` | Trop de requêtes | Attendre `Retry-After` secondes |
| 502 | `PAYMENT_PROVIDER_ERROR` | Service de paiement indisponible | « Réessayez dans un instant » : aucune place retenue, aucun débit |

Exemple 422 : `{ "code": "VALIDATION_ERROR", "message": "Certaines données sont invalides.", "details": { "fields": { "tickets.0.email": "Adresse e-mail invalide." } } }`. Les clés sont des chemins pointés (`buyer.phone`, `tickets.0.email`, `ticketing.salesClosesAt`).

---

## 4. Droits et rôles

`GET /me` renvoie `permissions` (rôles globaux) et `eventPermissions` (`{ <eventId>: [...] }`, rôles limités à un événement). Utilisez-les pour **afficher ou masquer** boutons et menus. Le serveur reste seul juge : une action interdite renvoie 403.

Règles à connaître :
- **Portée.** L'Administrateur et le Président local voient **tous** les événements. L'Organisateur, le Vendeur et l'Agent d'accueil ne voient que les événements qu'ils ont créés ou auxquels ils sont assignés. Les listes sont déjà filtrées par le serveur : **ne filtrez rien côté client**.
- **Publier.** Seuls Administrateur et Président local ont `event.publish`. L'Organisateur enregistre des brouillons : masquer « Publier » s'il n'a pas la permission.
- **Recettes.** `revenueXof` vaut `null` quand l'utilisateur ne peut pas voir les commandes de l'événement ou que l'événement est un brouillon : afficher « — ».
- **Vendeur.** Ne voit que **ses** ventes physiques et ne voit pas les écrans financiers (`/payments` → 403).

Matrice complète (générée depuis le code ; « à venir » = routes pas encore livrées) :

| Permission | Signification | Admin | Président | Organisateur | Vendeur | Agent d'accueil |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `user.manage` | Gérer les utilisateurs | ✅ |  |  |  |  |
| `role.manage` | Attribuer/retirer des rôles | ✅ |  |  |  |  |
| `audit.view` | Consulter le journal d'audit (à venir) | ✅ |  |  |  |  |
| `settings.manage` | Paramètres de la plateforme (à venir) | ✅ |  |  |  |  |
| `event.read` | Voir les événements | ✅ | ✅ | ✅ | ✅ | ✅ |
| `event.create` | Créer un événement | ✅ | ✅ | ✅ |  |  |
| `event.update` | Modifier un événement | ✅ | ✅ | ✅ |  |  |
| `event.publish` | Publier un événement | ✅ | ✅ |  |  |  |
| `event.close` | Clôturer | ✅ | ✅ |  |  |  |
| `event.cancel` | Annuler | ✅ | ✅ |  |  |  |
| `event.delete_draft` | Supprimer un brouillon | ✅ |  | ✅ |  |  |
| `ticketing.manage` | Gérer la billetterie et les catégories | ✅ | ✅ | ✅ |  |  |
| `order.read` | Voir les commandes et paiements | ✅ | ✅ | ✅ |  |  |
| `finance.view` | Vue financière globale (/payments, recettes) | ✅ | ✅ |  |  |  |
| `sale.create` | Enregistrer une vente physique | ✅ | ✅ |  | ✅ |  |
| `sale.read_all` | Voir toutes les ventes physiques | ✅ | ✅ |  |  |  |
| `participant.read` | Voir les participants et la fiche d'un billet | ✅ | ✅ | ✅ |  |  |
| `participant.export` | Exporter les participants (CSV, Excel) | ✅ | ✅ | ✅ |  |  |
| `ticket.cancel` | Annuler un billet | ✅ | ✅ |  |  |  |
| `ticket.resend` | Renvoyer un billet (à venir) | ✅ | ✅ | ✅ |  |  |
| `report.view` | Rapports (à venir) | ✅ | ✅ | ✅ |  |  |
| `dashboard.view` | Tableau de bord (`GET /dashboard`) | ✅ | ✅ | ✅ |  |  |
| `checkin.scan` | Scanner à l'entrée (`POST /checkin/scan`) | ✅ |  |  |  | ✅ |
| `checkin.view` | Voir les compteurs d'entrée (`GET /events/{id}/checkin/stats`) | ✅ | ✅ | ✅ |  | ✅ |
| `checkin.override` | Admission exceptionnelle (à venir) | ✅ | ✅ |  |  |  |

---

## 5. Libellés et couleurs conseillés

| Valeur | Libellé | Valeur | Libellé |
|---|---|---|---|
| `EventStatus.DRAFT` | Brouillon (bleu) | `OrderStatus.PAID` | Payée (vert) |
| `PUBLISHED` | Publié (vert) | `PENDING_PAYMENT`, `PAYMENT_IN_PROGRESS` | En attente (ambre) |
| `CLOSED` | Clôturé (gris) | `FAILED` | Échouée (rouge) |
| `CANCELLED` | Annulé (rouge) | `EXPIRED` | Expirée (gris) |
| `SalesStatus.OPEN` | Billetterie ouverte (vert) | `REFUNDED` | Remboursée (bleu) |
| `NOT_OPEN` | Billetterie non ouverte (ambre) | `REFUND_REQUIRED` | **À rembourser** (rouge, à mettre en évidence) |
| `CLOSED` | Billetterie fermée (gris) | `CANCELLED` | Annulée (gris) |
| `CategoryAvailability.AVAILABLE` | Disponible (vert) | `SOLD_OUT` | Épuisé |
| `NOT_STARTED` | Vente pas encore ouverte | `ENDED` / `DISABLED` | Vente terminée / Désactivée |
| `PaymentMethod.MOBILE_MONEY_MTN` | Mobile Money (MTN) | `MOBILE_MONEY_MOOV` | Mobile Money (Moov) |
| `CARD` | Carte bancaire | `CASH` | Espèces |
| `MOBILE_MONEY_DIRECT` | Mobile Money direct | `MOBILE_MONEY_OTHER` / `UNKNOWN` | Mobile Money / — |
| `TicketStatus.VALID` | Valide | `USED` | Utilisé |
| `CANCELLED` / `REFUNDED` | Annulé / Remboursé | | |

Le statut **de publication** (`EventStatus`) et le statut **de billetterie** (`SalesStatus`) sont deux notions distinctes : un événement peut être publié avec une billetterie non ouverte (comme dans la maquette « Soirée Networking »).

---

## 6. Correspondance avec les maquettes

✅ disponible · ⏳ pas encore (voir §9 « Feuille de route »)

| Écran / bloc | Endpoint(s) | |
|---|---|---|
| **Connexion** | SDK Supabase, puis `GET /me` | ✅ |
| Tableau de bord — Derniers paiements | `GET /payments?q=` (recherche, pagination) | ✅ |
| Tableau de bord — Ventes physiques récentes | `GET /physical-sales?pageSize=3` | ✅ |
| Tableau de bord — Événements proches | `GET /dashboard` → `upcomingEvents` (§7.10) | ✅ |
| Tableau de bord — Recettes, taux de remplissage, billets émis, courbe des ventes, billets par catégorie | `GET /dashboard?range=7\|30` (§7.10) | ✅ |
| **Liste des événements** (tableau et cartes, onglets, recherche, filtre Billetterie) | `GET /events` (`status`, `sales`, `q`) ; compteurs d'onglets : `meta.statusCounts` | ✅ |
| Fiche — en-tête (titre, statuts, date, lieu, Page publique) | `GET /events/{id}` (`publicUrl`) | ✅ |
| Fiche — **Vue d'ensemble** | KPI, ventes par catégorie, activité récente : `GET /events/{id}/overview` (§7.8) | ✅ |
| Fiche — **Informations** (+ Modifier) | `GET` puis `PATCH /events/{id}` ; affiches : `/posters` | ✅ |
| Fiche — **Billetterie** | `GET /events/{id}/ticketing` ; `PATCH` ; `…/close` ; `…/reopen` ; catégories : `POST/PATCH/DELETE /categories` | ✅ |
| Fiche — **Participants** (liste, filtres, exports, « Voir le billet ») | `GET /events/{id}/participants` (+ `/export`), `GET /tickets/{id}`, fichiers : `GET /tickets/{id}/files/{kind}` (§7.7) | ✅ |
| Fiche — **Paiements** (compteurs, recherche) | `GET /events/{id}/orders` (`status`, `q`) ; détail `GET /orders/{id}` | ✅ |
| Fiche — **Documents** (4 PDF) | `GET /events/{id}/reports`, `GET /events/{id}/reports/{kind}` (§7.12) | ✅ |
| Fiche — **Présences**, **Communication** | `…/attendance`, `…/communication` | ⏳ |
| **Création d'événement** | `POST /events` (voir §7.2) | ✅ |
| **Vente physique** | `POST /physical-sales` (voir §7.3) | ✅ |
| **Annuler un billet** | `POST /tickets/{id}/cancel` | ✅ |
| **Membres / utilisateurs** (administration) | `/users…`, `/roles` | ✅ |
| Page publique d'un événement | `GET /public/events/{slug}` (+ `og` pour l'aperçu WhatsApp) — voir §7.9 | ✅ |
| Achat et suivi de commande | §7.1 | ✅ |

> Les sélecteurs « Rôle (démo) » et « État de l'écran (démo) » des maquettes sont des outils de démonstration : ne pas les implémenter.

---

## 7. Parcours détaillés

### 7.1 Achat d'un billet (application publique)

```
Page /evenements/:slug  ──►  GET /public/events/{slug}      (rendu SERVEUR SvelteKit : balises Open Graph = aperçu WhatsApp)
        │                    POST /public/events/{slug}/views  (une fois, côté navigateur)
        ▼
Choix des billets + formulaire + Turnstile
        │  (générer UNE Idempotency-Key à l'ouverture du formulaire)
        ▼
POST /public/events/{slug}/orders   ──►  { reference, accessToken, reservedUntil, checkoutUrl }
        ▼
window.location = checkoutUrl        (page de paiement FedaPay : Mobile Money / carte)
        ▼
FedaPay redirige vers  /commande/{reference}?token={accessToken}
        ▼
Interroger GET /public/orders/{reference}?token=…  toutes les 3 s  jusqu'à un statut final
```

**Page événement.** Afficher `categories` avec `availability` (`AVAILABLE` : acheteur possible ; `SOLD_OUT` : « Épuisé » ; `NOT_STARTED` / `ENDED` : vente non ouverte / terminée). `remaining` est plafonné à 10 (le stock exact n'est jamais exposé) : afficher « Plus que N places » seulement si `remaining < 10`. Bloquer le bouton d'achat si `salesStatus ≠ OPEN`. Limiter la quantité à `maxPerOrder` (par catégorie).

**Formulaire.** Acheteur : prénom, nom, **e-mail** (reçoit les billets), **téléphone** — tous obligatoires. Un bénéficiaire par billet : prénom et nom obligatoires, e-mail et téléphone facultatifs (pré-remplir le premier avec l'acheteur). Case « J'accepte les conditions » (`acceptedTerms: true`).

**Anti-robots.** Widget Cloudflare Turnstile ; envoyer son jeton dans `captchaToken` (obligatoire en production).

**`Idempotency-Key`** (16–80 caractères, un UUID convient) : à générer à l'ouverture du formulaire, **réutiliser** à chaque nouvel envoi du même formulaire (double clic, réseau instable, retour arrière). Le serveur renvoie alors la **même** commande (code 201) au lieu d'en créer une deuxième. Nouvelle clé seulement pour un **nouvel** achat.

**Réservation.** Les places sont retenues 15 minutes (`reservedUntil`) : afficher un compte à rebours sur la page de paiement/retour. Passé ce délai, la commande expire.

**Page de retour `/commande/:reference`.**
1. Lire `token` dans l'URL, le garder en mémoire, puis le **retirer de la barre d'adresse** (`history.replaceState`). Servir la page avec `Referrer-Policy: no-referrer`.
2. Ne **jamais** conclure « payé » parce que l'utilisateur est revenu : interroger l'API.
3. Interroger `GET /public/orders/{reference}?token=…` **toutes les 3 secondes maximum** (limite serveur : 60/min). Le serveur revérifie lui-même le paiement : les billets apparaissent même si une notification est en retard. Arrêter à un statut final.

| `status` | Que montrer |
|---|---|
| `PENDING_PAYMENT`, `PAYMENT_IN_PROGRESS` | « Vérification du paiement… » + compte à rebours `reservedUntil` ; continuer d'interroger |
| `PAID` | Confirmation + liste `tickets`. Tant que `filesReady` vaut `false` (moins d'une seconde en général), afficher « Préparation de vos billets… » et continuer d'interroger. Ensuite, pour chaque billet : **Télécharger (PDF)** → `pdfUrl`, **Enregistrer l'image** → `imageUrl` (voir §7.6) |
| `FAILED` | `message` + bouton **Réessayer** (`POST …/retry-payment`, redirection vers le nouveau `checkoutUrl`), tant que `reservedUntil` n'est pas passé |
| `EXPIRED` | `message` + bouton « Recommencer » (nouvel achat, nouvelle `Idempotency-Key`) |
| `REFUND_REQUIRED` | `message` tel quel : paiement reçu mais places indisponibles, l'organisation rembourse. **Ne pas** proposer de réessayer |
| `REFUNDED`, `CANCELLED` | `message` |

`message` est déjà rédigé en français pour chaque statut : l'afficher tel quel.

**Cas d'erreur à la création.** `409 QUOTA_EXCEEDED` (rafraîchir la page événement), `409 SALES_CLOSED`, `409 MAX_PER_ORDER_EXCEEDED`, `422` (champs), `429`, `502 PAYMENT_PROVIDER_ERROR` (réessayer, rien n'est retenu).

### 7.2 Création d'un événement (administration)

Le formulaire de la maquette (Informations → Affiche → Organisateurs → Billetterie) s'envoie en **un `POST /events`**, **sauf les affiches** qui exigent que l'événement existe déjà. Séquence recommandée :

1. `POST /events` **sans** `publish` → brouillon, avec tous les champs saisis (réponse : `EventDetail`, dont l'`id`).
2. Envoi des affiches : `POST /events/{id}/posters` (une requête par fichier, `multipart/form-data`, champ `file`). JPG/PNG, 2 Mo max, 5 max. La première devient la couverture ; `?isCover=true` pour en choisir une autre.
3. Si l'utilisateur a cliqué **Publier** : `POST /events/{id}/publish`.
   Si l'événement est incomplet : `422` avec `details.fields` (`title`, `description`, `date`, `startTime`, `endTime`, `venueName`, `city`) → ramener l'utilisateur sur les champs concernés.

Bouton **Enregistrer le brouillon** = étapes 1-2 seulement. Afficher « Publier » uniquement si `permissions` contient `event.publish`.

| Champ du formulaire | Champ API |
|---|---|
| Titre, Catégorie, Description | `title` (3–150), `category` (`CONFERENCE`, `FORMATION`, `ATELIER`, `NETWORKING`, `GALA`, `AUTRE`), `description` (≤ 5000) |
| Date, Début, Fin | `date` (`AAAA-MM-JJ`), `startTime`, `endTime` (`HH:mm`) ; défauts de la maquette 08:00 / 17:00 |
| Nom du lieu, Ville | `venueName`, `city` |
| Programme (lignes heure + libellé) | `programme: [{ time, label }]` (≤ 30) |
| Organisateurs | `organizers: [{ name, description }]` (≤ 10). **Pré-remplir** « JCI Comé Excellence / Organisation de jeunes citoyens actifs » côté interface : le serveur ne le fait pas |
| Ouverture, Clôture, Maximum par commande | `ticketing: { salesOpensAt, salesClosesAt, maxPerOrder }` (1–10, défaut 5). Si `salesClosesAt` est absent et `date` fournie : **veille à 18h00** (valeur à afficher après création) |
| Catégories de billets | `categories: [{ name, priceXof, quota, conditions }]` (≤ 10). Prix ≥ 1 : **pas de billets gratuits** en v1. `conditions` est un texte libre (ex. « Justificatif demandé ») |
| « Capacité totale » / « Recettes si tout est vendu » | Calcul d'affichage pendant la saisie ; après enregistrement : `totalCapacity` et `potentialRevenueXof` de `GET …/ticketing` |

L'**adresse publique** (`slug`) est générée par le serveur à la création (`leadership-impact-2026`) et ne change plus : vous pouvez afficher `publicUrl` dès l'enregistrement.

### 7.3 Vente physique (administration / vendeur)

Écran : choix de l'événement (`GET /events?status=PUBLISHED`), catégorie(s), bénéficiaires, mode de paiement (`CASH` ou `MOBILE_MONEY_DIRECT`, référence facultative), et une **case obligatoire** « J'atteste avoir reçu le paiement » (`paymentReceivedConfirmed: true`).

- Envoyer `POST /physical-sales` avec une `Idempotency-Key` **générée à l'ouverture du formulaire** (réutilisée en cas de nouvel envoi).
- **201** : vente créée. **200** : cette même requête avait déjà été traitée (rien de nouveau créé) → afficher le même écran de succès.
- Les billets sont **créés immédiatement** ; la réponse (`OrderDetail`) liste `tickets` avec leur numéro. La remise du PDF/image au participant arrivera avec l'étape « billets ».
- Conditions : événement publié **et** billetterie ouverte ; 10 billets maximum par vente. Sinon `409 SALES_CLOSED`.

### 7.4 Utilisateurs (administration, réservé aux administrateurs)

- Créer : `POST /users` avec au moins un rôle. `ADMIN` et `PRESIDENT` sont **globaux** ; `ORGANIZER`, `SELLER`, `GATE_AGENT` peuvent être limités à un événement (`eventId`) — typiquement un vendeur ou un agent d'accueil assigné à un événement précis.
- Désactiver / réactiver : `POST /users/{id}/disable` | `/enable`. Refusé sur son propre compte et sur le dernier administrateur (`409`).
- Rôles : `POST /users/{id}/roles`, `DELETE /users/{id}/roles/{grantId}` (l'`id` d'une attribution est dans `User.roles[].id`).
- `POST /users/{id}/reset-password` : envoie l'e-mail de réinitialisation.

### 7.5 Annuler un billet
`POST /tickets/{id}/cancel` avec un motif (3 caractères min.). Le billet est refusé à l'entrée et la place est remise en vente. Impossible si le billet est déjà utilisé (`409`). **Le remboursement d'argent n'est pas géré par l'application** (à faire dans le tableau de bord FedaPay) : l'indiquer dans l'interface.

### 7.6 Billets : fichiers, renvoi

Chaque billet a **deux fichiers**, générés par le serveur en moins d'une seconde après le paiement ou la vente (le visuel de partage a été retiré en 0.13.0) :

| Fichier | Usage | Clé / `kind` |
|---|---|---|
| **PDF** (297 × 99,5 mm) | Impression ; pièce jointe de l'e-mail | `pdfUrl` / `pdf` |
| **Image PNG** (2244 × 752) | Montrer à l'entrée depuis le téléphone ; enregistrer dans la galerie | `imageUrl` / `image` |

**Côté acheteur** (page `/commande/:reference`) : les liens sont dans `GET /public/orders/{reference}` → `tickets[]`. Ce sont des **URL signées valables 15 minutes**, renouvelées à chaque appel : ne pas les mémoriser, ne pas les envoyer à un outil d'analyse ; ouvrez-les ou lancez le téléchargement tout de suite. Pour un bouton **Partager** : partager **l'adresse de la page publique de l'événement** (`navigator.share({ title, url })`, à défaut copier le lien), jamais l'image du billet : elle contient le QR code qui ouvre l'accès.

**Côté administration / vendeur** : `GET /tickets/{ticketId}/files/{pdf|image}` → `{ url, expiresAt, fileName, contentType }`.
- **202 `{ status: "PENDING" }`** : pas encore prêt → réessayer toutes les 2-3 secondes (le serveur relance la génération si besoin). Après une **vente physique**, c'est le cas typique : afficher « Préparation du billet… » puis activer le bouton **Télécharger / Imprimer**.
- Droits : `participant.read` sur l'événement, ou le **vendeur qui a enregistré la vente**. Sinon 404.
- **Renvoyer par e-mail** : `POST /tickets/{ticketId}/resend` (corps facultatif `{ "toEmail": "…" }`) → 202. Sans `toEmail` : adresse du bénéficiaire, sinon de l'acheteur (422 s'il n'y en a aucune). 5 renvois par heure et par billet (429 `RATE_LIMITED`). Réservé aux rôles ayant `ticket.resend` ; billet valide uniquement.

**E-mails.** L'acheteur reçoit automatiquement un e-mail de confirmation avec les PDF en pièces jointes. Le statut de livraison (envoyé, délivré, rebond…) est suivi côté serveur ; il est exposé dans l'écran Participants (`emailStatus`, §7.7). Si l'acheteur dit ne rien avoir reçu : vérifier les courriers indésirables, puis utiliser **Renvoyer**.

### 7.7 Participants (onglet de la fiche événement)

Un participant = un **billet**. Droit `participant.read` sur l'événement (404 hors périmètre, 403 sans la permission).

**Liste** : `GET /events/{id}/participants?page=&pageSize=&q=&categoryId=&presence=&sort=&dir=`

| Élément de la maquette | Champ / paramètre |
|---|---|
| Compteur « Participants 142 » | `meta.counts.ALL` |
| N° | rang dans la liste : `(page - 1) × pageSize + index + 1` |
| Nom et prénom (colonne triable ↕) | `lastName` + `firstName` ; tri : `sort=name&dir=asc\|desc` |
| Téléphone · E-mail | `phone` · `email` (du bénéficiaire ; `null` si non renseigné) |
| Catégorie (filtre « Toutes les catégories ») | `category` ; filtre : `categoryId` |
| Référence billet | `ticketNumber` |
| Montant | `amountXof` (prix de ce billet) |
| Paiement | `paymentStatus` : `PAID` Payée · `REFUNDED` Remboursée · `REFUND_REQUIRED` à rembourser |
| Mode de paiement | `paymentMethod` (mêmes libellés qu'au §5) |
| Présence (filtre « Toutes les présences ») | `presence` : `UPCOMING` À venir · `PRESENT` Présent · `CANCELLED` Annulé ; filtre : `presence=` |
| Date d'achat | `purchasedAt` (afficher en heure du Bénin) |
| Statut d'e-mail | `emailStatus` : `DELIVERED` Délivré · `SENT` Envoyé · `QUEUED` En file · `DEFERRED` Différé · `SOFT_BOUNCE`/`HARD_BOUNCE` Rebond · `BLOCKED`/`SPAM`/`FAILED` Problème · `NOT_SENT` Pas encore envoyé · `NOT_REQUESTED` Non demandé à la vente |
| Recherche | `q` : nom, prénom, e-mail, téléphone, référence billet ou commande ; plusieurs mots = tous doivent correspondre |
| « Page 1 sur 15 », « 1–10 sur 142 » | `meta.page`, `meta.totalPages`, `meta.total` (tient compte des filtres) |

`meta.counts` (`ALL`, `UPCOMING`, `PRESENT`, `CANCELLED`) suit la recherche et la catégorie mais **pas** le filtre de présence : il alimente de vraies pastilles sans qu'elles changent quand on clique dessus.

**Voir le billet** : `GET /tickets/{ticketId}` → titulaire, catégorie, présence (qui a scanné, quand), commande et paiement, historique des e-mails, `filesReady`. Les fichiers (PDF, image) se téléchargent ensuite avec `GET /tickets/{ticketId}/files/{kind}` (§7.6). Un vendeur peut ouvrir la fiche des billets **qu'il a lui-même vendus**.

**Exporter** : `GET /events/{id}/participants/export?format=csv|xlsx` + les mêmes filtres (sans pagination). Droit `participant.export`. La réponse est le **fichier** : `fetch` avec l'en-tête `Authorization`, puis `blob()` et téléchargement (un lien `<a href>` ne transmet pas le jeton). Maximum 10 000 lignes (422 au-delà). Le CSV s'ouvre directement dans Excel en français (UTF-8, séparateur `;`). La **liste en PDF** se télécharge depuis l'onglet Documents (§7.12).

### 7.8 Vue d'ensemble (onglet de la fiche événement)

`GET /events/{id}/overview` — une seule requête pour tout l'onglet. Appelable par tout utilisateur qui voit l'événement (404 sinon) ; **deux blocs dépendent des droits** et valent `null` quand ils sont masqués : afficher alors un tiret ou masquer la carte, ne pas afficher « 0 ».

| Élément de la maquette | Champ | Droit requis |
|---|---|---|
| Recettes confirmées | `kpis.revenueXof` | `finance.view` ou `order.read` |
| Visiteurs | `kpis.views` | — |
| Billets émis « 142 / 250 » | `kpis.ticketsIssued` / `kpis.capacity` | — |
| Places restantes | `kpis.remaining` (valeur exacte, contrairement à la page publique qui plafonne à 10) | — |
| Ventes par catégorie : nom, prix | `categories[].name`, `priceXof` | — |
| « 97 sur 162 billets » et barre de progression | `categories[].sold` / `quota` | — |
| Montant à droite (« 246 500 XOF ») | `categories[].revenueXof` | `finance.view` ou `order.read` |
| Activité récente | `activity[]` : `type` (`TICKET_ISSUED` Billet émis · `TICKET_CHECKED_IN` Billet scanné · `TICKET_CANCELLED` Billet annulé), `holderName`, `category`, `at` | `participant.read` |

- `at` est un horodatage UTC : calculer « il y a 12 min » côté interface.
- `capacity` et `remaining` ne comptent que les **catégories actives** ; une catégorie inactive reste dans `categories[]` (`isActive: false`) : la griser ou la masquer.
- `categories[].reserved` = places retenues par des paiements en cours ; elles ne sont plus à vendre mais ne sont pas encore des billets.
- Les recettes sont celles des commandes **payées** : une commande remboursée n'est plus comptée. Les recettes des catégories s'additionnent exactement en `kpis.revenueXof`.
- Un brouillon répond avec des zéros et `revenueXof: null`.

### 7.9 Page publique d'un événement

**Principe.** Il n'y a **pas une page par événement** : le front a un seul modèle, `/evenements/[slug]`, rempli à chaque visite avec `GET /public/events/{slug}`. Cliquer sur **Publier** dans l'administration ne fabrique aucune page : l'événement passe de `DRAFT` à `PUBLISHED`, et l'API se met à répondre au lieu de renvoyer 404. Clôturer ou annuler change `status` / `salesStatus` ; la même page affiche alors « billetterie fermée » ou « événement annulé ».

**Adresse stable.** Le `slug` est créé une fois, à la création de l'événement, et **ne change jamais** (renommer l'événement ne le modifie pas, et l'API ignore tout `slug` envoyé dans un `PATCH`). Les liens déjà diffusés restent donc valides.

| Élément de la maquette | Champ |
|---|---|
| Étiquette « Conférence » | `category` (`CONFERENCE` Conférence · `FORMATION` Formation · `ATELIER` Atelier · `NETWORKING` Réseautage · `GALA` Gala · `AUTRE` Autre) |
| Pastille « Billetterie ouverte » | `salesStatus` (§5) |
| Titre, date, horaires, lieu | `title`, `startsAt`/`endsAt` (afficher en heure du Bénin), `venueName`, `city` |
| Carrousel d'affiches | `posters[]` (la première est la couverture ; ne charger que celle-là d'emblée) |
| Liste des billets : nom, prix, description | `categories[].name`, `priceXof`, `conditions` |
| « Disponible » / « Plus que 12 places » / « Épuisé » | `categories[].availability` et `remaining` (**plafonné à 10** : afficher « Plus que N places » quand `remaining` ≤ 10 ; au-delà, « Disponible ») |
| À propos · Programme · Organisé par | `description` · `programme[]` · `organizers[]` |
| **Une seule section « Questions fréquentes »** (accordéon) : plus de section « Informations » à part | `faq[]` : `{question, answer}`. Les **3 premiers éléments** sont « Infos pratiques », « Conditions d'utilisation du billet », « Annulation et remboursement » (texte de l'organisateur, sinon texte général JCI : jamais vides), suivis de 6 questions générales (7 si une catégorie demande un justificatif), avec les valeurs réelles (délai de réservation, maximum par commande). Afficher la liste telle quelle, dans l'ordre |
| Bouton « Écrire sur WhatsApp » | `contactPhone` → `https://wa.me/<chiffres du numéro>` ; numéro de l'événement, sinon celui de l'organisation (`ORG_CONTACT_PHONE`) ; masquer le bouton seulement si `null` (aucun numéro configuré) |
| Couleur propre à l'événement (facultatif) | `accentColor` (`#RRGGBB` ou `null` : couleur JCI par défaut) |
| Aperçu WhatsApp / Facebook | `og.title`, `og.description`, `og.imageUrl` dans `<svelte:head>`, plus `og:image:width` / `og:image:height` / `og:image:type` depuis `og.imageWidth` / `og.imageHeight` / `og.imageType` (image légère 1200×630 ; WhatsApp ignore les images trop lourdes) |
| Bouton « Partager » | l'adresse de la page |

**À respecter**
- **Rendu côté serveur obligatoire** pour cette page : les robots de WhatsApp et Facebook n'exécutent pas JavaScript, sans quoi l'aperçu du lien est vide.
- **Compter la vue dans le navigateur** (`POST /public/events/{slug}/views`, une fois), jamais pendant le rendu serveur : sinon les robots gonflent « Visiteurs ».
- **Retirer le sélecteur « Démonstration, état de la page »** de la maquette. L'état réel vient de `salesStatus`.
- **Cache.** La réponse porte `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=60` (jamais sur une erreur) : un CDN peut la garder une minute. Le stock affiché est donc à environ une minute près ; le serveur tranche à la création de la commande. Rafraîchir les disponibilités à l'étape « Choisissez vos billets ».
- **Limite de débit : 120 appels par minute et par adresse IP.** Si le serveur SvelteKit appelle l'API, l'API ne voit que **l'adresse du serveur SvelteKit** : tout le site partagerait ce plafond. Mettre la page en cache côté SvelteKit (ou devant) pour que l'API ne soit pas appelée à chaque visite, et transmettre l'adresse du visiteur (`X-Forwarded-For`) à l'API si elle doit rester par visiteur.

---

### 7.9 bis Liste publique des événements (accueil de la billetterie, sitemap)

`GET /public/events` : sans compte, **uniquement les événements `PUBLISHED`** (jamais brouillon, clôturé ni annulé).

| Paramètre | Valeurs | Défaut |
|---|---|---|
| `when` | `upcoming` (pas encore terminés, du plus proche au plus lointain) · `past` (terminés, du plus récent) · `all` | `upcoming` |
| `page`, `pageSize` | `pageSize` de 1 à 100 | 1, 20 |

Chaque élément (carte) : `slug`, `title`, `category`, `accentColor`, `startsAt`, `endsAt`, `venueName`, `city`, `coverUrl` (couverture ou `null`), `salesStatus`, `priceFromXof` (plus petit prix des catégories actives, `null` si aucune), `soldOut` (toutes les catégories épuisées) et **`updatedAt`**.

- **Page d'accueil** : `GET /public/events?when=upcoming`, lien vers `/evenements/{slug}`.
- **`sitemap.xml`** : parcourir `when=all` avec `pageSize=100` jusqu'à `meta.totalPages`. `<loc>` = `${PUBLIC_WEB_URL}/evenements/{slug}`, `<lastmod>` = `updatedAt`. Générer le sitemap côté serveur et le mettre en cache (quelques minutes), pas à chaque requête de robot.
- Cache CDN : `s-maxage=60` (jamais sur une erreur). Limite : 120 appels/min/IP (voir §7.9 : depuis un Worker Cloudflare, plusieurs visiteurs partagent les mêmes adresses de sortie, d'où l'intérêt du cache).

**CORS.** L'API accepte les origines de `CORS_ORIGINS` (production : `https://billets.jcicomee.org`, `https://admin.jcicomee.org`) et expose l'en-tête `Retry-After` : le front peut le lire sur un `429` pour afficher « réessayez dans N secondes ».

---

### 7.10 Tableau de bord

`GET /dashboard?range=30` — une seule requête pour les cartes, la courbe, l'anneau et les événements proches. Les deux tableaux du bas ont leurs propres routes (ci-dessous). Réservé à `dashboard.view` (administrateur, président local, organisateur) : **403** pour un vendeur ou un agent d'accueil, dont le menu ne doit pas proposer l'écran. Il porte sur **les événements que l'utilisateur voit**, brouillons exclus : un organisateur ne voit que les siens.

| Élément de la maquette | Champ / route |
|---|---|
| Recettes confirmées | `kpis.revenueXof` : commandes payées, en ligne et physiques (une commande remboursée n'est pas comptée) |
| Taux de remplissage « 55 % » | `kpis.fillRatePercent` : billets vendus ÷ places des événements publiés ou clôturés ; `null` s'il n'y a aucune place (afficher un tiret) |
| Billets émis | `kpis.ticketsIssued` (valides ou utilisés) |
| Événements | `kpis.eventsCount` (publiés ou clôturés) |
| Boutons « 7 jours » / « 30 jours » | paramètre `range` (`7` ou `30`, 30 par défaut ; autre valeur : 422) |
| Courbe « Ventes » | `sales.points[]` : `date` (jour du Bénin), `revenueXof`, `tickets`. Un point **par jour, jours à zéro compris**, du plus ancien au plus récent : la courbe n'a pas de trou à combler. Totaux : `sales.totalRevenueXof`, `sales.totalTickets` |
| Anneau « Billets par catégorie » | `ticketsByCategory.total` (au centre) et `categories[]` : `name`, `count`, `percent`. Les catégories de même nom sont additionnées d'un événement à l'autre ; au-delà de 5, le reste est dans « Autres ». Les pourcentages sont arrondis : leur somme peut valoir 99 ou 101. Les couleurs sont choisies par le front |
| Événements proches | `upcomingEvents[]` (5 au plus, du plus proche au plus lointain) : `title`, `startsAt`, `coverUrl`, `salesStatus` (pastille « Billetterie ouverte / non ouverte »), `ticketsIssued` / `capacity` (« 142 sur 250 billets émis » et barre) |
| Derniers paiements (tableau, recherche, pagination) | `GET /payments?q=&page=` (permission `finance.view`, 403 sinon : masquer le tableau) |
| Ventes physiques récentes, « Voir tout » | `GET /physical-sales?pageSize=3` ; « Voir tout » ouvre l'écran Vente physique |

**Droits.** Les montants (`kpis.revenueXof`, `sales.points[].revenueXof`, `sales.totalRevenueXof`) valent `null` quand l'utilisateur n'a `finance.view` ni `order.read` : afficher un tiret, jamais « 0 ». Un utilisateur qui a ce droit mais aucun événement voit bien `0`.

**Fuseau.** Les jours de la courbe sont ceux du Bénin (UTC+1) : afficher `date` telle quelle, sans la convertir en `Date` locale du navigateur (un décalage ferait glisser la courbe d'un jour).

### 7.11 Contrôle d'accès (application JCI Stafs)

Deux routes, utilisées par l'application mobile de l'accueil (détail et exemples dans `openapi.yaml`, tag « Contrôle d'accès »).

**`POST /checkin/scan`** — corps `{ eventId, qrToken }` ou `{ eventId, ticketNumber }`, en-tête `Idempotency-Key` obligatoire.
- Le QR code d'un billet contient une adresse `…/<qrToken>` : l'application envoie **le dernier segment du chemin**, tel quel. Un code étranger n'est pas une erreur : la réponse est `INVALID`.
- **Toujours HTTP 200** pour les six résultats ; l'affichage dépend de `result` : `ADMITTED` (vert), `ALREADY_USED` (orange, avec `firstCheckedInAt` / `firstCheckedInBy`), `WRONG_EVENT`, `CANCELLED` (annulé ou remboursé, avec `reason`), `EVENT_NOT_ACTIVE` (événement clôturé ou annulé), `INVALID` (rouge).
- **Un billet n'est admis qu'une fois**, même si deux téléphones le scannent au même instant : le second reçoit `ALREADY_USED`. Le téléphone n'a jamais à décider.
- **Idempotence** : un nouvel UUID par scan, **réutilisé** si la requête est renvoyée après une coupure réseau (on renvoie alors le même résultat, rien n'est compté deux fois). Une clé réutilisée par un autre agent ou pour un autre événement donne **409** `DUPLICATE_REQUEST`.
- `counters` (`admitted` / `capacity`) est à jour dans chaque réponse et inclut les scans des autres agents. `capacity` = **billets à contrôler** (valides ou utilisés), pas la jauge de l'événement.
- Pas de limite de débit par IP sur cette route (l'accueil partage souvent le même Wi-Fi). Tous les scans, réussis ou non, sont journalisés (agent, appareil, heure) sans conserver le jeton entier.

**`GET /events/{eventId}/checkin/stats`** — `{ eventId, admitted, capacity }`, à rappeler toutes les 30 secondes environ.

**Droits.** `checkin.scan` est donné à l'administrateur et à l'agent d'accueil **assigné à l'événement** : un agent assigné voit cette permission dans `GET /me` → `eventPermissions[<eventId>]`, **pas** dans `permissions` (qui ne liste que les rôles globaux). L'application doit donc accepter un compte qui a `checkin.scan` dans `permissions` **ou** dans une entrée de `eventPermissions`. Pour la liste des événements à contrôler : `GET /events?status=PUBLISHED&upcoming=true&sort=startsAt&pageSize=100` (la page par défaut ne contient que 10 événements). Un agent qui scanne un événement qui n'est pas le sien reçoit **404**.

---

### 7.12 Documents de l'événement (onglet « Documents »)

Quatre PDF, au design de l'association, générés à la demande (aucun stockage). Remplace le texte « arrivent avec une prochaine version ».

1. **Afficher les cartes** : `GET /events/{id}/reports` → `data[]` (`kind`, `title`, `description`, `available`). Griser la carte si `available: false` (événement en brouillon ou droit manquant).
2. **Télécharger** : `GET /events/{id}/reports/{kind}` avec le jeton d'accès. Le navigateur ne peut pas ajouter l'en-tête `Authorization` à un simple lien : utiliser `fetch`, puis un blob.

```ts
const res = await fetch(`${API}/events/${id}/reports/${kind}`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) throw await res.json();               // { code, message }
const name = /filename="?([^";]+)/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `${kind}.pdf`;
const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await res.blob()), download: name });
a.click(); URL.revokeObjectURL(a.href);
```

| `kind` | Document | Droit requis | Fichier |
|---|---|---|---|
| `participants` | Liste des participants | `participant.export` | `liste-participants-<slug>-AAAAMMJJ.pdf` |
| `ticketing` | Rapport de billetterie | `finance.view` ou `order.read` | `rapport-billetterie-…` |
| `attendance` | Liste des présences | `checkin.view` | `liste-presences-…` |
| `payments` | Journal des paiements | `finance.view` ou `order.read` | `journal-paiements-…` |

**Erreurs** : 403 (droit manquant), 404, 409 (brouillon : rien à rapporter), 422 (plus de 3 000 lignes : message explicite), 429 (20/min, lire `Retry-After`). Prévoir un indicateur de chargement : la génération prend 2 à 6 s (davantage après une mise en veille du serveur).

**À savoir** : « billets vendus » compte tous les billets émis ; les billets annulés ou remboursés libèrent leur place et sont comptés à part ; les dates sont en heure du Bénin.

## 8. Sécurité côté interface

- Aucune clé secrète dans le code client. Seuls l'URL Supabase et la clé **anon** sont publiques.
- Ne jamais afficher un succès de paiement sur la base de l'URL de retour : toujours `GET /public/orders/{reference}`.
- Ne pas journaliser ni envoyer à un outil d'analyse les URL contenant `token=` ; le retirer de l'URL après lecture.
- Ne pas mettre `accessToken` ou le jeton Supabase dans `localStorage` si vous pouvez l'éviter : mémoire (store) ou cookie `httpOnly` géré par le SDK.
- Échapper tout texte venant de l'API (titres, descriptions, noms) ; ne jamais utiliser `{@html}` avec ces champs.
- Page d'achat : autoriser le script Turnstile dans la politique de sécurité du contenu (CSP).

---

## 9. Feuille de route (routes pas encore livrées)

Ces routes figuraient dans la première ébauche du contrat mais **ne sont pas en place** : elles ne sont donc pas dans `openapi.yaml`. Leurs formes ne sont **pas figées**.

| Besoin des maquettes | Routes prévues | Étape |
|---|---|---|
| Contrôle d'accès : admission exceptionnelle (`checkin.override`) | `POST /checkin/admit` | 6 |
| Présences | `GET /events/{id}/attendance` | 6 |
| Exports Excel / CSV d'autres listes (le PDF est livré, §7.12) | `POST /events/{id}/exports`, `GET /exports/{id}` | 6 |
| Communication | `GET /events/{id}/communication` | 6 |

**Ne recalculez jamais** les KPI côté client à partir des listes (risque d'écarts) : tous les chiffres du tableau de bord viennent de `GET /dashboard`.

---

## 10. Questions fréquentes

**Pourquoi un 404 et pas un 403 sur un événement ?** Pour ne pas révéler l'existence d'un événement hors du périmètre de l'utilisateur.

**Le bouton « Publier » doit-il apparaître pour un organisateur ?** Non (permission `event.publish` absente) ; il enregistre un brouillon qu'un administrateur ou le président publiera.

**Pourquoi `remaining` ne dépasse-t-il jamais 10 ?** Le stock exact n'est pas public.

**Combien de temps est réservée une place ?** 15 minutes (`reservedUntil`) ; réglable côté backend.

**Que faire si l'acheteur ferme la page de paiement ?** Rien : la réservation expire seule. S'il revient sur `/commande/…` avant l'expiration, proposer « Réessayer » (`retry-payment`).

**Peut-on tester les paiements ?** Oui : l'environnement de staging est branché sur le **bac à sable** FedaPay. Les numéros de test sont dans la documentation FedaPay ; aucun argent réel n'est débité.

**Comment signaler un écart entre le contrat et l'API ?** Envoyer la requête, la réponse reçue et la ligne concernée de `openapi.yaml` à l'équipe backend.

---

## 11. Évolution du contrat

- Version actuelle : **0.13.0** (voir `CHANGELOG.md`). Pendant la phase 0.x, des changements peuvent casser la compatibilité ; chacun est annoncé dans le changelog **avant** déploiement, avec la marche à suivre.
- Les ajouts (nouvelle route, nouveau champ facultatif en lecture) ne cassent rien : les ignorer est sans risque. Programmez vos lectures de façon tolérante (ne pas échouer sur un champ inconnu ni sur une valeur d'énumération inconnue : prévoir un affichage par défaut).
