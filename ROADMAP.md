# Roadmap / TODO

Ce qui reste à faire, dans l'ordre prévu. Pour le « pourquoi » et les décisions, voir [MEMORY.md](MEMORY.md).

## Ordre des branches

`B11` (sélection adresse) ✅ → **B12_CONTEXT** (contexte projet, en cours) → **B13_INVOICE** (refacto Invoice) → **B14_SHIPING** (frais de livraison dynamiques).

Raison de l'ordre INVOICE avant SHIPING : une fois `Invoice` structurée en line items (B13_INVOICE), ajouter le shipping comme line item additionnel devient trivial. Le faire avant compliquerait la migration.

---

## B13_INVOICE — Refacto facturation (`app/api/invoices/invoice.action.ts`)

Prévu **après** la couverture de tests (déjà en place). Mérite sa propre branche dédiée.

**Corrections techniques — ✅ FAIT (étape 1) :**
1. ✅ **Trou de permission** dans `createInvoiceAction` : **fonction supprimée** (orpheline + aucun check `userId === session.user.id`). Vérifié : en prod les invoices ne sont créées que par le webhook Stripe (`webhook/route.ts`, transaction `ownerId: null`).
2. ✅ **Format d'erreur** aligné sur le pattern basket : `console.error(error)` + `return { error: error instanceof Error ? error.message : "<fallback fr>" }` (string).
3. ✅ **Code mort** supprimé (`if (!invoice) throw...` après `prisma.update`).
4. ✅ **Typos** corrigées : `getUserInvoiceAction`, `getInvoiceAction`, `updateInvoiceAction`. Tests adaptés (`invoice.action.test.ts`).

**Évolution du modèle (vraie facture client) — étape 2, en cours :**

> Besoins détaillés en user stories (→ tests) : [docs/B13-invoice-user-stories.md](docs/B13-invoice-user-stories.md). Spec technique (contrats, modèle, numérotation, déclencheurs) : [docs/B13-invoice-spec.md](docs/B13-invoice-spec.md). Décisions actées : 1 facture/commande en line items, avoir = même modèle `Invoice` (`type = CREDIT_NOTE`), régime TVA en config snapshotée, anti-doublon via `unique([type, stripeSessionId])` / `unique(stripeRefundId)`.

5. ✅ **FAIT** — `1 invoice / artwork` → **1 facture / commande avec line items** :
   - ✅ **Numéro séquentiel** unique sans trou (table `Counter`, séries `INV-`/`CN-` par an).
   - ✅ **Snapshot vendeur** (SIRET, raison sociale, régime TVA) figé à l'émission via config.
   - ✅ **TVA par ligne** (franchise → mention 293 B ; 5,5 % prêt côté code).
   - ✅ **Conservation 10 ans** : aucune suppression de facture (pas d'action de suppression + `onDelete: Restrict` DB) ; pas de soft-delete (aucun cas d'usage de masquage).
   - ✅ **PDF** (« support durable », Code conso art. L221-13) — `renderInvoicePdf` (@react-pdf/renderer), joint à l'email.
6. ✅ **FAIT** — **Email facture client** (`sendInvoiceUserMail`, envoyé à l'émission depuis le webhook, **PDF joint**) ; remplace l'intérim reçu Stripe.

7. ✅ **FAIT (EPIC 5)** — **facture d'avoir** : `emitCreditNote` (avoir = `Invoice type=CREDIT_NOTE`, snapshot copié de l'origine, montants négatifs, série `CN-` gapless) + orchestration **`refundSale`** (remboursement après-vente : garde anti-doublon → `stripe.refunds.create` idempotent → avoir + remise en vente `ownerId: null` → email avoir `sendCreditNoteUserMail`).

