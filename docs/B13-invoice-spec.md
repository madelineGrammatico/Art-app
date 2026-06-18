# B13_INVOICE — Spec technique (étape 2)

Contrats figés pour écrire les tests, puis l'implémentation. Découle des user stories
([B13-invoice-user-stories.md](B13-invoice-user-stories.md)) et du flux Stripe réel
([webhook/route.ts](../app/api/stripe/webhook/route.ts)).

> Statut : **validée** — toutes les décisions sont tranchées (✅).
>
> **Implémenté (EPIC 0/1/2/3/4/5 + immuabilité 6)** : modèle `Invoice`/`InvoiceLineItem`/`RefundRecovery` + `Counter` ; `sellerConfig` ; `numbering` (gapless + concurrent) ; `emitSaleInvoice` ; webhook réécrit (1 facture multi-lignes + `RefundRecovery` pour le cas race) ; `by-session` + page success + `invoice.action` + `certificate.action` adaptés ; `updateInvoiceAction` supprimée (immuabilité) ; snapshot `buyerName` ; `invoiceViewModel` (mentions obligatoires) ; **email facture** (`sendInvoiceUserMail`) **avec PDF joint** (`renderInvoicePdf`, @react-pdf/renderer) envoyé une fois à l'émission — remplace l'intérim reçu Stripe. **EPIC 5** : `emitCreditNote` (avoir, snapshot copié de l'origine, montants négatifs, série `CN-` gapless) + orchestration `refundSale` (garde anti-double-remboursement → `stripe.refunds.create` idempotent → transaction `emitCreditNote` + remise en vente `ownerId: null` → email avoir) + `sendCreditNoteUserMail`. Tests verts.
>
> **EPIC 5 (suite)** : **server action `refundSaleAction`** (`invoice.action.ts`) — wrapper RBAC `refund:invoice` (ADMIN) autour de `refundSale`, renvoie un résumé sérialisé (pas de Decimal au-delà de la frontière).
>
> **Reste à faire** : **UI admin** de remboursement (différée) ; câblage **validation config au boot** (US0.1) ; **conservation/soft-delete** (US6.2).

---

## 0. Distinction fondamentale : deux remboursements ≠ deux mécanismes

Le webhook actuel mélange deux cas sous le même `status: REFUNDED`. La spec les sépare :

| Cas | Quand | Sur la facture ? | Avoir ? |
|---|---|---|---|
| **Remboursement au checkout** (race : œuvre déjà vendue, `transferred.count === 0`) | À `checkout.session.completed` | **Non** : la vente n'a pas eu lieu → pas de line item | **Non** (rien n'a été facturé) |
| **Remboursement après-vente** (retour client / décision admin sur une œuvre réellement vendue) | Plus tard, action admin | La ligne existe sur une facture finalisée | **Oui** → facture d'avoir |

