# B14_SHIPING — User stories

Référence pour les tests de la fonctionnalité frais de livraison dynamiques. Chaque **critère
d'acceptation (AC) = un test**. Le « pourquoi » et les décisions structurantes sont dans
[MEMORY.md](../MEMORY.md) ; l'ordre des branches et le périmètre dans [ROADMAP.md](../ROADMAP.md#b14_shiping--frais-de-livraison-dynamiques) ;
la recherche transporteurs (agrégateurs classiques vs spécialistes art, pricing, limites poids/dimensions)
dans [B14-shipping-research.md](B14-shipping-research.md).

> Statut : **brouillon**, rien d'implémenté. Prochaine étape après validation : spec technique
> (`B14-shipping-spec.md`, sur le modèle de B13) puis implémentation.

---

## Décisions actées

- **Scope MVP = agrégateur classique uniquement** (pas de Convelio dans cette première version). L'idée
  Convelio/spécialiste est conservée pour une itération ultérieure ; l'architecture (flag
  `requiresSpecialistCarrier`, EPIC 2/3 ci-dessous) est pensée pour absorber son ajout plus tard sans
  refonte.
- **Retrait sur place (pratique courante dans le secteur de l'art)** : toujours proposé comme option au
  checkout, à côté de la livraison — permet à l'acheteur de voir l'œuvre et potentiellement d'en acquérir
  d'autres sur place. **Devient l'unique option pour une œuvre hors des seuils transporteur standard**
  (poids/dimensions, cf. recherche) : ça lève la contrainte initialement envisagée de « ne pas vendre ces
  œuvres en MVP » — elles redeviennent vendables, juste sans livraison tant que Convelio n'est pas
  intégré. EPIC 1 (détection hors seuils) redevient donc **pertinent dès le MVP**, mais sa conséquence
  change : pas de spécialiste (différé), mais retrait obligatoire.
- **`InvoiceLineItem` distingue le type de ligne via un enum** `InvoiceLineItemType` (`ARTWORK` |
  `SHIPPING`) plutôt que de déduire le type d'un `artworkId` nullable — plus explicite, extensible (ex.
  futur "emballage spécial"). `artworkId` reste **NOT NULL** même pour les lignes `SHIPPING` (révisé en
  spec technique, cf. [B14-shipping-spec.md §0](B14-shipping-spec.md#0-incohérence-trouvée-en-écrivant-la-spec-artworkid-nullable-sur-les-lignes-shipping)) :
  une ligne SHIPPING représente le coût du colis d'**une** œuvre précise (cf. règle de colisage
  ci-dessous), jamais un total partagé entre plusieurs œuvres — sinon le remboursement partiel par œuvre
  (US4.2) ne peut pas savoir quelle part du frais de port rembourser. `@@unique([invoiceId, artworkId])`
  devient `@@unique([invoiceId, artworkId, type])` pour autoriser 1 ligne ARTWORK + 1 ligne SHIPPING par
  œuvre.
- **TVA sur le shipping = même taux que le reste de la facture.** Confirmé par le BOFIP (art. 267 du CGI) :
  les frais de transport facturés au client sont des "frais accessoires à la livraison", inclus dans la
  base d'imposition de la vente → même taux que la marchandise (franchise → 0 %, futur 5,5 % → 5,5 %).
  Pas de taux distinct à gérer côté code. Sources :
  [BOFIP](https://bofip.impots.gouv.fr/bofip/705-PGP.html/identifiant=BOI-TVA-BASE-10-20-10-20190807),
  [Eurofiscalis](https://www.eurofiscalis.com/tva-sur-les-frais-de-port/).

## Hypothèses figées

- **Agrégateur classique retenu : Sendcloud** (tranché). Plan gratuit (20-30 étiquettes/mois) suffisant au
  lancement vu le volume de production attendu.
- **Retrait sur place = coordination manuelle par email après achat** (tranché), pas de créneaux figés
  dans l'app. À la confirmation du paiement, un email est envoyé pour convenir d'un horaire avec
  l'acheteur — pas de modèle `PickupSlot`/calendrier à construire en MVP.
- **Spécialiste art (Convelio)** : hors scope MVP — cf. Décisions actées. Conservé comme évolution prévue,
  pas développé dans cette branche.
- **Le prix de livraison est calculé dynamiquement côté serveur** via l'API du transporteur retenu (pas de
  grille tarifaire statique en dur), juste avant la création de la session Stripe Checkout.
- **Devis (checkout) et réservation de l'étiquette (post-paiement) sont deux appels API distincts.**
  Confirmé par la recherche : chez Sendcloud, l'endpoint de devis (`shipping-prices`) est gratuit et ne
  consomme pas le quota du plan ; seule la création réelle du colis (`create parcel`) consomme le quota et
  engage le coût. Donc le devis sert au prix affiché au checkout (EPIC 2), mais l'étiquette réelle n'est
  créée **qu'après confirmation du paiement** (EPIC 3bis) — pas de coût engagé sur un panier abandonné.
- **Shipping = `line_item` additionnel** sur la session Stripe (pas `shipping_options` natif — trop rigide
  pour un tarif calculé à la volée et pour un futur filtrage spécialiste/classique).
- **Ordre B13 → B14 respecté** : le shipping s'ajoute comme ligne de facture supplémentaire sur le modèle
  `Invoice`/`InvoiceLineItem` déjà en place (évolution non destructive : `artworkId` nullable + nouvel
  enum, pas de nouveau modèle de facturation).
- **Choix retrait/livraison au niveau de la commande, pas par œuvre.** Un panier mixte (1 œuvre hors
  seuils + 1 œuvre standard) bascule **toute la commande** en retrait sur place — pas de fulfillment
  partagé (1 œuvre livrée + 1 récupérée) en MVP, pour rester simple. À revisiter si le besoin se confirme
  (cf. points ouverts).

---

## Modèle cible (vue d'ensemble)

```
Artwork {
  ...
  weightKg                 Decimal?   // poids, requis pour devis transporteur
  lengthCm, widthCm, heightCm Decimal? // dimensions, requis pour devis + détection hors-format
  requiresSpecialistCarrier  Boolean  @default(false) // réservé pour l'évolution Convelio (hors MVP)
}

enum InvoiceLineItemType { ARTWORK SHIPPING }

InvoiceLineItem {
  ...
  type      InvoiceLineItemType @default(ARTWORK)
  artworkId String  // NOT NULL même pour type=SHIPPING : 1 colis = 1 œuvre, jamais de ligne partagée
}

enum FulfillmentMode { DELIVERY PICKUP }

Invoice {
  ...
  fulfillmentMode FulfillmentMode @default(DELIVERY) // PICKUP : pas de ligne SHIPPING
}
```

- Pas de nouveau modèle `Shipment` à ce stade : le besoin (devis + réservation) est couvert par un appel
  API synchrone au moment du checkout, le résultat (transporteur choisi + prix) est juste un line item de
  plus sur `Invoice`. À revoir si on a besoin un jour de tracking persistant (hors scope B14 initial).
- **Règle de colisage : 1 œuvre = 1 colis, toujours** (décidé). Regrouper plusieurs œuvres dans un même
  colis nécessiterait de valider un packing 3D (dimensions cumulées + marge de calage/protection par
  œuvre), pas une simple somme de poids/dimensions — non fiable à valider automatiquement. Un panier de
  N œuvres génère N colis (donc potentiellement N appels/lignes de devis transporteur). Conséquence
  acceptée : pas de mutualisation des frais de port sur un panier multi-œuvres (optimisation différée,
  hors MVP).

---

## EPIC 0 — Données physiques de l'œuvre (le socle)

**US0.1 — L'admin renseigne poids et dimensions à la création/édition d'une œuvre.**
- AC : champs poids (kg) + longueur/largeur/hauteur (cm) sur le formulaire admin œuvre.
- AC : œuvre existante sans ces champs (migration) → traitée comme "donnée manquante", pas comme `0`.
- AC : valeurs négatives ou nulles rejetées (validation Zod).

**US0.2 — Sans poids/dimensions, l'œuvre n'est pas vendable en ligne.**
- AC : au checkout, une œuvre du panier sans poids/dimensions renseignés bloque le calcul de frais de port
  avec une erreur explicite (pas un calcul à 0 € silencieux).

---

## EPIC 1 — Détection « hors standard » (pertinente dès le MVP)

> Cf. recherche : Colissimo/Chronopost/Mondial Relay plafonnent à ~100-150 cm (somme des dimensions) et
> 25-30 kg. Au-delà, transporteur standard non éligible.

**En MVP, la conséquence n'est pas Convelio (différé) mais le retrait sur place obligatoire** (EPIC 1bis).
Le flag `requiresSpecialistCarrier` reste dans le modèle comme point d'extension pour l'itération Convelio
future, mais n'est pas encore branché sur un appel API spécialiste.

**US1.1 — Le système calcule si l'œuvre dépasse les seuils transporteur standard.**
- AC : seuils configurables (pas en dur dans le code métier — au moins poids max + somme des dimensions
  max), pour pouvoir ajuster sans déploiement si les transporteurs changent leurs conditions.
- AC : œuvre dans les seuils → éligible livraison via agrégateur classique.
- AC : œuvre hors seuils → livraison désactivée pour cette œuvre, retrait sur place devient obligatoire
  (cf. EPIC 1bis) ; `requiresSpecialistCarrier` est positionné à `true` pour préparer l'itération Convelio,
  sans effet de calcul de devis dans cette version.

**US1.2 (différée — itération Convelio) — L'admin peut aussi forcer le spécialiste manuellement**
(fragilité non capturée par poids/dimensions — ex. œuvre sur verre, technique mixte fragile).
- AC : flag `requiresSpecialistCarrier` cochable indépendamment du calcul automatique.
- AC : si l'admin décoche le flag mais que l'œuvre dépasse les seuils → le système garde le comportement
  hors-seuils (retrait obligatoire en MVP, spécialiste plus tard).

---

## EPIC 1bis — Retrait sur place

**US1bis.1 — Le retrait sur place est toujours proposé comme option au checkout, à côté de la livraison.**
- AC : choix `fulfillmentMode` (`DELIVERY` / `PICKUP`) présenté à l'acheteur pour la commande.
- AC : si `PICKUP` choisi → aucune ligne `SHIPPING`, aucun appel à l'agrégateur transporteur.
- AC : si `PICKUP` choisi → l'adresse de livraison n'est pas requise au checkout (l'adresse de facturation
  reste requise pour la facture).

**US1bis.3 — Coordination du retrait par email après paiement** (pas de créneaux gérés dans l'app).
- AC : `PICKUP` confirmé → un email dédié est envoyé à l'acheteur après confirmation du paiement, invitant
  à convenir d'un horaire (même pattern d'envoi que `sendInvoiceUserMail`, déclenché depuis le webhook).
- AC : pas de champ créneau/calendrier sur `Invoice` ou ailleurs — la coordination se fait hors app.

**US1bis.2 — Le retrait sur place devient l'unique option si une œuvre du panier est hors seuils.**
- AC : panier contenant au moins une œuvre hors seuils (US1.1) → option `DELIVERY` masquée/désactivée pour
  toute la commande (décision : choix au niveau commande, pas par œuvre — cf. Hypothèses figées).
- AC : message explicite à l'acheteur sur la raison (œuvre trop volumineuse/lourde pour la livraison
  standard).

---

## EPIC 2 — Devis transporteur au checkout (si `fulfillmentMode = DELIVERY`)

**US2.1 — Le système interroge l'agrégateur classique (Sendcloud/Shippo) pour chaque œuvre du panier.**
- AC : appel avec poids + dimensions de l'œuvre + adresse de livraison (déjà dispo depuis B11) → un devis
  par œuvre (cf. règle de colisage ci-dessus : 1 œuvre = 1 colis).
- AC : panier multi-œuvres → autant d'appels/lignes de devis que d'œuvres ; le total shipping affiché est
  la somme de ces devis (pas de mutualisation, cf. règle de colisage).
- AC : échec/timeout de l'API transporteur → erreur explicite au checkout, **jamais** un montant de
  livraison à 0 € par défaut.

**US2.2 (différée — itération Convelio) — Le système interroge Convelio pour les œuvres nécessitant un
spécialiste**, en alternative au retrait obligatoire actuel.
- AC : mêmes garanties qu'US2.1 (pas de silent fallback à 0 €).
- AC : panier mixte (1 œuvre classique + 1 œuvre nécessitant spécialiste) → deux devis distincts, pas un
  mélange sur le même transporteur.

**US2.3 (différée — itération Convelio) — Panier mixte classique + spécialiste → deux frais de port
distincts affichés à l'acheteur.**
- AC : l'acheteur voit clairement pourquoi il y a 2 lignes de livraison (ex. "Colis standard" /
  "Transport spécialisé œuvres d'art").

