---
paths:
  - "**/*.{ts,tsx}"
---

# Conventions de code

## Imports

- Alias `@/*` = racine du repo. Ex. : `@/src/lib/prisma`, `@/src/lib/auth/auth`, `@/src/lib/shema`.

## Routes API (`app/api/**/route.ts`)

Pattern standard (cf. [app/api/invoices/by-session/route.ts](app/api/invoices/by-session/route.ts)) :

1. `const session = await auth()` → si pas de session/`user.id` → `401`.
2. Valider les paramètres / le body → `400` (distinguer **body malformé** et **champ manquant** : messages d'erreur distincts).
3. Accès Prisma.
4. `try/catch` global → `console.error(...)` + `500`.

Réponses via `NextResponse.json(...)`. Messages d'erreur utilisateur en **français**.

## Server actions

- Fichiers `"use server"` : **attention**, toutes les fonctions exportées deviennent appelables par n'importe quel client authentifié. Toujours vérifier `userId === session.user.id` quand une action touche des données « own ».
- Envelopper la logique dans `executeAction` ([src/lib/executeAction.ts](src/lib/executeAction.ts)) → renvoie `{ success, message }` et re-throw les erreurs de `redirect`.
- Format d'erreur : renvoyer `error.message` (string), pas l'objet `Error` complet. (Incohérence connue à corriger côté invoices, cf. [ROADMAP.md](ROADMAP.md).)

## Validation

- Schémas **Zod** centralisés dans [src/lib/shema.ts](src/lib/shema.ts) (noter l'orthographe `shema`). `.parse()` côté action/route.

## Permissions (RBAC)

- Rôles `ADMIN` / `CLIENT` définis dans [src/lib/auth/permissions/permissions.ts](src/lib/auth/permissions/permissions.ts).
- Vérifier via `hasPermissions(role, "action:ressource")`.
- Distinguer les permissions globales ADMIN (`view:invoice`) des permissions « own » CLIENT (`view:ownInvoice`).

## Montants

- Les prix/montants sont des `Decimal` Prisma → convertir en `Number` au moment de sérialiser vers le client (`Number(invoice.amount)`).

## Style

- Messages destinés à l'utilisateur final : **français**.
- Composants UI : style shadcn (`components.json`), primitives Radix, `tailwind-merge` + `clsx` (helper `cn` dans [src/lib/utils.ts](src/lib/utils.ts)).
