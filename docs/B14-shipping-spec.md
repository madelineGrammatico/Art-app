# B14_SHIPING — Spec technique (étape 3)

Contrats figés pour écrire les tests, puis l'implémentation. Découle des user stories
([B14-shipping-user-stories.md](B14-shipping-user-stories.md)), de la recherche transporteurs
([B14-shipping-research.md](B14-shipping-research.md)) et du flux Stripe réel
([create-checkout-session/route.ts](../app/api/stripe/create-checkout-session/route.ts),
[webhook/route.ts](../app/api/stripe/webhook/route.ts)). Modèle sur
[B13-invoice-spec.md](B13-invoice-spec.md).

> Statut : **implémenté, testé, et Sendcloud câblé + vérifié en réel** (juin 2026) — devis v3, création de
> colis v3, annulation v2 testés contre un vrai compte. Reste : poser les valeurs d'env en prod et les CGV
> rétractation (juriste). Décisions #4/#6 tranchées. Détail & restes → [ROADMAP.md](../ROADMAP.md).
>
> **MàJ juillet 2026 (correction incohérences flux acheteur, cf. [order-flow-handoff.md](order-flow-handoff.md) §3) :**
> - **Dimensions colis distinctes de l'œuvre** : le devis et les seuils se calculent désormais sur des champs
>   dédiés `Artwork.packageWeightKg/packageLengthCm/packageWidthCm/packageHeightCm` (obligatoires, = colis
>   emballé). Les `weightKg/lengthCm/widthCm/heightCm` restent sur `Artwork` mais deviennent **descriptifs**
>   de l'œuvre nue (toujours **obligatoires à la saisie**) et n'entrent plus dans le calcul. Partout où
>   §1–§3 ci-dessous disent « dimensions de l'œuvre » pour le devis/les seuils, lire **`package*`**.
> - **UI multi-offres US2.4 construite** : endpoint `POST /api/shipping/quote` + sélection transporteur par
>   œuvre affichée au checkout (prix montré avant paiement). Le défaut curé (`selectPreferredRate`) reste le
>   repli serveur si aucune sélection n'est transmise.

---

## 0. Incohérence trouvée en écrivant la spec : `artworkId` nullable sur les lignes SHIPPING

Les user stories actent : *« `artworkId` devient nullable uniquement pour les lignes `SHIPPING` »* — une
ligne SHIPPING serait donc **non rattachée à une œuvre précise**, comme si le shipping était un coût
global de commande.

Mais US4.2 (remboursement partiel) exige l'inverse : *« un remboursement partiel (1 œuvre sur plusieurs, 1
colis chacune) rembourse exactement le colis correspondant »*. Avec `artworkId = null` sur la ligne
SHIPPING, **impossible de savoir quel colis correspond à quelle œuvre** — il n'y a qu'un seul total
shipping agrégé, pas de granularité par œuvre.

**Proposition (à valider) — corriger la décision : `artworkId` reste `NOT NULL` sur les lignes SHIPPING**,
et pointe l'œuvre dont la ligne représente le colis. C'est cohérent avec la règle « 1 œuvre = 1 colis,
toujours » déjà actée : chaque œuvre livrée génère exactement 2 lignes (1 `ARTWORK` + 1 `SHIPPING`), toutes
deux rattachées au même `artworkId`. Ça rend le remboursement partiel par œuvre trivial (rembourser les 2
lignes du même `artworkId`) sans rien inventer de plus.

Conséquence sur la contrainte d'unicité : `@@unique([invoiceId, artworkId])` doit devenir
`@@unique([invoiceId, artworkId, type])` pour autoriser les 2 lignes (ARTWORK + SHIPPING) par œuvre sur la
même facture.

> Si validé, à reporter dans [B14-shipping-user-stories.md](B14-shipping-user-stories.md) (§ Décisions
> actées + modèle cible) pour ne pas garder une contradiction entre les deux docs.

---

## 1. Modèle Prisma cible (delta sur le schéma actuel)