Conséquences :
- La **facture de vente ne contient que les œuvres réellement transférées**. Si 0 transférée → **aucune facture** (tout est remboursé, rien n'est vendu).
- L'**avoir** (EPIC 5) concerne **uniquement** le remboursement après-vente. Ce flux **n'existe pas encore** dans le code → c'est de la fonctionnalité nouvelle (cf. §6, impacte le go/no-go 🔶).
- Le **marqueur de récupération crash** du cas race ne peut plus vivre sur la facture (puisque l'œuvre non vendue n'a pas de facture) → table dédiée (§4).

---

## 1. Modèle Prisma cible

```prisma
enum InvoiceType { SALE CREDIT_NOTE }

model Invoice {
  id        String      @id @default(uuid())
  type      InvoiceType
  number    String      @unique          // attribué à la création, jamais null (cf. §3)
  issuedAt  DateTime    @default(now())
  saleDate  DateTime                     // date de la vente (= paiement) ; sur l'avoir = date du remboursement

  buyerId   String
  buyer     User        @relation(fields: [buyerId], references: [id], onDelete: Restrict)

  // Lien d'avoir : null pour une vente ; pointe la facture créditée pour un avoir.
  creditedInvoiceId String?
  creditedInvoice   Invoice?  @relation("Credits", fields: [creditedInvoiceId], references: [id])
  creditNotes       Invoice[] @relation("Credits")

  // Refs Stripe (clés d'idempotence)
  stripeSessionId       String?   // SALE
  stripePaymentIntentId String?
  stripeRefundId        String?   // CREDIT_NOTE

  // Snapshot vendeur (figé à l'émission — cf. §2)
  sellerName        String
  sellerLegalForm   String
  sellerAddress     String
  sellerSiret       String
  sellerRcs         String?
  sellerVatNumber   String?
  vatRegime         String        // "FRANCHISE" | "ASSUJETTIE"
  legalMention      String?       // ex. "TVA non applicable, art. 293 B du CGI"

  // Snapshot adresses acheteur (porté de B11)
  billingAddressId  String?
  billingAddress    PostalAddress? @relation("InvoiceBilling", fields: [billingAddressId], references: [id], onDelete: SetNull)
  billingStreet     String?
  billingPostalCode String?
  billingCity       String?
  billingCountry    String?
  shippingAddressId  String?
  shippingAddress    PostalAddress? @relation("InvoiceShipping", fields: [shippingAddressId], references: [id], onDelete: SetNull)
  shippingStreet     String?
  shippingPostalCode String?
  shippingCity       String?
  shippingCountry    String?

  // Totaux (Decimal, figés)
  totalHT  Decimal
  totalVat Decimal
  totalTTC Decimal

  lineItems InvoiceLineItem[]
  createdAt DateTime @default(now())

  @@unique([type, stripeSessionId])   // 1 facture de vente / session
  @@unique([stripeRefundId])          // 1 avoir / remboursement Stripe
  @@index([buyerId])
  @@index([creditedInvoiceId])
}

model InvoiceLineItem {
  id          String   @id @default(uuid())
  invoiceId   String
  invoice     Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Restrict)
  artworkId   String
  artwork     Artwork  @relation(fields: [artworkId], references: [id])
  label       String   // snapshot du titre de l'œuvre à l'émission
  unitPriceHT Decimal
  quantity    Int      @default(1)
  vatRate     Decimal  // 0 en franchise, 0.055 en assujettie 5,5 %
  vatAmount   Decimal
  lineTTC     Decimal

  @@unique([invoiceId, artworkId])   // une œuvre n'apparaît pas 2× dans un document
}

// Marqueur de récupération crash POUR LE CAS RACE (découplé des factures, cf. §0)
model RefundRecovery {
  id              String   @id @default(uuid())
  stripeSessionId String
  artworkId       String
  amount          Decimal
  stripeRefundId  String?  // null = remboursement non confirmé → à rejouer
  createdAt       DateTime @default(now())

  @@unique([stripeSessionId, artworkId])
}
```

**Pas de champ `status`.** Une facture de vente existe *uniquement* si la vente a eu lieu → toujours « finalisée ». L'état « remboursée » se **déduit** de l'existence d'un avoir (`creditNotes` non vide). Le `PENDING`/`PAID`/`REFUNDED` actuel disparaît.

---

## 2. Config vendeur + snapshot (EPIC 0)

- `src/lib/invoice/sellerConfig.ts` : lit les variables d'env (`SELLER_NAME`, `SELLER_SIRET`, `SELLER_VAT_REGIME`, `SELLER_VAT_NUMBER`, …), **validées par Zod au chargement** → l'app crash au boot si invalide/incohérent (`ASSUJETTIE` sans `vatRate`, etc.).
- À l'émission, ces valeurs + le `vatRate` + la `legalMention` sont **copiées** sur la facture. Modifier l'env ensuite ne touche aucune facture passée.
- `legalMention` = `"TVA non applicable, art. 293 B du CGI"` quand `vatRegime === "FRANCHISE"`, sinon `null`.

---

## 3. Numérotation 🔶

**Décidé** :
- **Séries séparées par type et par année**, format `INV-2026-000001` (vente) / `CN-2026-000001` (avoir).
- Préfixes en **anglais** (`INV` = Invoice, `CN` = Credit Note) : le numéro s'imprime sur un document client et l'acheteur n'est pas forcément francophone (i18n anglais prévue plus tard). Les identifiants restent l'enum `InvoiceType { SALE, CREDIT_NOTE }`.
- Conforme : chronologique + sans trou *par série* (la loi autorise des séries distinctes).

**Algorithme gapless concurrent** (le point délicat) :
```
model Counter { key String @id  value Int }   // key = "INV:2026", "CN:2026"
```
- `nextInvoiceNumber(tx, type, year)` : `UPDATE Counter SET value = value + 1 ... RETURNING value` **dans la même transaction** que la création de la facture.
- **Sans trou** : un rollback de la transaction annule aussi l'incrément (impossible avec une `SEQUENCE` Postgres native, qui laisse des trous au rollback → on n'en utilise pas).
- **Concurrence** : l'`UPDATE` pose un verrou de ligne sur le compteur → les émissions concurrentes se sérialisent. Volume galerie = négligeable.