8. ✅ **FAIT (EPIC 5)** — **server action `refundSaleAction`** : wrapper RBAC (`refund:invoice`, ADMIN) autour de `refundSale`, renvoie un résumé sérialisé.
9. ✅ **FAIT (US0.1)** — **validation config au boot** : `instrumentation.ts` appelle `getSellerConfig()` au démarrage (runtime nodejs) → l'app échoue tôt si `SELLER_*` absent/incohérent.
10. ✅ **FAIT (US6.2)** — **conservation 10 ans** : aucune suppression de facture (pas d'action de suppression + `onDelete: Restrict` DB). Pas de soft-delete : aucun cas métier de masquage (erreur → avoir).
11. ✅ **FAIT (UI admin)** — page `/admin/invoices` : liste ventes + avoirs, remboursement total ou partiel (sélection par œuvre, confirmation en deux temps), gating RBAC.

**B13_INVOICE : terminé** (logique + tests + UI). Prochaine branche : **B14_SHIPING**.

> Notes prod : migration destructive (ancien modèle `Invoice` incompatible — `npm run db:reset` en dev) ; variables d'env **`SELLER_*`** désormais requises pour que le webhook émette les factures (dev + prod, pas `.env.test` car mocké).

---

## B14_SHIPING — Frais de livraison dynamiques

À démarrer **après** le merge de B13_INVOICE.

> Recherche transporteurs (classiques + spécialisés œuvres d'art, agrégateurs, pricing, limites
> poids/dimensions) : [docs/B14-shipping-research.md](docs/B14-shipping-research.md).
> User stories (toutes décisions tranchées) : [docs/B14-shipping-user-stories.md](docs/B14-shipping-user-stories.md).
> Spec technique (contrats Prisma, cycle de vie, signatures) : [docs/B14-shipping-spec.md](docs/B14-shipping-spec.md).

**Statut : code applicatif complet (TDD, tests verts).** Reste = prérequis hors-code (compte Sendcloud) +
1 écran UI qui en dépend. Détail ci-dessous.

**✅ Fait (implémenté + testé) :**
- **Couche pure** (`src/lib/shipping/`) : `shippingConfig` (seuils env validés au boot via `instrumentation.ts`),
  `thresholds` (`exceedsStandardThresholds` + `computeRequiresSpecialistCarrier`), `cartShipping`
  (`computeCartShipping` : éligibilité, devis par œuvre, jamais 0 €).
- **Migration** `b14_shipping` : dims/poids + `requiresSpecialistCarrier` sur `Artwork` ; enums
  `FulfillmentMode`/`InvoiceLineItemType` ; `fulfillmentMode`/`pickupEmailSentAt` sur `Invoice` ;
  `type`+`shipping*` sur `InvoiceLineItem` ; `@@unique([invoiceId, artworkId, type])`.
- **Couche DB** : `emitSaleInvoice` (lignes SHIPPING + TVA) ; webhook (`createParcelsForInvoice` post-commit
  idempotent + `sendPickupCoordinationEmail`) ; `refundSale`/`emitCreditNote` (crédite ARTWORK+SHIPPING,
  corrige le bug de `Map` par artworkId, `cancelParcel` best-effort) ; `create-checkout-session`
  (`computeCartShipping`, devis gelé en metadata + lignes Stripe, rejets 400).
- **Flag spécialiste (US0.1/US5.1)** : recalcul à la création/édition d'œuvre + champs dims & bandeau sur le form admin.
- **Mails** : `shippingIncidentAdminMail`, `pickupCoordinationUserMail`.
- **UI checkout (EPIC E, US1bis)** : choix Livraison/Retrait, adresse de livraison conditionnelle,
  verrouillage retrait si œuvre hors gabarit.

**⏳ Reste à faire :**
- **Hors-code (spec §7), bloquant prod** : créer le compte Sendcloud + clés, **câbler `sendcloudClient`**
  (aujourd'hui stub `NOT_WIRED` qui lève — le checkout DELIVERY renvoie donc 400 tant que ce n'est pas fait ;
  seul le PICKUP marche de bout en bout) ; env `SHIPPING_MAX_WEIGHT_KG` / `SHIPPING_MAX_DIMENSION_SUM_CM`
  (dev + prod) ; CGV information rétractation (juriste).
- **UI sélection transporteur multi-offres (US2.4)** : gelée car elle suppose un endpoint de devis-preview
  appelant Sendcloud. Les offres uniques sont déjà auto-sélectionnées ; seul le cas « plusieurs offres »
  attend cet écran. À faire **après** le câblage Sendcloud.
- **Décisions 🔶 #4 (price-lock) / #6 (cancelParcel réel) / #7 (flux retour)** : à reconfirmer face à la doc
  Sendcloud au moment du câblage (cf. table « Décisions ouvertes » de la spec).

**Correction actée en spec (à ne pas réintroduire) :** `InvoiceLineItem.artworkId` reste **NOT NULL** même
pour les lignes `SHIPPING` (1 colis = 1 œuvre, jamais de ligne shipping agrégée multi-œuvres) — la
contrainte `@@unique([invoiceId, artworkId])` devient `@@unique([invoiceId, artworkId, type])`. Trouvé en
écrivant la spec : un `artworkId` nullable cassait le remboursement partiel par œuvre (US4.2).

**Nouveau (spec, EPIC 3bis)** : réservation de l'étiquette réelle chez Sendcloud **après** confirmation du
paiement (pas au devis) — le devis (gratuit, sans quota) sert au prix checkout ; seule la création du colis
consomme le quota/coût. Idempotence via `InvoiceLineItem.shippingParcelId`/`shippingParcelFailedAt`.

**Point encore ouvert à l'implémentation** (cf. spec, table « Décisions ouvertes ») : verrouillage de
prix Sendcloud entre devis et réservation (pas de mécanisme identifié, écart résiduel assumé).

**Décidé** : l'alerte admin sur échec de création de colis post-paiement (EPIC 3bis) passe par un mail
**dédié** `sendShippingIncidentAdminMail`, pas par réutilisation du mail B13 — qui a d'ailleurs été
**renommé** `sendIncidentAdminMail` → `sendCheckoutRaceIncidentAdminMail`
([src/lib/mail/checkoutRaceIncidentAdminMail.ts](src/lib/mail/checkoutRaceIncidentAdminMail.ts)) : son
nom générique masquait qu'il ne couvre qu'un seul cas précis (race au checkout, remboursement
issued/failed) — pas réutilisable tel quel pour un futur incident sans rapport (pas de remboursement, pas
de montant).

**Décisions clés (détail dans le doc user stories) :**
- **Scope MVP = agrégateur classique Sendcloud uniquement.** Pas de Convelio/spécialiste dans cette
  branche — différé à une itération ultérieure (flag `requiresSpecialistCarrier` réservé mais pas encore
  branché sur un appel API).
- **Retrait sur place** (pratique courante en vente d'art) : toujours proposé comme option à côté de la
  livraison, coordination par email après paiement (pas de créneaux gérés dans l'app). Devient
  **l'unique option** pour une œuvre hors des seuils transporteur standard (poids/dimensions) — ça lève le
  besoin de bloquer la vente de ces œuvres.
- **1 œuvre = 1 colis, toujours** (pas de mutualisation multi-œuvres — packing/marges de protection trop
  complexes à valider automatiquement).
- **1 seul mode de remise par commande** (livraison ou retrait, jamais mixte par œuvre) — simplicité avant
  flexibilité ; à revisiter si la demande se confirme.
- **TVA sur le shipping = même taux que le reste de la facture** (BOFIP art. 267 du CGI, pas un taux à
  part).
- **`InvoiceLineItem`** : nouvel enum `InvoiceLineItemType` (`ARTWORK`/`SHIPPING`), `artworkId` reste
  **NOT NULL** même pour les lignes `SHIPPING` (1 œuvre = 1 colis ; cf. [spec §0](docs/B14-shipping-spec.md)),
  contrainte `@@unique([invoiceId, artworkId, type])` — évolution non destructive du modèle B13.
- Alternative `shipping_options` natif Stripe : à évaluer, possiblement trop rigide pour le filtrage spécialistes.

---

## Transverse — Internationalisation (i18n)

Le site est en **français uniquement** aujourd'hui. L'ajout de l'**anglais** est prévu et considéré **nécessaire** (les acheteurs ne sont pas forcément francophones).

**Implications à ne pas oublier :**
- **Facture / avoir (B13)** : les documents client (PDF + email) devront être **traduisibles**. Les numéros utilisent déjà des préfixes neutres `INV-`/`CN-` (pas `F-`/`A-`) pour cette raison. Les **mentions légales FR** (ex. `art. 293 B du CGI`) restent en français même sur un document traduit (obligation légale française).
- Prévoir le choix de langue (UI + langue de communication par utilisateur) avant de multiplier les contenus en dur.
