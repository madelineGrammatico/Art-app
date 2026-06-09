# Roadmap / TODO

Ce qui reste à faire, dans l'ordre prévu. Pour le « pourquoi » et les décisions, voir [MEMORY.md](MEMORY.md).

## Ordre des branches

`B11` (sélection adresse) ✅ → **B12_CONTEXT** (contexte projet, en cours) → **B13_INVOICE** (refacto Invoice) → **B14_SHIPING** (frais de livraison dynamiques).

Raison de l'ordre INVOICE avant SHIPING : une fois `Invoice` structurée en line items (B13_INVOICE), ajouter le shipping comme line item additionnel devient trivial. Le faire avant compliquerait la migration.

---

## B13_INVOICE — Refacto facturation (`app/api/invoices/route.ts`)

Prévu **après** la couverture de tests (déjà en place). Mérite sa propre branche dédiée.

**Corrections techniques :**
1. **Trou de permission** dans `createInvoiceAction` (`route.ts:8-32`) : aucun check `userId === session.user.id`, fichier `"use server"`. Sévérité réelle **faible** (fonction sans caller, artwork non transféré car le webhook check `ownerId: null`, invoice sans `stripeSessionId` jamais activée). À traiter quand même → **décider : supprimer la fonction orpheline (préférable) ou ajouter le check.**
2. **Format d'erreur incohérent** : `route.ts` renvoie `{error: error}` (objet Error), `basket.action.ts` renvoie `{error: error.message}` (string). Aligner sur le pattern basket.
3. **Code mort** dans `updateIvoiceAction` (`route.ts:92`) : `if (!invoice) throw...` inatteignable (`prisma.update` throw déjà). Supprimer.
4. **Typos** dans les exports : `getUserIvoiceAction`, `getIvoiceAction`, `updateIvoiceAction` (`Ivoice` → `Invoice`). Renommer.

**Évolution du modèle (vraie facture client) :**
5. Passer de `1 invoice / artwork` à **1 facture / commande avec line items**. À prévoir :
   - **Numéro de facture** unique séquentiel (obligation légale, Code de commerce).
   - **Mentions légales** : SIRET, raison sociale, TVA si applicable.
   - **Conservation 10 ans** structurée.
   - **TVA art** : 5,5 % réduite pour œuvres originales en France (vs 20 %) — à modéliser.
   - **PDF** (« support durable » attendu en cas de litige, Code conso art. L221-13).
6. **Email facture client** : à faire **dans cette refacto**. Intérim actuel = reçu Stripe natif (`receipt_email`) qui couvre l'obligation légale.

> Les tests dans `app/api/invoices/route.test.ts` devront être adaptés (assertions `res.error.message`).

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
