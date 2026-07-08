# B14_SHIPING — Recherche transporteurs (étape 0)

Recherche préalable aux user stories, pour se projeter sur les intégrations possibles avant de figer
le schéma `Artwork` et le flux Stripe. Contexte métier et décisions déjà actées → [MEMORY.md](../MEMORY.md),
[ROADMAP.md](../ROADMAP.md#b14_shiping--frais-de-livraison-dynamiques).

> Statut : recherche exploratoire, aucune décision tranchée. Prochaine étape : user stories.

---

## 1. Transporteurs classiques

Deux approches possibles :

### a) Intégration directe par transporteur
Colissimo, Chronopost, Mondial Relay, DHL exposent chacun leur propre API (étiquettes, tracking,
points relais). Pas de coût d'accès tiers, mais autant d'intégrations à maintenir que de transporteurs.

### b) Plateforme agrégatrice multi-transporteurs
Une seule API donne accès à de nombreux transporteurs, avec activation/désactivation sans redéploiement.

| Plateforme | Couverture | Tarifs |
|---|---|---|
| **Sendcloud** | 170+ transporteurs, supporte explicitement la France (Colissimo, Mondial Relay, Chronopost, DPD, GLS, UPS…) | Gratuit jusqu'à 50 étiquettes/mois (fonctions limitées). Payant : ~23-40 €/mois → 138-199 €/mois selon volume. Dépassement : 0,15 €/étiquette au-delà du quota. |
| **Shippo** | 40+ transporteurs | Gratuit jusqu'à 30 étiquettes/mois. Payant : ~17 $/mois (200 étiquettes) → 199 $/mois (10 000 étiquettes). +0,05 $/étiquette en plan gratuit si compte transporteur personnel connecté. |

**Constat :** pour un volume de démarrage, le plan gratuit de l'un ou l'autre peut suffire (20-30
étiquettes/mois selon la source — Sendcloud cité tantôt à 50, tantôt à 20 ; à vérifier au moment de
l'implémentation) et éviter un coût fixe immédiat. À reconsidérer si le volume de ventes dépasse ce seuil.

**Confirmé (recherche API Sendcloud) : le quota ne compte que les étiquettes effectivement créées, pas les
devis.** Sendcloud expose deux endpoints distincts :
- **`shipping-prices`** (devis) — gratuit, sans engagement, ne consomme pas le quota du plan. C'est cet
  endpoint qui sert à afficher le prix au checkout (EPIC 2 des user stories).
- **Création du colis (`create parcel`)** — c'est *cet appel* qui consomme le quota mensuel et engage le
  coût réel (frais de traitement d'étiquette selon le plan : ~0,06-0,09 £/étiquette).

**Implication directe :** on peut appeler le devis librement à chaque checkout sans risquer de consommer
le quota sur des paniers abandonnés. En revanche, la création du colis réel doit être différée **après**
confirmation du paiement (cf. user stories, EPIC 3bis) — appeler `create parcel` avant paiement confirmé
engagerait un coût pour des commandes qui ne se concrétisent pas forcément.
Sources : [Shipping rates - Sendcloud API Developer Portal](https://sendcloud.dev/docs/shipping/shipping-rates),
[How do we charge and invoice your shipments? - Sendcloud Help Center](https://support.sendcloud.com/hc/en-gb/articles/360025143911-How-do-we-charge-and-invoice-your-shipments),
[Pricing & Plans Overview](https://www.sendcloud.com/pricing/).

### Les paliers de prix sont indexés sur le nombre d'étiquettes, pas sur le colis

Question posée : les plans Sendcloud/Shippo ont-ils une limite de poids, dimensions ou valeur, ou
est-ce uniquement le nombre d'étiquettes qui compte ?

**Réponse : uniquement le volume (nombre d'étiquettes/mois).** Aucune des deux plateformes ne fait varier
son tarif d'abonnement selon le poids, les dimensions ou la valeur du colis — ce sont des caractéristiques
qui n'intéressent que le **transporteur sous-jacent** (Colissimo, Chronopost, Mondial Relay…), pas
l'agrégateur. Concrètement :
- L'agrégateur facture à l'étiquette émise (ou via abonnement mensuel à quota d'étiquettes), peu importe
  ce qu'il y a dans le colis.
- Le **transporteur**, lui, applique des limites de poids/dimensions par service, et des surcharges en cas
  de dépassement (poids volumétrique) — répercutées par l'agrégateur sur la facture finale, mais ça reste
  un coût *par expédition*, pas un changement de palier d'abonnement.

**Limites poids/dimensions par transporteur (pertinent pour des œuvres encadrées/volumineuses) :**

| Transporteur | Poids max | Dimensions max |
|---|---|---|
| **Colissimo** | 30 kg (domicile) / 20 kg (point retrait) | Somme L+l+h ≤ 150 cm, longueur ≤ 100 cm |
| **Chronopost** | 30 kg (domicile) / 20 kg (point relais) | Domicile : L ≤ 150 cm, L+2H+2l ≤ 300 cm. Point relais : L ≤ 100 cm, somme ≤ 250 cm |
| **Mondial Relay** | 25 kg | Domicile : L+l+h ≤ 150 cm, plus grand côté ≤ 120 cm. Locker : 64×40×38 cm max |

**Implication directe pour B14 :** ces seuils (souvent ~100-150 cm de longueur) sont **bas pour des
œuvres encadrées** — un tableau de taille moyenne peut facilement les dépasser. Au-delà, on sort du
"colis standard" et on bascule sur des services "hors format" (Geodis, DHL, UPS — toujours via
l'agrégateur, mais à coût et délai différents) ou directement sur un spécialiste art (§2). Le flag
`requiresSpecialistCarrier` devra donc pouvoir se déclencher **soit sur la fragilité déclarée par
l'admin, soit automatiquement si les dimensions/poids dépassent les seuils transporteur standard** — à
trancher dans les user stories.

---

## 2. Transporteurs spécialisés œuvres d'art

Marché identifié et actif, distinct des transporteurs classiques (pièces volumineuses/lourdes/fragiles,
emballage caisse, douane, assurance, "white glove").

- **Convelio** — candidat le plus pertinent pour notre cas : **API publique** (REST, JSON), pensée pour
  l'intégration e-commerce ("afficher les coûts de transport au checkout, réserver et payer en une seule
  transaction"). Accès restreint aux clients approuvés (onboarding sur contact). Couvre emballage/caisses,
  douane, livraison "white glove". Tarification : **pas d'abonnement** — le prix facturé est celui du
  transport lui-même (devis instantané via algo propriétaire), pas de coût d'accès API distinct identifié.
- **MTAB**, **André Chenue**, **Artrans**, **Crown Fine Art**, **LP ART**, **Mathez Art Logistics**,
  **Bovis Fine Art**, **Partner Fine Art** — transporteurs spécialisés établis, mais aucune trace d'API
  publique en libre accès comme Convelio. Fonctionnement probable sur devis manuel / intégration sur mesure.

**Constat :** Convelio ressort comme le seul candidat avec une API faite pour l'auto-réservation en ligne ;
les autres semblent orientés B2B classique (devis manuel).

---

## 3. Implications pour le scoping B14

- **Stripe** : avec un agrégateur (Sendcloud/Shippo) comme avec Convelio, le prix de livraison est calculé
  dynamiquement côté serveur via API tierce avant la création de la session Checkout. Ça confirme l'option
  **`line_item` additionnel** plutôt que `shipping_options` natif Stripe (pensé pour des tarifs fixes
  pré-déclarés, pas pour un prix calculé à la volée par API tierce).
- **Flag `requiresSpecialistCarrier`** sur `Artwork` (déjà identifié dans la ROADMAP) : déciderait quelle
  API appeler au moment du calcul des frais — agrégateur classique (Sendcloud/Shippo) si `false`, Convelio
  si `true`.
- **Coût d'intégration** : à mettre en balance avec le volume de ventes attendu — un plan gratuit suffit
  probablement au lancement pour le volet classique ; le volet Convelio nécessite un contact commercial
  préalable (onboarding) avant tout développement technique.

---

## 4. Points encore ouverts (à trancher avant ou pendant les user stories)

- Choix définitif agrégateur classique : Sendcloud vs Shippo (pas de blocage identifié pour la France
  côté couverture — différence surtout sur le pricing et l'écosystème d'intégrations).
- Contact Convelio à initier pour confirmer les conditions d'accès API (approbation client requise).
- Volume de ventes prévu à court terme, pour dimensionner le choix du plan tarifaire agrégateur.