```prisma
model Artwork {
  // ... champs existants inchangés ...

  weightKg Decimal? // kg — requis pour devis transporteur (EPIC 0)
  lengthCm Decimal?
  widthCm  Decimal?
  heightCm Decimal?

  // Recalculé à chaque create/update (cf. §3) à partir des seuils de config courants.
  // Sert à l'affichage admin (US5.1) et au futur routing Convelio (US1.2, différé).
  // Important : ce n'est PAS la source de vérité au moment du checkout (cf. §3 — staleness).
  requiresSpecialistCarrier Boolean @default(false)
}

enum FulfillmentMode {
  DELIVERY
  PICKUP
}

enum InvoiceLineItemType {
  ARTWORK
  SHIPPING
}

model Invoice {
  // ... champs existants inchangés ...

  fulfillmentMode FulfillmentMode @default(DELIVERY)

  // Idempotence de l'email de coordination retrait (US1bis.3) — même pattern que `emailSentAt`.
  // null tant que PICKUP n'a pas encore déclenché l'email ; non pertinent si DELIVERY.
  pickupEmailSentAt DateTime?
}

model InvoiceLineItem {
  // ... champs existants inchangés ...

  type      InvoiceLineItemType @default(ARTWORK)
  artworkId String               // reste NOT NULL même pour SHIPPING (cf. §0)

  // Renseigné uniquement quand type = SHIPPING :
  shippingMethodId       String?    // id du service transporteur retenu au devis (ex. id Sendcloud)
  shippingParcelId       String?    // id du colis créé chez le transporteur — idempotence EPIC 3bis
  shippingParcelFailedAt DateTime?  // marqueur d'échec de création post-paiement, pour alerte admin

  @@unique([invoiceId, artworkId, type]) // remplace l'unique actuel ([invoiceId, artworkId])
}
```

**Pas de nouveau modèle `Shipment`.** Les 3 champs `shipping*` ajoutés sur `InvoiceLineItem` suffisent à
couvrir devis (`shippingMethodId`) + idempotence de la réservation post-paiement (`shippingParcelId`) +
visibilité d'échec (`shippingParcelFailedAt`), sans dupliquer ce qui est déjà sur la ligne (`label`,
`unitPriceHT`, `lineTTC` portent déjà le prix et le libellé du transporteur, ex. *"Livraison — Colissimo
Domicile"*).

---

## 2. Config seuils transporteur standard (EPIC 0/1)

