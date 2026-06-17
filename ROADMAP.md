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
   - ⏳ **Conservation 10 ans** structurée (soft-delete) — reste à faire.
   - ✅ **PDF** (« support durable », Code conso art. L221-13) — `renderInvoicePdf` (@react-pdf/renderer), joint à l'email.
6. ✅ **FAIT** — **Email facture client** (`sendInvoiceUserMail`, envoyé à l'émission depuis le webhook, **PDF joint**) ; remplace l'intérim reçu Stripe.

**Reste à faire (étape 2) :** facture d'avoir `emitCreditNote` + flux remboursement après-vente (EPIC 5), validation config au boot (US0.1), conservation/soft-delete (US6.2), UI admin de remboursement.

> Notes prod : migration destructive (ancien modèle `Invoice` incompatible — `npm run db:reset` en dev) ; variables d'env **`SELLER_*`** désormais requises pour que le webhook émette les factures (dev + prod, pas `.env.test` car mocké).

---

## B14_SHIPING — Frais de livraison dynamiques

À démarrer **après** le merge de B13_INVOICE.

**Inputs du calcul :**
- Adresse de livraison (déjà dispo depuis B11).
- **Dimensions + poids** → champs **à ajouter** sur `Artwork` (absents aujourd'hui).
- Optionnel : transporteur choisi par l'utilisateur.

**Intégrations :**
- SDK transporteurs standards (DHL, La Poste, Mondial Relay… — à finaliser).
- **Recherche à faire** : transporteurs **spécialisés œuvres d'art** (pièces volumineuses/lourdes/fragiles — ex. Convelio, MTAB, Crown Fine Art). Marché à part, à scoper avant de figer le schéma `Artwork` (éviter une double migration).

**Contrainte produit clé :** sur le dashboard admin (création/édition d'œuvre), prévoir une **option pour restreindre la livraison aux transporteurs spécialisés** quand la pièce est trop volumineuse/lourde/fragile. → flag `requiresSpecialistCarrier: Boolean` (ou équivalent) sur `Artwork`, qui filtre les transporteurs proposés au checkout.

**Intégration Stripe :**
- Shipping comme **`line_item` additionnel** sur la session Checkout (cohérent avec les line items de B13_INVOICE).
- Alternative `shipping_options` natif Stripe : à évaluer, possiblement trop rigide pour le filtrage spécialistes.

---

## Transverse — Internationalisation (i18n)

Le site est en **français uniquement** aujourd'hui. L'ajout de l'**anglais** est prévu et considéré **nécessaire** (les acheteurs ne sont pas forcément francophones).

**Implications à ne pas oublier :**
- **Facture / avoir (B13)** : les documents client (PDF + email) devront être **traduisibles**. Les numéros utilisent déjà des préfixes neutres `INV-`/`CN-` (pas `F-`/`A-`) pour cette raison. Les **mentions légales FR** (ex. `art. 293 B du CGI`) restent en français même sur un document traduit (obligation légale française).
- Prévoir le choix de langue (UI + langue de communication par utilisateur) avant de multiplier les contenus en dur.
