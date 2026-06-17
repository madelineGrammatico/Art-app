# B13_INVOICE — User stories (étape 2 : vraie facture client)

Référence pour les tests de la refacto facturation. Chaque **critère d'acceptation (AC) = un test**.
Le « pourquoi » et les décisions structurantes sont dans [MEMORY.md](../MEMORY.md) ; l'ordre des branches dans [ROADMAP.md](../ROADMAP.md).

> **Étape 1 (cleanup technique)** : déjà faite (suppression `createInvoiceAction`, format d'erreur, code mort, typos). Voir ROADMAP.
> **Étape 2 (ce document)** : passage de `1 invoice / artwork` à **1 facture / commande avec line items**, conforme à la facturation FR.

> **Avancement étape 2** (cf. [B13-invoice-spec.md](B13-invoice-spec.md)) :
> - ✅ **EPIC 0** config vendeur + snapshot · **EPIC 1** facture de vente, line items, numérotation, snapshot adresses · **EPIC 2** calcul TVA par ligne (franchise / 5,5 %) · **EPIC 4** consultation (`getInvoiceAction`/`getUserInvoiceAction`) · **EPIC 6** immuabilité (pas d'`updateInvoiceAction`).
> - ⏳ **EPIC 3** PDF + email facture · **EPIC 5** facture d'avoir + flux remboursement après-vente · validation config au boot (US0.1) · conservation/soft-delete (US6.2).

---

## Hypothèses figées

- **Vendeur unique = l'artiste (toi), œuvres originales propres** → statut artiste-auteur. Pas de revente, donc **jamais de régime de la marge**, jamais de taux mixtes multi-vendeurs.
- **TVA aujourd'hui** = franchise en base (probable — seuil à reconfirmer avec le comptable, ne dépend pas du code) → taux nul + mention `art. 293 B du CGI`. **Demain** : passage possible à **5,5 % (taux réduit art)** sans refonte.
- **Régime / taux = config (env var) validée au boot, snapshotée sur chaque facture.** Jamais recalculé à la lecture (sinon les anciennes factures changeraient → non conforme).

---

## Modèle cible (vue d'ensemble)

```
Invoice (1) ──< InvoiceLineItem (N) ──> Artwork
```

- L'œuvre n'est **plus** rattachée à la facture directement, mais via un **line item**.
- Une facture d'avoir = **même modèle** `Invoice` avec `type = CREDIT_NOTE` (pas de modèle dédié à maintenir en double).

```
Invoice {
  type              InvoiceType        // SALE | CREDIT_NOTE
  number            String?            // séquentiel, attribué à l'émission (null en brouillon)
  creditedInvoiceId String?            // null pour une vente ; self-FK pour un avoir
  stripeSessionId   String?            // vente   → @@unique
  stripeRefundId    String?            // avoir   → @@unique
  ...snapshot vendeur (raison sociale, SIRET, RCS, TVA intracom, adresse)...
  ...snapshot adresses billing/shipping (B11)...
  lineItems         InvoiceLineItem[]
}
InvoiceLineItem { invoiceId, artworkId, label, unitPriceHT, vatRate, vatAmount }
```

Clés d'idempotence (anti-doublon, garanties au niveau schéma) :
- `@@unique(stripeSessionId)` → 1 paiement = au plus 1 facture de vente.
- `@@unique(stripeRefundId)` → 1 remboursement = au plus 1 avoir.
- `@@unique(invoiceId, artworkId)` → une œuvre n'apparaît pas 2× dans le même document.

---

## EPIC 0 — Config & snapshot (le socle)

**US0.1 — Config TVA au boot.** En tant que système, je lis le régime TVA et les mentions vendeur depuis la config (env var) et je **refuse de démarrer** si elles sont absentes/incohérentes.
- AC : config valide (`FRANCHISE`, ou `ASSUJETTIE` + taux) → boot OK.
- AC : config manquante ou incohérente (ex. `ASSUJETTIE` sans taux) → erreur explicite au démarrage.
- AC : le taux n'est **jamais** une entrée client.

**US0.2 — Snapshot à l'émission.** À l'émission, je **copie** sur la facture : mentions vendeur, régime, et par ligne le taux + HT/TVA/TTC.
- AC : modifier la config après émission ne change **aucune** facture passée.
- AC : 2 factures émises sous 2 configs différentes gardent chacune sa valeur.

---

## EPIC 1 — Émission conforme à la commande

**US1.1 — Une facture unique par commande, une ligne par œuvre.**
- AC : 1 facture par session Stripe (≠ 1 par artwork).
- AC : N line items ; `total TTC = Σ lignes`.
- AC : facture liée au `buyerId`.

**US1.2 — Numéro séquentiel** unique, sans trou, chronologique, attribué **à l'émission** (un brouillon n'a pas de numéro).
- AC : 2 factures consécutives → N puis N+1.
- AC : pas de numéro tant que non finalisée.
- AC : **pas de doublon en concurrence** (2 paiements quasi simultanés → 2 numéros distincts).
- AC : format défini (ex. `2026-000123`).

**US1.3 — Snapshot adresses** billing/shipping au niveau facture (portage de B11 au nouveau modèle).

---

## EPIC 2 — TVA (artiste-auteur)

**US2.1 — Franchise en base (cas actuel).**
- AC : taux nul, pas de montant TVA.
- AC : mention `TVA non applicable, art. 293 B du CGI` présente sur facture + PDF.

**US2.2 — Assujettie 5,5 % (cas futur, même code).**
- AC : après bascule de config, les **nouvelles** factures portent 5,5 % par ligne, ventilation HT/TVA/TTC stockée, total TVA = Σ TVA lignes, arrondis corrects.
- AC : les anciennes factures « franchise » restent **inchangées**.

---

## EPIC 3 — Support durable

**US3.1 — PDF** contenant **toutes les mentions obligatoires** (checklist en bas).
- AC : un test « le PDF contient X » pour chaque mention.

**US3.2 — Email client** à la confirmation (PDF joint ou lien). Remplace l'intérim « reçu Stripe natif ».
- AC : email envoyé une seule fois à l'émission.
- AC : adressé au `buyer` ; contient/lie la facture.

---

## EPIC 4 — Consultation (RBAC déjà testé)

**US4.1 — Le client consulte ses factures** (liste + détail + PDF), jamais celles d'autrui.
**US4.2 — L'admin consulte/recherche toutes les factures.**
- AC : reprend les checks de `getInvoiceAction` / `getUserInvoiceAction`.

---

## EPIC 5 — Remboursement / facture d'avoir

**Décision actée** : un remboursement n'est **pas** une mutation de la facture de vente (qui doit rester immuable), mais l'émission d'une **facture d'avoir** — **même modèle `Invoice`** avec `type = CREDIT_NOTE`, alignée sur le pipeline de remboursement Stripe.

**US5.1 — Émission d'un avoir au remboursement.** Un remboursement Stripe émet une facture d'avoir référençant la facture de vente d'origine via `creditedInvoiceId`, avec sa propre **numérotation séquentielle** (série dédiée, ex. `AV-2026-xxx`, ou série commune — gapless dans tous les cas).
- AC : `type = CREDIT_NOTE`, `creditedInvoiceId` pointe la facture de vente.
- AC : la facture de vente d'origine reste **strictement inchangée**.
- AC : l'avoir a un numéro séquentiel propre, sans trou.
- AC : montants en négatif (crédit).

**US5.2 — Remboursement partiel.** → avoir sur les **lignes concernées** seulement.
- AC : seules les œuvres remboursées apparaissent dans l'avoir.
- AC : `Σ(facture de vente) − Σ(avoirs) = net réellement encaissé`.

**US5.3 — Idempotence du remboursement.**
- AC : `@@unique(stripeRefundId)` → un même remboursement Stripe ne crée jamais 2 avoirs (webhook rejoué → no-op).
- AC : cohérent avec `stripeRefundId` comme marqueur de récupération (cf. MEMORY : `null` = remboursement non confirmé).

**US5.4 — État « remboursée » dérivé, pas muté.**
- AC : qu'une facture soit remboursée se **déduit** de l'existence d'un avoir qui la crédite — ce n'est plus un `status = REFUNDED` qui écrase la pièce.

---

## EPIC 6 — Immuabilité & conservation

**US6.1 — Facture émise immuable** (montant / lignes / mentions) ; correction uniquement par avoir.
- AC : toute tentative de mutation d'une facture finalisée est rejetée.
- AC : un `status` léger ne subsiste que pour le **pré-émission** (brouillon non payé, sans numéro), jamais comme mécanisme légal.

**US6.2 — Conservation 10 ans.** Pas de suppression dure (soft delete / archivage).

---

## Checklist mentions obligatoires (→ tests US3.1)

Numéro · date d'émission · date de la vente · vendeur (raison sociale, forme juridique, adresse, SIRET, RCS, TVA intracom) · client (nom, adresse) · désignation par ligne (quantité, prix unitaire HT) · taux TVA par ligne · total HT · total TVA · total TTC · conditions / échéance de paiement · **`TVA non applicable, art. 293 B du CGI`** tant que franchise en base.

---

## Points encore à trancher avant implémentation

- **Numérotation** : série unique vente+avoir, ou deux séries (`FA-` / `AV-`) ? Format exact du numéro.
- **Seuil de franchise** : à reconfirmer (comptable / impots.gouv) — n'impacte pas le code, seulement la config.
- **Données légales émetteur** (SIRET, raison sociale, RCS, TVA intracom) : à fournir pour alimenter la config snapshot.
- **Stockage du PDF** : généré à la volée vs archivé (lié à la conservation 10 ans).
