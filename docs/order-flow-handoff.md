# Handoff — Incohérences du flux de commande utilisateur

Passation pour une session dédiée à **corriger des incohérences** dans le parcours de commande
(panier → paiement → facture → livraison/retrait → après-vente). Ce doc donne la **carte du flux**,
les **invariants à préserver**, et un **emplacement à remplir** avec les incohérences constatées.

> ⚠️ Section 3 (« Incohérences à traiter ») est **à compléter** par la développeuse avant de coder —
> c'est le vrai périmètre du travail. Le reste est du contexte.

---

## 1. Carte du flux (fichiers + phases + effets de bord)

| # | Phase | Fichier(s) clés | Ce qui se passe |
|---|---|---|---|
| 1 | **Panier** | `app/api/basket/basket.action.ts`, `Basket`/`BasketItem` (Prisma) | add/remove œuvres |
| 2 | **Page checkout** | `app/profile/checkout/page.tsx`, `src/components/checkout/CheckoutPanel.tsx`, `CheckoutButton.tsx` | choix adresses + **mode DELIVERY/PICKUP** ; `deliveryAvailable` (flag stocké) verrouille le retrait si œuvre hors gabarit |
| 3 | **Création session** | `app/api/stripe/create-checkout-session/route.ts` | valide auth/adresses/dispo → `computeCartShipping` (DELIVERY) → **gel du devis** dans `metadata` → `stripe.checkout.sessions.create` (lignes artwork **+ shipping**) → renvoie `url` |
| 4 | **Paiement** | Stripe Checkout (hébergé) | l'utilisateur paie |
| 5 | **Webhook** | `app/api/stripe/webhook/route.ts` | `checkout.session.completed` : idempotence → **transaction** (transfert `ownerId`, `soldItems`, race→`RefundRecovery`+refund, `emitSaleInvoice` lignes ARTWORK+SHIPPING, vidage panier) → **post-commit** : `sendInvoiceEmail`, `createParcelsForInvoice` (DELIVERY), `sendPickupCoordinationEmail` (PICKUP), `handleRefunds` |
| 6 | **Succès** | `app/profile/checkout/success/`, `SuccessPaymentPolling.tsx`, `app/api/invoices/by-session` | polling de la facture par `session_id` |
| 7 | **Annulation** | `app/profile/checkout/cancel/` | retour panier |
| 8 | **Après-vente** | `src/lib/invoice/refundSale.ts`, `emitCreditNote.ts`, page `/admin/invoices` | remboursement total/partiel → avoir + `cancelParcel` + remise en vente (`ownerId: null`) |

### Marqueurs d'état (où lire la vérité)
- `Artwork.ownerId` (null = dispo), `Invoice.status`, `Invoice.fulfillmentMode`
- Idempotence : `Invoice.emailSentAt`, `Invoice.pickupEmailSentAt`,
  `InvoiceLineItem.shippingParcelId` / `shippingParcelFailedAt`, `RefundRecovery.stripeRefundId`
- Snapshot légal figé : adresses `billing*`/`shipping*` + vendeur sur `Invoice`

---

## 2. Invariants à NE PAS casser (décisions actées)

- **Adresses = FK + snapshot** : le snapshot est la vérité légale figée ; la FK passe `null` si l'adresse
  est supprimée (B11).
- **1 facture / commande** en line items ; `artworkId` **NOT NULL** même sur les lignes SHIPPING
  (1 colis = 1 œuvre) ; `@@unique([invoiceId, artworkId, type])`.
- **Race « œuvre déjà vendue »** gérée par `RefundRecovery` (marqueur `stripeRefundId` null = à rejouer),
  pas de facture pour l'œuvre en race.
- **Devis transporteur gelé** dans les metadata Stripe (prix facturé = prix montré). Jamais de calcul à 0 €.
- **1 seul mode de remise / commande** (livraison OU retrait, jamais mixte).
- **Config shipping validée paresseusement** (pas au boot) ; `SELLER_*` validé au boot ; check strict au
  déploiement (`scripts/check-config.ts`).
- **TVA shipping = taux de la facture** ; le webhook doit répondre **200** vite à Stripe (effets de bord
  best-effort, jamais de crash).

---

## 3. Incohérences à traiter  ⚠️ À COMPLÉTER

> Lister ici chaque incohérence trouvée. Format suggéré par item :
> - **Symptôme** (ce qu'on observe) :
> - **Où** (page/route/fonction) :
> - **Attendu** (comportement correct) :
> - **Impact** (UX / argent / données) :

1. …
2. …
3. …

---

## 4. Zones où les incohérences se logent souvent (pistes, à confirmer)

- **Succès/annulation vs état réel** : la page succès (polling) et l'état facture/paiement peuvent
  diverger (ex. paiement OK mais facture pas encore émise, ou colis en échec → que voit l'utilisateur ?).
- **Cohérence adresses DELIVERY vs PICKUP** entre **UI** (`CheckoutPanel`), **route**
  (`create-checkout-session`) et **webhook** (snapshot) — en PICKUP l'adresse de livraison n'est pas requise.
- **Prix montré vs facturé vs affiché sur la facture** (shipping HT/TTC ; comportement en régime ASSUJETTIE).
- **Vidage du panier** : sur quels chemins exactement (succès, race partielle, échec) ?
- **Race partielle** : ce que l'utilisateur voit quand 1 œuvre sur N est remboursée.
- **Échec création colis post-paiement** : la vente réussit (facture OK) mais le colis est marqué en échec
  → aucun signal côté utilisateur (seulement mail admin) — est-ce cohérent avec ce qu'on veut ?

---

## 5. Méthode conseillée pour la nouvelle session

1. Lire cette carte + les invariants (§1–2).
2. Reproduire chaque incohérence de §3 (test rouge d'abord si possible — le repo est en TDD, DB docker
   port 5433 via `npm run test:db:up`).
3. Corriger en respectant les invariants ; ne pas ré-introduire de crash au boot pour de la config feature.
4. `npx tsc --noEmit` + `npm test` (217 tests actuels au vert) avant de conclure.
5. La dev gère commits/branches (nomenclature `Bxx : SUJET : type : desc`, messages en anglais).

> État repo au moment du handoff : B14_SHIPING complet et vérifié (Sendcloud câblé), 217 tests verts.
> Contexte projet : `CLAUDE.md`, `MEMORY.md`, `ROADMAP.md`, `docs/B14-shipping-spec.md`.
