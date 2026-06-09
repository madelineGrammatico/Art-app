# MEMORY — contexte & décisions du projet

Mémoire projet versionnée (portable d'une machine à l'autre). Contient le contexte et le « pourquoi » des décisions, pas les tâches actionnables → celles-ci sont dans [ROADMAP.md](ROADMAP.md).

## Nature du projet

Galerie d'art e-commerce à **destination production**.

- **Implication :** les features doivent être solides et sécurisées dès le départ. Signaler et corriger les vrais problèmes de sécurité/robustesse.
- **Nuance :** certaines simplifications sont **temporaires pour le dev** (mot de passe min 3 caractères, code de debug). Ne pas les remonter comme bugs critiques.

## Décisions structurantes

- **Facturation (Invoice)** : le modèle actuel `1 invoice / artwork` est volontairement minimal (issu du refacto Stripe B10). Le besoin réel d'une vraie facture client (line items, numéro séquentiel, mentions légales, TVA art, PDF, conservation 10 ans) a été identifié et **reporté** au refacto B13_INVOICE. Stratégie d'attente : reçu Stripe natif. Détail → [ROADMAP.md](ROADMAP.md).
- **Adresses sur Invoice** : choix **FK + snapshot**. Le snapshot (`billing*`/`shipping*`) est la source de vérité légale figée à l'achat ; la FK sert à la navigation et passe `null` si l'adresse est supprimée. Décidé en B11.
- **Ordre B13_INVOICE avant B14_SHIPING** : structurer Invoice en line items avant d'ajouter le shipping, pour que les frais de port soient un simple line item additionnel (sinon migration plus complexe).
- **Shipping (B14_SHIPING)** : besoin métier explicite de gérer des **transporteurs spécialisés œuvres d'art** (pièces volumineuses/fragiles) en plus des transporteurs standards, avec restriction configurable par œuvre côté admin. Ce besoin n'est pas dérivable du code → consigné pour ne pas l'oublier au scoping. Détail → [ROADMAP.md](ROADMAP.md).

## Robustesse remboursements

Le champ `Invoice.stripeRefundId` sert de **marqueur de récupération** : `null` = remboursement non confirmé. Protège le cas où le webhook crashe entre la transaction DB et `stripe.refunds.create`.

## Notes d'environnement

- DB hébergée sur **Neon** (PostgreSQL) en production.
- Les `.env*` ne sont **pas** versionnés → à recréer sur chaque machine (voir [CLAUDE.md](CLAUDE.md)).