**US2.4 — L'utilisateur peut choisir son transporteur quand plusieurs options sont retournées** (optionnel
selon ROADMAP — applicable dès le MVP si l'agrégateur retourne plusieurs offres).
- AC : si un seul tarif retourné → pas de choix, sélection automatique.
- AC : si plusieurs → l'utilisateur sélectionne avant de passer au paiement.

---

## EPIC 3 — Intégration Stripe

**US3.1 — Le(s) frais de port sont ajoutés comme `line_item` additionnel(s) à la session Checkout, sauf en
retrait sur place.**
- AC : `fulfillmentMode = DELIVERY` → montant du line item shipping = celui retourné par l'API transporteur
  au moment de la création de session (pas recalculé/négocié côté Stripe).
- AC : `fulfillmentMode = PICKUP` → aucun line item shipping ajouté.
- AC : libellé du line item distingue clairement "frais de livraison" des œuvres elles-mêmes.

**US3.2 — Le prix figé au moment du paiement ne bouge plus après confirmation.**
- AC : si le webhook traite la confirmation plus tard, le montant facturé est celui de la session, jamais
  recalculé via un nouvel appel transporteur.

---

## EPIC 3bis — Réservation de l'étiquette transporteur (post-paiement)

> Trou de scope identifié en revue : EPIC 2/3 ne couvrent que le **devis** au checkout (prix affiché,
> figé dans le `line_item` Stripe). Sans cette étape, aucune étiquette n'est jamais réellement créée chez
> le transporteur — il manque l'action qui permet à l'admin d'expédier le colis. Cf. recherche : devis et
> création de colis sont deux endpoints Sendcloud distincts, le second seul consommant le quota/coût
> ([détail](B14-shipping-research.md)).