`src/lib/shipping/shippingConfig.ts` — même pattern Zod que `sellerConfig.ts`, mais validé
**paresseusement** (à l'usage), **pas au boot** : c'est de la config de feature, une absence ne doit pas
faire tomber tout le site (cf. décision d'archi ci-dessous) :

```ts
export type ShippingConfig = {
  maxWeightKg: number
  maxDimensionSumCm: number // L + l + h
}

export function parseShippingConfig(env: Record<string, string | undefined>): ShippingConfig
export function getShippingConfig(): ShippingConfig // lève (Error lisible) à l'usage si absent/invalide
```

> **Décision d'archi (post-implé) : config de feature validée à l'usage, pas au boot.** `instrumentation.ts`
> ne valide au démarrage que `SELLER_*` (config app-wide). `getShippingConfig`/`getSendcloudConfig` sont
> appelés au point d'entrée de la feature (checkout, webhook, édition d'œuvre) → une config shipping
> incomplète ne dégrade que la livraison/les colis, jamais tout le site. **`SELLER_*` reste au boot** :
> consommé dans la transaction de paiement, un échec paresseux créerait un « payé mais rien livré » ; crasher
> fort au boot (checkout inclus → personne ne paie) est le mode d'échec le plus sûr pour la config qui traite
> l'argent. La garantie prod réelle = un check de config en CI/pré-déploiement (à ajouter).

Env requis : `SHIPPING_MAX_WEIGHT_KG`, `SHIPPING_MAX_DIMENSION_SUM_CM` — valeurs de départ alignées sur le
plus restrictif des transporteurs standards visés (cf. recherche : Mondial Relay 25 kg / 150 cm). Pas de
valeur en dur dans le code métier (US1.1, AC seuils configurables sans redéploiement).

`src/lib/shipping/thresholds.ts` :

```ts
export function exceedsStandardThresholds(
  artwork: { weightKg: Decimal; lengthCm: Decimal; widthCm: Decimal; heightCm: Decimal },
  config: ShippingConfig
): boolean
```

**Staleness assumée et acceptée** : `Artwork.requiresSpecialistCarrier` est recalculé via cette fonction
**à chaque création/édition admin** de l'œuvre (US0.1). Si la config de seuils change ensuite, les œuvres
existantes ne sont **pas recalculées rétroactivement** — le flag stocké peut devenir stale. C'est pour ça
que le **calcul au checkout (EPIC 1bis) rappelle `exceedsStandardThresholds` à la volée**, plutôt que de
faire confiance au flag stocké : le flag stocké sert seulement à l'affichage admin (US5.1), jamais à la
décision argent. Si ce double calcul est jugé too much, alternative : un job de recalcul batch déclenché à
chaque changement de config — non retenu pour le MVP (sur-ingénierie vu le faible nombre d'œuvres).

---

## 3. Cycle de vie / déclencheurs

### A. Devis — `POST /api/stripe/create-checkout-session` (avant création de la session Stripe)

1. Pour chaque œuvre du panier : si `weightKg`/dimensions manquants → `400`, erreur explicite (US0.2,
   jamais un calcul à 0 €).
2. `exceedsStandardThresholds` sur chaque œuvre → si **au moins une** dépasse → `fulfillmentMode` ne peut
   être que `PICKUP` (US1bis.2) ; le body doit alors envoyer `fulfillmentMode: "PICKUP"`, sinon `400` avec
   message explicite (nommer l'œuvre en cause).
3. Si `fulfillmentMode = DELIVERY` : appel **parallèle** (`Promise.all`, cf. point latence discuté) à
   `getShippingRates` (devis Sendcloud, gratuit/sans quota — cf. recherche) pour chaque œuvre, avec poids +
   dimensions + adresse de livraison. Échec/timeout d'un appel → `400`/`502` explicite, jamais de fallback
   à 0 € (US2.1).
4. Si plusieurs offres par œuvre → renvoyées au client pour sélection (US2.4) ; le body de la requête de
   création de session doit alors inclure la sélection : `shippingSelections: { artworkId, shippingMethodId
}[]`.
5. Si `fulfillmentMode = PICKUP` : aucun appel transporteur, aucune adresse de livraison requise (adresse
   de facturation toujours requise).

### B. Snapshot dans les metadata Stripe (même pattern que `billingAddress`/`shippingAddress` existants)

```ts
metadata: {
  userId, artworkIds, billingAddress, shippingAddress, // existants, inchangés
  fulfillmentMode: "DELIVERY" | "PICKUP",
  // présent seulement si DELIVERY : 1 entrée par œuvre, prix gelé au moment du devis (US3.2)
  shippingSelections: JSON.stringify([
    { artworkId, shippingMethodId, label, unitPriceHTCents }
  ]),
}
```

Geler le prix dans les metadata (comme pour les adresses) garantit que le webhook facture **exactement** le
montant montré au client, sans rappel API entre la création de session et le paiement (US3.2).

**Péremption du devis gelé vs durée de vie de session (décision #8 — tranchée : on garde 24 h).** Le devis
est figé à la **création de la session Stripe** (= au moment où le client confirme, pas avant — le flux n'a
pas d'étape « confirmation » persistée séparée). Tant que la session existe et n'a pas expiré, un client qui
revient par la même URL paie ce devis gelé. Par défaut une session Checkout expire au bout de **24 h** → la
fenêtre d'écart « devis gelé vs coût réel » (cf. US3bis.2 / 🔶 4) n'est donc pas « quelques minutes » mais
**jusqu'à 24 h** pour une session qui traîne. **Décidé : on garde le défaut 24 h** — la valeur d'un
raccourcissement est faible (l'écart vient surtout de la re-mesure transporteur, pas du temps — cf. note
ci-dessous) et un délai court nuit à l'UX d'un achat d'art délibéré (l'acheteur quitte et revient parfois
des heures plus tard). Si l'écart s'avérait significatif en usage réel, le borner est trivial : un
`expires_at` à la création de session (`Math.floor(Date.now()/1000) + 60*60*2` pour 2 h, min Stripe 30 min /
max 24 h) ; au-delà, le client qui revient repasse par le flux → **re-devis frais** (nouvel appel
`create-checkout-session` = nouvelle session, l'ancienne impayée expire). Indépendant de la race « œuvre déjà
vendue », elle, gérée par le webhook (`ownerId: null` + `RefundRecovery`).

> Cause d'écart dominante en pratique : moins le temps qui passe que la **re-mesure poids/dimensions par le
> transporteur** à la prise en charge (poids volumétrique, recalage) vs les valeurs déclarées sur l'œuvre.
> Aucun verrouillage de prix ne couvre ça → argument fort pour la **validation stricte des données
> physiques** (EPIC 0 / US0.1) : des dimensions justes réduisent l'écart bien plus qu'un price-lock.

### C. Webhook `checkout.session.completed` — émission facture (extension EPIC 4 / B13)

Dans la transaction existante (`emitSaleInvoice`), en plus des lignes `ARTWORK` déjà créées :
- Si `fulfillmentMode === "DELIVERY"` : pour chaque œuvre **effectivement transférée** (`transferred.count
  > 0`, donc exclure les races remboursées), créer la ligne `SHIPPING` correspondante à partir de
  `shippingSelections` (même `artworkId`, `type: SHIPPING`, `unitPriceHT` = prix gelé, `vatRate` = celui du
  régime snapshot de la facture, cf. §4).
- Si une œuvre est en race (remboursée, `RefundRecovery`) → **pas** de ligne SHIPPING pour cette œuvre (son
  shipping n'a jamais été dû, cohérent avec « pas de vente → pas de facture pour cette ligne »).
- Si `fulfillmentMode === "PICKUP"` : aucune ligne SHIPPING (US4.1).

### D. Webhook — réservation de l'étiquette réelle (EPIC 3bis, **après** commit de la transaction)

Comme `sendInvoiceEmail` aujourd'hui (appelé après le commit, avec son propre marqueur d'idempotence) :

```ts
async function createParcelsForInvoice(invoice: InvoiceWithLines) {
  if (invoice.fulfillmentMode !== "DELIVERY") return
  const shippingLines = invoice.lineItems.filter(
    (li) => li.type === "SHIPPING" && !li.shippingParcelId && !li.shippingParcelFailedAt
  )
  for (const line of shippingLines) {
    try {
      const { parcelId } = await createParcel({ shippingMethodId: line.shippingMethodId, artworkId: line.artworkId, /* adresse depuis invoice */ })
      await prisma.invoiceLineItem.update({ where: { id: line.id }, data: { shippingParcelId: parcelId } })
    } catch (err) {
      await prisma.invoiceLineItem.update({ where: { id: line.id }, data: { shippingParcelFailedAt: new Date() } })
      console.error("[webhook] shipping parcel creation failed", { invoiceId: invoice.id, lineId: line.id, err })
      await sendShippingIncidentAdminMail({
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        artworkId: line.artworkId,
        artworkTitle: line.label,
        shippingMethodId: line.shippingMethodId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
```

**Canal d'alerte : mail dédié, pas de réutilisation de `sendCheckoutRaceIncidentAdminMail` (B13, renommé
depuis `sendIncidentAdminMail`)** — décidé (🔶 5 résolu). Ce mail B13 a un template et des champs câblés
sur un seul cas (race au checkout, remboursement émis/échoué, montant). L'échec de création de colis n'a
ni remboursement ni montant à afficher — un nouveau fichier sœur, même pattern, même canal
(`sendEmail` + `ADMIN_EMAIL`), template dédié :

```ts
// src/lib/mail/shippingIncidentAdminMail.ts
export type ShippingIncidentAdminMailParams = {
  invoiceId: string
  invoiceNumber: string
  artworkId: string
  artworkTitle: string
  shippingMethodId: string | null
  error: string
}
export function sendShippingIncidentAdminMail(
  params: ShippingIncidentAdminMailParams
): Promise<SendEmailResult>
```

- **Idempotence** : `shippingParcelId` non-null = déjà créé, ne pas retenter. `shippingParcelFailedAt`
  non-null = déjà tenté et échoué — ne pas re-spammer l'API à chaque retry du webhook ; laisse une trace
  exploitable pour traitement manuel admin (US3bis.1). Pas de retry automatique en boucle dans le webhook
  lui-même (qui doit répondre vite à Stripe) — un échec reste visible et actionnable, pas silencieux.
- **PICKUP** : à la place, déclenche l'email de coordination (US1bis.3), avec son propre marqueur
  `pickupEmailSentAt` (idempotence symétrique à `emailSentAt`).

### E. Remboursement après-vente (extension `refundSale`, B13 EPIC 5 / US4.2)

`refundSale({ invoiceId, artworkIds? })` étendu : pour chaque `artworkId` remboursé, l'avoir
(`emitCreditNote`) crédite **les 2 lignes** de cet `artworkId` (ARTWORK + SHIPPING si présente) — résolu
naturellement par le `artworkId` non-null sur SHIPPING (§0). Pas de pro rata, pas de logique nouvelle : le
filtre `lineItems.filter(li => artworkIds.includes(li.artworkId))` existant suffit.

**Cadre légal (rétractation 14 j — Code conso L221-18 et s.).** Le droit de rétractation s'applique à une
œuvre vendue sur stock (exclu pour une œuvre **sur commande / personnalisée**, L221-28). La loi distingue
deux frais de transport, qui se traduisent différemment dans le code :
- **Livraison aller** (la/les ligne(s) SHIPPING qu'on facture) → **remboursée au client** (L221-24, à
  hauteur du tarif standard). C'est déjà le comportement par construction : créditer l'`artworkId`
  embarque sa ligne SHIPPING. Rien à ajouter côté avoir.
- **Frais de retour** (renvoi de l'œuvre) → **à la charge du client** (L221-23, sauf défaut d'info). Le
  flux de retour (étiquette retour, suivi du renvoi, contrôle d'état à réception — l'œuvre voyage 2 fois,
  risque accru sur pièce fragile) **n'est PAS modélisé en MVP** : traitement manuel hors app. À acter
  explicitement (décision ouverte #7) pour ne pas le confondre avec un trou de scope.

> ⚠️ Prérequis CGV (hors code, mais à ne pas oublier en prod) : l'information sur le droit de rétractation
> doit figurer dans les CGV, sinon le délai passe de 14 jours à **12 mois** (L221-20).

**Annulation de l'étiquette Sendcloud sur remboursement avant expédition (nouveau — décision ouverte #6).**
La ligne SHIPPING peut déjà porter un `shippingParcelId` au moment du remboursement (l'étiquette est créée
juste après paiement, §3.D — bien avant la remise physique au transporteur). Si on rembourse l'aller au
client **sans** annuler l'étiquette réservée, on paie l'étiquette pour rien → **double perte vendeur**.
`refundSale` doit donc, pour chaque ligne SHIPPING créditée portant un `shippingParcelId` :
- tenter `cancelParcel(shippingParcelId)` (miroir de `createParcel`) pour récupérer le coût ;
- **best-effort, hors transaction de remboursement** (même posture que l'email d'avoir) : un échec
  d'annulation ne doit jamais bloquer ni annuler le remboursement client déjà dû. Un échec est loggé +
  signalé via `sendShippingIncidentAdminMail` pour traitement manuel (annulation tardive, le colis a
  peut-être déjà été remis au transporteur → coût enfoncé, perte assumée).
- idempotence : ne tenter l'annulation que si `shippingParcelId` non-null et pas déjà annulé (à marquer —
  cf. champ à prévoir, ou s'appuyer sur l'avoir comme preuve de remboursement). Pas de retry en boucle.

> Cas « colis déjà parti » : l'annulation échoue (normal), le coût aller est enfoncé. Conforme à la loi —
> l'aller reste remboursé au client, la perte est côté vendeur. Pas de réconciliation auto en MVP.

---

## 4. Calcul des montants / TVA shipping (US4.1)

Même règle que B13 (§5 de [B13-invoice-spec.md](B13-invoice-spec.md)) : `vatRate` de la ligne SHIPPING =
celui du **régime snapshot de la facture** (BOFIP art. 267 du CGI — frais accessoires à la livraison,
même taux que la marchandise). Pas de taux distinct à calculer ou stocker.

```
shippingLineHT  = unitPriceHT (prix gelé du devis, déjà TTC->HT si besoin selon ce que renvoie Sendcloud)
shippingVatAmount = round(shippingLineHT * invoice.vatRate, 2)
shippingLineTTC = shippingLineHT + shippingVatAmount
```

`totalHT`/`totalVat`/`totalTTC` de la facture = somme sur **toutes** les lignes (ARTWORK + SHIPPING), pas
de changement de logique dans `emitSaleInvoice`.

---

## 5. Signatures (contrats pour les tests)

```ts
// src/lib/shipping/shippingConfig.ts
export function getShippingConfig(): ShippingConfig // lève à l'usage si invalide (pas au boot, cf. §2)

// src/lib/shipping/thresholds.ts
export function exceedsStandardThresholds(artwork: ArtworkDimensions, config: ShippingConfig): boolean

// src/lib/shipping/sendcloudClient.ts
export function getShippingRates(args: {
  weightKg: number; lengthCm: number; widthCm: number; heightCm: number;
  toAddress: { street: string; postalCode: string; city: string; country: string };
}): Promise<{ shippingMethodId: string; label: string; priceHTCents: number }[]>

export function createParcel(args: {
  shippingMethodId: string;
  toAddress: { street: string; postalCode: string; city: string; country: string };
  weightKg: number; lengthCm: number; widthCm: number; heightCm: number;
}): Promise<{ parcelId: string }>

// Annulation d'une étiquette réservée (miroir de createParcel) — appelée par refundSale
// sur remboursement avant expédition, pour récupérer le coût (cf. §3.E, décision #6).
export function cancelParcel(parcelId: string): Promise<{ cancelled: boolean }>

// src/lib/shipping/cartShipping.ts — orchestration utilisée par create-checkout-session
export function computeCartShipping(args: {
  items: { artworkId: string; weightKg: Decimal | null; lengthCm: Decimal | null; widthCm: Decimal | null; heightCm: Decimal | null }[];
  toAddress: AddressInput;
}): Promise<
  | { eligible: true; quotesByArtwork: Map<string, ShippingRate[]> }
  | { eligible: false; blockingArtworkIds: string[] } // hors seuils → DELIVERY indisponible (US1bis.2)
>

// src/lib/invoice/emitSaleInvoice.ts (étendu)
export function emitSaleInvoice(tx, args: {
  // ... args existants B13 inchangés ...
  fulfillmentMode: "DELIVERY" | "PICKUP";
  shippingSelections?: { artworkId: string; shippingMethodId: string; label: string; unitPriceHT: Decimal }[];
}): Promise<Invoice>

// app/api/stripe/webhook/route.ts (nouvelle fonction, après commit, pattern sendInvoiceEmail)
async function createParcelsForInvoice(invoice: InvoiceWithLines): Promise<void>
async function sendPickupCoordinationEmail(invoice: InvoiceWithLines, email: string): Promise<void>

// src/lib/mail/shippingIncidentAdminMail.ts (nouveau, cf. §3.D — distinct de
// sendCheckoutRaceIncidentAdminMail, ex-sendIncidentAdminMail, qui ne couvre que la race au checkout)
export function sendShippingIncidentAdminMail(params: ShippingIncidentAdminMailParams): Promise<SendEmailResult>
```

---

## 6. Impacts migration & nettoyage

- **Migration `Artwork`** : 4 colonnes nullable (`weightKg`/`lengthCm`/`widthCm`/`heightCm`) +
  `requiresSpecialistCarrier` (`@default(false)`) — non destructive, pas de backfill possible (donnée
  physique inconnue) → US0.1 AC « œuvre existante sans ces champs = donnée manquante, pas `0` » se traduit
  par `null`, pas `0`, sur la migration.
- **`InvoiceLineItem`** : ajout `type` (`@default(ARTWORK)` pour les lignes existantes — rétro-compatible),
  3 champs `shipping*` nullable, changement de la contrainte unique (`@@unique([invoiceId, artworkId,
  type])`) — nécessite de drop puis recréer l'index unique en migration.
- **`Invoice`** : `fulfillmentMode` (`@default(DELIVERY)` pour les factures existantes — cohérent,
  aucune facture passée n'avait de retrait sur place), `pickupEmailSentAt` nullable.
- **`create-checkout-session/route.ts`** : body étendu (`fulfillmentMode`, `shippingSelections`), nouvelle
  étape de calcul de devis avant la création de session Stripe — actuellement la création de session est
  quasi immédiate après validation panier/adresses ; ajoute une latence réseau (devis transporteur) à
  absorber côté UI (message d'attente pour gros panier, déjà discuté).
- **Tests à écrire** : `thresholds.test.ts`, `cartShipping.test.ts` (mock Sendcloud), extension
  `emitSaleInvoice.test.ts` (lignes SHIPPING + TVA), extension `webhook/route.test.ts` (création parcel
  post-paiement, idempotence retry, échec → marqueur sans crash du webhook), extension
  `refundSale.test.ts` (remboursement par œuvre crédite ARTWORK + SHIPPING ; annulation de l'étiquette
  `cancelParcel` si `shippingParcelId` présent ; échec d'annulation best-effort → n'annule pas le
  remboursement, alerte admin).

---

## 7. Prérequis hors-code (légal / ops)

Pas du ressort de l'implémentation, mais bloquants pour la mise en prod — à ne pas perdre :

- **CGV — information rétractation** : l'information sur le droit de rétractation (14 j) doit figurer dans
  les CGV. À défaut, le délai passe à **12 mois** (Code conso L221-20). Distinguer aller (remboursé) /
  retour (à charge client). ⚠️ Cadre donné de mémoire — **à faire confirmer par un juriste** avant prod.
- **Compte Sendcloud** : créer le compte (plan gratuit suffisant au lancement, cf. recherche), connecter
  les transporteurs visés (Colissimo, Mondial Relay, Chronopost…), récupérer les clés API.
- **Câbler `sendcloudClient` sur l'API v3** (vérifié juin 2026) : les comptes créés après le 13/04/2026
  doivent utiliser l'**API v3**. Côté devis, l'endpoint v3 « shipping options » renvoie offres + prix en un
  appel (en v2 il fallait lister les `shipping_methods` puis interroger le prix par id). Nos 3 fonctions
  (`getShippingRates`/`createParcel`/`cancelParcel`) masquent la version → seul l'intérieur change.
  - Note devis : le prix standard se calcule sur **poids + pays** ; les dimensions servent de seuil
    d'éligibilité (déjà géré par `exceedsStandardThresholds`), pas d'entrée de prix. Le devis est un appel
    **lecture seule gratuit** (ne crée pas d'étiquette).
- **Tester sans frais ni vraie expédition** (pas de host sandbox séparé — même API que la prod) :
  - **option « Unstamped letter »** (`shipping_option_code: "sendcloud:letter"`) à la création de colis :
    aucune facturation. Idéal pour tester `createParcel` de bout en bout. Ne couvre pas les retours.
  - **sinon créer puis annuler** l'étiquette avant la deadline (avant 23h59 le jour même = non facturé ;
    remboursé si non expédié sous 42 j) — utile pour exercer `cancelParcel`.
  - Le devis (`getShippingRates`) étant gratuit, il se teste directement.
- **Variables d'env** :
  - `SHIPPING_MAX_WEIGHT_KG`, `SHIPPING_MAX_DIMENSION_SUM_CM` — seuils standard (validés **à l'usage**, pas
    au boot — cf. §2 ; valeurs de départ 25 kg / 150 cm).
  - clés API Sendcloud (devis + création/annulation de colis).
  - non requises dans `.env.test` (Sendcloud mocké dans les tests, comme Stripe/Resend en B13).

---

## Décisions ouvertes (récap)

| # | Décision | Proposition |
|---|---|---|
| ✅ 1 | `artworkId` nullable sur SHIPPING (user stories) vs besoin remboursement par œuvre | **Décidé : NOT NULL**, cf. §0 — répercuté sur le doc user stories |
| ✅ 2 | Pas de modèle `Shipment` dédié | **Décidé** : 3 champs sur `InvoiceLineItem` suffisent (§1) |
| ✅ 3 | Staleness de `requiresSpecialistCarrier` si la config de seuils change | **Décidé** : champ stocké = affichage admin seulement ; calcul live au checkout fait foi (§2) |
| ✅ 4 | Verrouillage de prix Sendcloud (devis → réservation) | **Tranché (doc Sendcloud vérifiée juin 2026) : aucun mécanisme de lock.** Le prix du devis n'est pas garanti égal au prix final de l'étiquette (fixé à la création du colis) ; l'écart vient de la re-mesure transporteur (poids volumétrique). Notre parade reste la seule possible : prix gelé via metadata Stripe (§3.B) + validation stricte des dimensions (EPIC 0), écart résiduel assumé (US3bis.2) |
| ✅ 5 | Échec de création de colis post-paiement : canal d'alerte admin | **Décidé** : mail dédié `sendShippingIncidentAdminMail` (§3.D), pas de réutilisation de `sendCheckoutRaceIncidentAdminMail` (B13, renommé depuis `sendIncidentAdminMail` — trop générique, câblé sur la race au checkout) |
| ✅ 6 | Étiquette Sendcloud déjà réservée au moment d'un remboursement | **Tranché (doc vérifiée) : l'endpoint existe (`POST /parcels/{id}/cancel`) mais l'annulation N'EST PAS garantie** — synchrone (200) ou asynchrone (202, surveillé 14 j), échoue si colis livré / déjà annulé / > 42 j, et dépend du transporteur. Coût récupéré uniquement si annulé **avant 23h59 le jour de création**. → confirme notre design : `cancelParcel` best-effort hors transaction, échec → log + `sendShippingIncidentAdminMail`, ne bloque jamais le remboursement (§3.E). Aller toujours remboursé (L221-24) |
| 🔶 7 | Flux de retour des œuvres (rétractation) | **Proposé** : **manuel hors app en MVP** — frais de retour à la charge du client (L221-23), pas d'étiquette retour ni de suivi de renvoi modélisés. À revisiter si le volume le justifie (§3.E) |
| ✅ 8 | Durée de vie de la session Stripe vs péremption du devis gelé | **Décidé : on garde 24 h** (défaut Stripe). Valeur faible (l'écart de prix vient surtout de la re-mesure transporteur, pas du temps) et un `expires_at` court nuit à l'UV d'un achat d'art délibéré. One-liner `expires_at` documenté en §3.B si l'écart s'avère significatif en usage réel |
