# JCI Comé Excellence — Billetterie publique (SvelteKit, rendu serveur)

Application **séparée** du back-office (`jci-admin`), avec rendu côté serveur : les robots WhatsApp / Facebook
n'exécutent pas JavaScript, les balises Open Graph doivent donc être dans le HTML (guide §7.9).

Contrat : `contrat/openapi.yaml` **v0.7.0** · types : `npm run api:types`.

## Démarrer

```bash
npm install
cp .env.example .env     # renseigner PUBLIC_API_URL (sans /api/v1)
npm run dev              # http://localhost:5173/evenements/<slug>
npm run check && npm run build && npm start     # production (adapter-node, port 3000)
```

Variables : `PUBLIC_API_URL` (son origine est ajoutée automatiquement à la CSP, `connect-src` et `img-src`, à l’exécution : aucune adresse en dur), `PUBLIC_TURNSTILE_SITE_KEY` (étape achat), et en production derrière un proxy
`ORIGIN` (URL publique du site : sinon `og:url` et le partage sont faux), `ADDRESS_HEADER=X-Forwarded-For`, `XFF_DEPTH=1`.
`adapter-node` est un choix de départ : il se remplace en une ligne dans `svelte.config.js` selon l'hébergement.

### Si la page affiche « Un instant… / service momentanément indisponible »
Le serveur n'arrive pas à joindre l'API. La **cause exacte est écrite dans le terminal** où tourne `npm run dev`
(`[jci-public] GET … a échoué : …`). Causes usuelles : `.env` absent ou `PUBLIC_API_URL` vide (relancer `npm run dev` après l'avoir créé),
URL contenant déjà `/api/v1` (ne pas l'y mettre), API éteinte ou inaccessible depuis la machine.

## Étape 1 — Page événement `/evenements/[slug]`

- Rendu serveur + `<title>`, `description`, `og:*` (`og.title/description/imageUrl`) depuis `GET /public/events/{slug}`.
- **Cache serveur 60 s** par slug (`src/lib/server/eventCache.ts`) : N visites → 1 appel API (plafond 120/min/IP côté API).
  Les 404 sont gardés 15 s ; si l'API tombe, l'ancienne version est servie jusqu'à 5 min ; l'adresse du visiteur est transmise en `X-Forwarded-For`.
  La réponse HTML porte `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=60`.
- **Vue comptée par le navigateur** (`POST …/views`, une fois, dans `onMount`) — jamais pendant le rendu serveur.
- Fidèle à la maquette : carrousel (couverture chargée d'abord, suivante préchargée, autres à la demande ; autoplay 4,5 s,
  pause, flèches, swipe, `prefers-reduced-motion`, images paysage sur fond flou), pastilles catégorie / état, date en heure du Bénin,
  billets (prix « 3 000 FCFA », « Plus que N places » si `remaining` < 10 (10 = « 10 ou plus »), « Épuisé »), À propos, Programme (« 08h00 »), Organisé par,
  3 sections « Informations » repliables **toujours affichées** (depuis la 0.7.0 l'API renvoie le texte général JCI quand l'organisateur n'a rien écrit) + **FAQ** en accordéon (`faq[]`, masquée si vide), bouton WhatsApp (`wa.me/<chiffres>`, masqué si `contactPhone` null),
  barre fixe d'achat, bandeau d'annulation, mode sombre.
- États déduits de `status` / `salesStatus` (le sélecteur « Démonstration » de la maquette n'existe pas).
- Partage : `navigator.share`, sinon copie du lien.
- Sécurité : aucun `{@html}` sur des données API ; `accentColor` n'est accepté que s'il vaut `#RRGGBB` ;
  CSP (Turnstile déjà autorisé), `Referrer-Policy: no-referrer`, polices auto-hébergées (`@fontsource`).

## Étape 2 — Tunnel d'achat `/evenements/[slug]/billets → coordonnees → recap`

- **Pages rendues dans le navigateur** (`ssr = false` sur le groupe `(achat)`) : panier et saisie propres à chaque visiteur, rien de partagé côté serveur.
- **Billets** : stock rafraîchi à l'ouverture de l'étape (`GET` sans cache navigateur) ; steppers −/+ plafonnés par `maxPerOrder` (événement et catégorie)
  et par `remaining` quand il est exact (< 10) ; « Épuisé » sans stepper ; catégories `DISABLED` masquées ; billetterie fermée/annulée/complète → retour à la page événement.
- **Coordonnées** : acheteur (4 champs obligatoires) + un bénéficiaire par billet (prénom, nom) ; « Ce billet est pour moi » recopie l'acheteur tant qu'on n'édite pas le champ ;
  validation avec messages français, focus sur le premier champ en erreur, erreur effacée à la saisie ; les erreurs 422 de l'API (`tickets.0.firstName`…) s'affichent sous le bon champ.
- **Récapitulatif** : lignes, total, acheteur, participants, case « J'accepte… » obligatoire, **Cloudflare Turnstile** (mode `interaction-only`, jeton renouvelé après chaque envoi),
  `Idempotency-Key` (UUID) **conservée tant que le contenu de la commande est identique** (double clic, retour arrière depuis FedaPay → même commande) et renouvelée si le contenu change,
  puis redirection vers `checkoutUrl` (seulement en `https:`).
- Erreurs : 409 (`QUOTA_EXCEEDED`, `MAX_PER_ORDER_EXCEEDED` → lien « Modifier mes billets » ; `SALES_CLOSED` → retour à l'événement), 422, 429 (délai `Retry-After`), 502 (« aucune place retenue, réessayez »), `CAPTCHA_FAILED`.
- Le panier (données personnelles) est gardé en mémoire et dans `sessionStorage` de l'onglet ; **jamais** le jeton de suivi de commande.
- Sans `PUBLIC_TURNSTILE_SITE_KEY`, aucun captcha n'est demandé (développement seulement : l'API l'exige en production).

⚠️ Pour afficher le délai « Réessayez dans N secondes », le backend doit exposer `Retry-After` en CORS (`Access-Control-Expose-Headers`) ; sinon le message de l'API s'affiche tel quel.

## Étape 3 — Retour de paiement `/commande/[reference]?token=…`

- Page rendue dans le navigateur. Le **jeton est lu une fois, gardé en mémoire, puis retiré de la barre d'adresse** (avec `?status=…&id=…` ajoutés par FedaPay) ;
  `Referrer-Policy: no-referrer`. Jeton absent/invalide ou commande inconnue (404/422) : « Commande introuvable » (même message).
- **Jamais de « payé » sur la seule foi du retour** : interrogation de `GET /public/orders/{reference}` toutes les 3 s (15 s après 20 min ; `Retry-After` respecté sur 429),
  arrêt au statut final ; échecs réseau : on réessaie sans casser l'écran.
- `PENDING_PAYMENT` / `PAYMENT_IN_PROGRESS` : « Nous vérifions votre paiement » + compte à rebours de `reservedUntil` · `PAID` : « Paiement confirmé », « Préparation de vos billets… » tant que `filesReady` est faux,
  puis « Voir mes billets » (Image, PDF, Partager sur WhatsApp ; liens signés 15 min, renouvelés au retour sur l'onglet) · `FAILED` : `message` + « Réessayer le paiement » (`retry-payment`) tant que la réservation court ·
  `EXPIRED` : « Recommencer ma commande » (panier remis à zéro, nouvelle clé d'idempotence) · `REFUND_REQUIRED` : `message` seul, aucune relance · `REFUNDED` / `CANCELLED` : `message`.
- **Paiement annulé chez FedaPay** : la commande reste `PENDING_PAYMENT` côté serveur jusqu'à expiration (15 min). Si l'adresse de retour porte `?status=` autre que `approved` (indice, jamais une preuve), ou après 45 s sans confirmation, la page propose « Réessayer le paiement » (`retry-payment` reprend le même paiement, sans double débit) tout en continuant d'interroger.
- **Nettoyage de l'onglet** : dès qu'une commande est terminée (`PAID`, `EXPIRED`, `REFUND_REQUIRED`, `REFUNDED`, `CANCELLED`), panier, coordonnées, clés d'idempotence et mémoire de commande sont effacés (sinon un nouvel achat identique rejouerait l'ancienne commande, et les données resteraient sur un appareil peut-être partagé). `FAILED`/en attente : conservés pour réessayer. La clé d'idempotence est aussi renouvelée si elle a plus de 14 min.
- **Limites actuelles de l'API** (la réponse de suivi ne contient ni l'événement, ni l'e-mail, ni la date/le lieu, ni le QR) : l'adresse e-mail et l'événement sont retrouvés grâce à une mémoire de **l'onglet** créée au moment de la commande ;
  ouverte depuis un autre appareil, la page n'affiche pas l'adresse et masque « Retour à l'événement », « Réessayer » et « Recommencer » (aucune destination connue). Les cartes de billets n'ont pas de QR code (il est dans l'image et le PDF).
  Demande au backend : ajouter `eventSlug` (+ date, heure, lieu, contact) à `PublicOrderStatus`.
- Partage du visuel en pièce jointe (`navigator.share({ files })`) : renseigner `PUBLIC_FILES_ORIGIN` (origine du stockage, CSP) — et le CORS du stockage ; sinon le visuel s'ouvre dans un nouvel onglet.

## Étape 4 — Déploiement (Cloudflare Workers)

**Adresse retenue : `https://billets.jcicomee.org`** (le domaine racine `jcicomee.org` reste au site institutionnel).
Plan d'adresses : `jcicomee.org` (+ `www` redirigé) = site vitrine · `billets.jcicomee.org` = billetterie (ce projet) · `api.jcicomee.org` = backend · `admin.jcicomee.org` = espace administration.

### Mise en ligne
1. **Git** : `git init -b main && git add . && git commit -m "Billetterie JCI" ` puis créer un dépôt **privé** sur GitHub et `git remote add origin … && git push -u origin main`. (`.env` et `.wrangler/` sont ignorés ; seul `.env.example` est versionné.)
2. **Cloudflare** → Workers & Pages → *Create* → *Import a repository* → ce dépôt. Commande de build : `npm run build` · commande de déploiement : `npx wrangler deploy`. Le nom du Worker doit correspondre à `name` dans `wrangler.jsonc` (`jci-billetterie`).
3. **Variables** (Settings → Variables and Secrets, à renseigner aussi dans la section *Build*, car `PUBLIC_*` est lu à la construction) : `PUBLIC_API_URL`, `PUBLIC_TURNSTILE_SITE_KEY`, `PUBLIC_SITE_URL`, (facultatif) `PUBLIC_FILES_ORIGIN`. Les valeurs par défaut sont dans `wrangler.jsonc`.
4. **Domaine** : `wrangler.jsonc` déclare `billets.jcicomee.org` en *custom domain* ; Cloudflare crée l'enregistrement DNS et le certificat tout seul (la zone doit être sur le même compte Cloudflare).
5. **Turnstile** : ajouter `billets.jcicomee.org` aux noms d'hôte du widget.
6. Sans Git : `npm run deploy` (nécessite `npx wrangler login`).

### À faire côté backend / services (indispensable)
- **CORS** : autoriser `https://billets.jcicomee.org` (et `https://admin.jcicomee.org`) et exposer l'en-tête `Retry-After`.
- Adresse de retour FedaPay du backend (`PUBLIC_WEB_URL` ou équivalent) = `https://billets.jcicomee.org`.
- Supabase (admin) : ajouter `https://admin.jcicomee.org` aux *Redirect URLs* / *Site URL*.
- FedaPay : passer en clés de production ; Brevo : authentifier le domaine (SPF/DKIM/DMARC dans la zone DNS).

### SEO / sécurité intégrés
Balises Open Graph + Twitter, `canonical`, JSON-LD `schema.org/Event`, image de partage par défaut (`/og-default.png`), favicons, `robots.txt` et `sitemap.xml` générés (liste `GET /public/events?when=all`, `lastmod` = `updatedAt`, cache 5 min) ; pages tunnel et commande en `noindex` (en-tête + balise) ; HSTS, Permissions-Policy, Referrer-Policy, CSP bâtie depuis `PUBLIC_API_URL`. `/` est la page d'accueil de la billetterie (événements à venir, `GET /public/events`, cache 60 s, pagination `?page=`) ; son pied de page renvoie vers `PUBLIC_SITE_URL`.

**Google** : ajouter `billets.jcicomee.org` dans Search Console (propriété « Domaine », validation DNS) puis soumettre `https://billets.jcicomee.org/sitemap.xml`.
Les pages événement sont mises en cache 60 s par le cache Cloudflare (`s-maxage=60`) et par le Worker.

### Tester en local sous le runtime Cloudflare
`npm run preview` (build + `wrangler dev`). Tests : `BASE=http://localhost:8787 NO_PROXY=127.0.0.1,localhost node tests/e2e.mjs` (idem `e2e-achat.mjs`, `e2e-retour.mjs`, `e2e-accueil.mjs`) avec `node tests/mock-api.mjs` lancé. Supprimer `.wrangler/` entre deux builds (cache local).

## Tests

`tests/run.sh [dossier-captures]` lance un faux backend (`tests/mock-api.mjs`, port 4010) + le serveur de dev, puis `tests/e2e.mjs`
(Playwright : rendu, états, carrousel, cache, XSS, 404/503, mobile, mode sombre). Playwright doit être installé globalement.
Ces tests utilisent un faux backend : **à rejouer sur l'API réelle (staging)**.

## À venir (étapes suivantes, après validation)

`/billet/[token]` (page du QR code).