**US3bis.1 — Après confirmation du paiement, le système crée le colis réel chez Sendcloud avec l'offre
choisie au checkout.**
- AC : déclenché depuis le webhook Stripe, même pattern que `sendInvoiceUserMail` (B13).
- AC : `fulfillmentMode = PICKUP` → aucune création de colis (cf. EPIC 1bis).
- AC : idempotence — un retry du webhook (cas déjà géré pour les factures via l'anti-doublon B13) ne doit
  jamais créer deux colis pour la même commande.
- AC : échec de création du colis après paiement confirmé → ne bloque pas l'émission de la facture/l'email
  déjà traités, mais déclenche une alerte explicite (log critique a minima) pour traitement manuel — un
  paiement réussi avec expédition non réservée ne doit jamais passer silencieusement inaperçu.

**US3bis.2 — Dérive de prix entre devis et création de l'étiquette (risque résiduel accepté en MVP).**
- AC : le montant facturé au client reste celui du devis pris au checkout, jamais recalculé (cf. US3.2) —
  même si le coût réel de l'étiquette révélé à la création diffère.
- AC : pas de mécanisme de verrouillage de prix identifié côté API Sendcloud à ce stade ; l'écart éventuel
  (devis vs coût réel, sur une fenêtre de quelques minutes le temps du paiement) est absorbé par le
  vendeur — pas de réconciliation automatique en MVP. À revoir si l'écart s'avère significatif en usage
  réel.

---

## EPIC 4 — Facturation (extension B13)

**US4.1 — Le frais de port apparaît comme line item supplémentaire sur la facture, pas mélangé aux
œuvres, et seulement en cas de livraison.**
- AC : `fulfillmentMode = DELIVERY` → une `InvoiceLineItem` shipping par œuvre livrée, avec `type =
  SHIPPING` et `artworkId` renseigné (l'œuvre dont ce colis est le frais — pas de ligne agrégée
  multi-œuvres, cf. Décisions actées).
- AC : `fulfillmentMode = PICKUP` → aucune ligne `SHIPPING` sur la facture.
- AC : TVA appliquée à la ligne shipping = **même taux que le régime snapshot de la facture** (décidé —
  cf. Décisions actées, BOFIP art. 267 du CGI).

**US4.2 — Le remboursement (avoir, B13 EPIC 5) couvre aussi la ligne shipping si applicable.**
- AC : un remboursement total inclut toutes les lignes shipping dans l'avoir (si présentes).
- AC : un remboursement partiel (1 œuvre sur plusieurs, 1 colis chacune) rembourse exactement le colis
  correspondant — le filtre existant par `artworkId` (B13, `emitCreditNote`) couvre nativement la ligne
  ARTWORK *et* sa ligne SHIPPING associée, sans logique spéciale. Pas de recalcul au pro rata (cf. règle de
  colisage 1 œuvre = 1 colis).

---

## EPIC 5 — Dashboard admin

**US5.1 — L'admin voit/édite le statut hors-seuils d'une œuvre** (dérivé d'US1.1, override manuel différé
à l'itération Convelio cf. US1.2), visible sur la fiche œuvre admin.
- AC : champ visible sur la fiche œuvre admin (création + édition), avec indication explicite que la
  conséquence actuelle est « retrait sur place uniquement » (pas encore « transporteur spécialiste »).

---

## Points encore à trancher avant implémentation (spec technique)

- **Référence de persistance pour l'idempotence de la création de colis (EPIC 3bis)** : le modèle cible
  actuel ne prévoit pas de modèle `Shipment`, mais US3bis.1 a besoin d'un minimum (ex. champ
  `shippingParcelId`/statut sur `Invoice`) pour savoir si le colis a déjà été créé et éviter un doublon sur
  retry webhook. À trancher en spec technique : champ minimal sur `Invoice`, ou modèle dédié si le besoin
  de tracking persistant se confirme.
- **Fulfillment mixte par œuvre** (1 livrée + 1 retirée sur place dans la même commande) : non supporté en
  MVP (choix au niveau commande, cf. Hypothèses figées) — à revisiter si la demande se confirme à l'usage.
- ~~Choix agrégateur classique~~ — **tranché** : Sendcloud (cf. Hypothèses figées).
- ~~Modalités pratiques du retrait sur place~~ — **tranché** : coordination par email après paiement, pas
  de créneaux gérés dans l'app (cf. US1bis.3).
- **Seuils hors-standard configurables** (US1.1) : config env (même pattern que `SELLER_*` en B13) —
  retenu par défaut, à confirmer en spec technique.
- ~~Règle de regroupement multi-œuvres~~ — **tranché** : 1 œuvre = 1 colis, toujours (cf. modèle cible).
- ~~Modèle `InvoiceLineItem`~~ — **tranché** : enum `InvoiceLineItemType` (cf. Décisions actées).
- ~~TVA sur le shipping~~ — **tranché** : même taux que la facture (BOFIP art. 267 CGI).
- ~~Remboursement partiel + shipping~~ — **tranché** : remboursement exact du colis concerné, pas de pro
  rata (conséquence de la règle de colisage).
- ~~Onboarding Convelio / spécialiste~~ — **hors scope MVP**, reporté à une itération ultérieure (US1.2,
  US2.2, US2.3 marquées « différé »). Vente des œuvres hors seuils **n'est plus bloquée** : retrait sur
  place obligatoire à la place (EPIC 1bis).
