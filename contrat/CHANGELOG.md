# Journal des changements de l'API

Format : le plus récent en premier. « Cassant » = nécessite une adaptation des interfaces.

## 0.7.0 — textes JCI par défaut et FAQ

**Comportement modifié** — *à adapter côté front* :
- `GET /public/events/{slug}` : `practicalInfo`, `ticketTerms`, `refundPolicy` ne sont **plus jamais `null`**. Si l'organisateur n'a rien rédigé, l'API renvoie le texte général JCI (avec les vraies valeurs : délai de réservation, maximum par commande, contact). Le front affiche donc toujours les 3 sections (la règle « masquer si `null` » de la 0.6.0 est supprimée). L'administration (`GET /events/{id}`) continue de renvoyer `null` pour un texte non rédigé.

**Champs ajoutés** — *additif* :
- `GET /public/events/{slug}` : `infoSources` (`event` ou `default` pour chacun des 3 textes) et `faq[]` (`question`, `answer`).
- `contactPhone` : numéro de l'événement, sinon celui de l'organisation ; `null` seulement si aucun n'est configuré.

**Configuration** : nouvelle variable facultative `ORG_CONTACT_PHONE` (ex. `+2290197000000`) dans `.env`. Redémarrer le backend.

**Migration** : aucune.

## 0.6.0 — page publique

**Champs ajoutés** — *additif, rien ne casse* :
- `GET /public/events/{slug}` : `category`, `accentColor`, `practicalInfo`, `ticketTerms`, `refundPolicy`. Le front n'affiche une section d'information que si son texte n'est pas `null`.
- `POST /events` et `PATCH /events/{id}` : `practicalInfo`, `ticketTerms`, `refundPolicy` (2 000 caractères maximum chacun ; une chaîne vide équivaut à `null`). Relus dans `GET /events/{id}`.

**Comportement** :
- `GET /public/events/{slug}` porte `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=60` sur les réponses réussies uniquement (jamais sur un 404).
- Le `slug` d'un événement n'est jamais modifiable (déjà le cas ; désormais garanti par des tests).

**Migration** : `20261110220000_event_public_texts` (3 colonnes facultatives sur `events`). À appliquer avec `npx prisma migrate deploy`.

## 0.5.0 — vue d'ensemble

**Nouvelle route** (50 au total) — *additif, rien ne casse* :
- `GET /events/{eventId}/overview` : KPI (recettes, visiteurs, billets émis / capacité, places restantes), ventes par catégorie, 10 dernières activités. `revenueXof` (KPI et catégories) est `null` sans `finance.view` / `order.read` ; `activity` est `null` sans `participant.read`.

## 0.4.0 — participants

**Nouvelles routes** (49 au total) — *additif, rien ne casse* :
- `GET /events/{eventId}/participants` : liste paginée de l'onglet « Participants » (`q`, `categoryId`, `presence`, `sort`, `dir`) ; `meta.counts` pour les pastilles.
- `GET /events/{eventId}/participants/export` : export CSV ou Excel (`format=csv|xlsx`), mêmes filtres, 10 000 lignes maximum, journalisé.
- `GET /tickets/{ticketId}` : fiche d'un billet (« Voir le billet ») avec historique des e-mails.

**Comportement** : le statut de livraison des e-mails (`emailStatus`) est maintenant exposé ; les droits `participant.read` et `participant.export` sont actifs.

## 0.3.0 — billets, e-mails, visuel de partage

**Nouvelles routes** (46 au total) :
- `GET /tickets/{ticketId}/files/{kind}` (`pdf` | `image` | `share`) : URL signée de 15 min ; `202 { status: "PENDING" }` tant que le fichier n'est pas prêt.
- `POST /tickets/{ticketId}/resend` : renvoi du billet par e-mail (202 ; 5 par heure et par billet).
- `POST /webhooks/brevo` : *interne* (suivi de livraison des e-mails).

**Changement de `GET /public/orders/{reference}`** — *additif, rien ne casse* : chaque élément de `tickets[]` gagne `filesReady`, `pdfUrl`, `imageUrl`, `shareVisualUrl` (liens `null` tant que `filesReady` vaut `false`).

**Comportement** :
- Un e-mail de confirmation (PDF en pièces jointes) part automatiquement après un paiement confirmé, et après une vente physique si `buyer.email` est fourni et `sendEmail` n'est pas `false`.
- `PhysicalSaleCreate.sendEmail` : l'e-mail nécessite maintenant `buyer.email` ; les fichiers sont générés dans tous les cas.
- **Nouvelle route à exposer côté public : `/billet/:token`** (cible du QR code).

## 0.2.0 — premier contrat transmis à l'équipe frontend

**Contenu** : 43 routes en place (compte, utilisateurs et rôles, événements, affiches, billetterie, commandes et paiements, ventes physiques, annulation de billets, page publique, achat et suivi de commande).

**Par rapport à l'ébauche 0.1.0 (non diffusée)** — *cassant uniquement si vous aviez commencé à vous baser sur l'ébauche* :
- Retrait des routes **pas encore en place** : tableau de bord, vue d'ensemble, participants, présences, communication, exports, fichiers de billets, renvoi de billet, contrôle d'accès, webhook Brevo. Elles sont listées dans `GUIDE_FRONTEND.md` §9.
- Format OpenAPI 3.0.3 (au lieu de 3.1) pour une meilleure compatibilité des outils.
- `POST /tickets/{id}/cancel` renvoie `{ ticketId, status }` (et non un détail de billet).
- `OrderDetail.tickets[]` : champs `ticketId`, `ticketNumber`, `fullName`, `phone`, `email`, `category`, `ticketStatus`, `checkedInAt`.
- `PublicOrderStatus.tickets[]` : `number`, `holderName`, `category` (les liens de fichiers arrivent à l'étape billets).
- `PhysicalBuyer` : téléphone et e-mail facultatifs (obligatoires pour un achat en ligne).
- Nouveaux statuts `REFUND_REQUIRED` (commande et paiement), nouveau code d'erreur `PAYMENT_PROVIDER_ERROR`.

**Ajouts facultatifs** (rétrocompatibles) :
- `GET /events` : paramètres `sort` (`startsAt`, `-startsAt`, `createdAt`, `-createdAt` ; défaut `-startsAt`) et `upcoming=true` (widget « Événements proches »).
- `GET /events/{id}/orders`, `/payments`, `/physical-sales` : `status=PENDING` (alias « En attente » = `PENDING_PAYMENT` + `PAYMENT_IN_PROGRESS`) ; `meta.statusCounts.PENDING` pour la pastille.