---

## 4. Cycle de vie / déclencheurs

**A. Émission facture de vente** — `checkout.session.completed` (webhook), dans la transaction existante :
1. Pour chaque `artworkId` : tentative de transfert (`updateMany ownerId: null → buyerId`).
2. Transférées → **line items** ; non transférées → `RefundRecovery` + `failures` (remboursement Stripe via `handleRefunds`, inchangé).
3. Si ≥ 1 transférée → `emitSaleInvoice(tx, …)` : calcule totaux (§5), réserve le numéro (§3), crée `Invoice(type: SALE)` + line items.
4. Si 0 transférée → pas de facture.
5. Email facture (EPIC 3) après commit.

**B. Émission avoir** — flux après-vente (§6), ✅ implémenté :
- `emitCreditNote(tx, { originalInvoiceId, items, stripeRefundId, saleDate })` → `Invoice(type: CREDIT_NOTE)`, montants négatifs, `creditedInvoiceId` renseigné, série `CN-` (gapless). Snapshot (vendeur/acheteur/adresses/régime) **copié de la facture d'origine** (immuabilité), pas relu de la config.
- Orchestré par `refundSale({ invoiceId, artworkIds? })` : garde anti-double-remboursement → `stripe.refunds.create` (clé idempotence `credit-<invoiceId>-<artworkIds triés>`) → transaction `emitCreditNote` + remise en vente (`ownerId: null` si encore détenue par l'acheteur) → email `sendCreditNoteUserMail`. **Ordre Stripe-d'abord** : l'avoir exige un `stripeRefundId` non-null ; un crash avant la transaction est rejouable (Stripe idempotent + `@@unique(stripeRefundId)`).

**C. Récupération crash (cas race)** : basée sur `RefundRecovery.stripeRefundId === null` (au lieu de l'invoice REFUNDED). Logique de replay identique à aujourd'hui, source changée.

---

## 5. Calcul des montants ✅ (règle d'arrondi)

**Décidé** : **arrondi par ligne**, demi-supérieur (commercial), 2 décimales.
```
lineHT  = unitPriceHT * quantity
vatAmount = round(lineHT * vatRate, 2)      // 0 en franchise
lineTTC = lineHT + vatAmount
totalHT  = Σ lineHT ; totalVat = Σ vatAmount ; totalTTC = Σ lineTTC
```
- Decimal Prisma partout ; conversion `Number(...)` seulement à la sérialisation client (convention projet).

---

## 6. Avoir / remboursement après-vente ✅ (go)

**Constat** : il n'existe aujourd'hui **aucun** flux de remboursement après-vente (le seul remboursement est le cas race au checkout). L'avoir conforme implique donc de **construire ce flux** : déclencheur admin → `stripe.refunds.create` → `emitCreditNote` + (re)mise en vente de l'œuvre (`ownerId: null`) + email.

**Décidé : go.** Toute la conception d'immuabilité en dépend. Périmètre B13 : **modèle + `emitCreditNote` + `refundSale` + `refundSaleAction` (RBAC) + tests** ✅ ; seule l'**UI admin** de déclenchement reste **différée** (`refundSaleAction` est le point d'entrée RBAC, testable sans écran).

---

## 7. Signatures (contrats pour les tests)

```ts
// src/lib/invoice/sellerConfig.ts
export function getSellerConfig(): SellerConfig            // throw au boot si invalide

// src/lib/invoice/numbering.ts
export function nextInvoiceNumber(tx, type: InvoiceType, year: number): Promise<string>

// src/lib/invoice/emitSaleInvoice.ts
export function emitSaleInvoice(tx, args: {
  buyerId; stripeSessionId; stripePaymentIntentId;
  soldItems: { artworkId; label; unitPriceHT }[];
  billing; shipping; saleDate;
}): Promise<Invoice>

// src/lib/invoice/emitCreditNote.ts
export function emitCreditNote(tx, args: {
  originalInvoiceId; items: { artworkId }[]; stripeRefundId; saleDate;
}): Promise<Invoice & { lineItems }>

// src/lib/invoice/refundSale.ts  (orchestration ; UI admin différée)
export function refundSale(args: {
  invoiceId; artworkIds?;   // artworkIds omis ⇒ remboursement total
}): Promise<Invoice & { lineItems }>   // throw RefundSaleError si invalide / déjà remboursé

// src/lib/invoice/invoiceViewModel.ts
export function invoiceViewModel(invoice: InvoiceWithLines): InvoiceViewModel
// → objet contenant TOUTES les mentions obligatoires ; le PDF le consomme.

// Lectures (existantes, à étendre avec include lineItems) :
getUserInvoiceAction(userId), getInvoiceAction(invoiceId)   // updateInvoiceAction supprimée (immuabilité)
```

---

## 8. Stratégie de test du PDF (EPIC 3)

On **ne teste pas le binaire PDF** (extraction de texte = fragile). On teste `invoiceViewModel()` :
chaque mention obligatoire (§ checklist user stories) = une assertion sur le view-model. Le rendu PDF
(lib à choisir) n'est qu'un gabarit qui consomme ce view-model, testé séparément/visuellement.

---

## 9. Impacts migration & nettoyage

- **`updateInvoiceAction` supprimée** : une facture finalisée est immuable (EPIC 6).
- **`InvoiceStatus` / champ `status`** : retirés. Le `checkout.session.expired` → `deleteMany({ status: PENDING })` devient **caduc** (plus aucun créateur de `PENDING` depuis la suppression de `createInvoiceAction` en étape 1) → à retirer.
- **`@@unique([stripeSessionId, artworkId])`** sur Invoice → remplacé par les nouvelles contraintes (la dédup par œuvre passe sur `InvoiceLineItem` et `RefundRecovery`).
- **`app/api/invoices/by-session`** : aujourd'hui il liste PAID/REFUNDED par session. Avec le nouveau modèle, les remboursés-au-checkout ne sont plus des invoices → ✅ **décidé** : l'affichage « ce qui a été remboursé » lit `RefundRecovery` (hors cœur B13).
- **Tests à réécrire** : `invoice.action.test.ts`, `by-session/route.test.ts`, et la partie invoices de `webhook/route.test.ts` (le webhook crée désormais 1 facture multi-lignes + `RefundRecovery`).

---

## Décisions ouvertes (récap)

| # | Décision | Proposition |
|---|---|---|
| ✅ 1 | Format/algo numérotation | **Décidé** : séries `INV-`/`CN-` par an, compteur en table (gapless) |
| ✅ 2 | Règle d'arrondi | **Décidé** : par ligne, demi-supérieur, 2 décimales |
| ✅ 3 | Go/no-go avoir après-vente | **Décidé : go** (modèle + `emitCreditNote` + tests ; UI admin différée) |
| ✅ 4 | Affichage « remboursé » dans by-session | **Décidé** : lire `RefundRecovery` — hors cœur B13 |

À fournir aussi (config, pas du code) : `SELLER_*` (SIRET, raison sociale, RCS, n° TVA), à reconfirmer le régime/seuil avec le comptable.
