---
paths:
  - "app/**"
  - "src/**"
  - "prisma/**"
---

# Architecture

## Arborescence

- `app/` — routes App Router
  - `app/api/**/route.ts` — endpoints : `auth`, `basket`, `stripe` (`webhook`, `create-checkout-session`), `invoices` (`by-session`), `certificates`, `artworks`, `users`
  - `app/(auth)/` — sign-in / sign-up / forgotPassword / resetForgotPassword
  - `app/admin/artworks/` — back-office : CRUD œuvres + certificats
  - `app/profile/` — basket, checkout (success/cancel), addresses
  - `app/preview/[artworkId]`
- `src/lib/` — logique réutilisable
  - `auth/` — `auth.ts`, `actions/`, `permissions/permissions.ts`
  - `stripe/` — `stripe.ts`, `webhook-handler.ts`
  - `mail/` — clients Resend (`incidentAdminMail`, `resetPawordMail`, `refundUserMail`)
  - `prisma.ts`, `executeAction.ts`, `shema.ts`, `utils.ts`
- `src/components/` — `basket`, `checkout`, `address`, `profile`, `ui`, `reusable-ui`, `providers`
- `store/` — Redux Toolkit (`store.ts`, `slices/`)
- `prisma/schema.prisma`

## Authentification ([src/lib/auth/auth.ts](src/lib/auth/auth.ts))

- **NextAuth v5**, adapter Prisma, `session.strategy = "database"`.
- Deux providers : **Google** (profile mappé, rôle `CLIENT` par défaut) et **Credentials** (email + bcrypt).
- Astuce credentials : le callback `jwt.encode` crée manuellement une session DB (`adapter.createSession` + `sessionToken` UUID) quand `token.credentials` est vrai — pour faire cohabiter strategy database et provider credentials.
- Le callback `session` **exclut** les champs sensibles (`password`, `email`, timestamps…) via le helper `exclude` ([src/lib/utils.ts](src/lib/utils.ts)).
- Cookies : préfixe `__Secure-` + `secure: true` en production.
- Tokens dédiés : `RefreshToken`, `PasswordResetToken` (reset via emails Resend).

## Paiement Stripe

- **Checkout** : `app/api/stripe/create-checkout-session` crée la session.
- **Webhook** : `app/api/stripe/webhook` → [src/lib/stripe/webhook-handler.ts](src/lib/stripe/webhook-handler.ts) vérifie la signature (`STRIPE_WEBHOOK_SECRET`, `constructEvent`) avant traitement.
- À la confirmation de paiement : l'œuvre est transférée à l'acheteur (le webhook vérifie `ownerId: null`), l'`Invoice` passe `PAID`.
- Reçu : `receipt_email` Stripe natif sert de justificatif intérimaire en attendant la vraie facture (cf. [ROADMAP.md](ROADMAP.md)).

## Modèles Prisma (clés)

- **Artwork** : `title`, `price` (Decimal), `ownerId?` (null = disponible à la vente), relations `invoice[]`, `certificate?`, `basketItems[]`. *(Dimensions/poids absents — à ajouter en B14_SHIPING.)*
- **Certificate** : `1—1` avec Artwork (`artworkId @unique`, `onDelete: Cascade`), `issueDate`, `content`.
- **Invoice** : `1 invoice par artwork` aujourd'hui. `status` (`InvoiceStatus`), `amount` (Decimal), `stripeSessionId?`, `stripePaymentIntentId?`, `stripeRefundId?` (marqueur de récupération si le webhook crashe entre la transaction DB et `stripe.refunds.create`). Adresses **FK + snapshot** : le snapshot (`billing*`/`shipping*`) est la **source de vérité légale** figée à l'achat ; la FK est de la navigation pratique, mise à `null` (`SetNull`) si l'adresse est supprimée. Contraintes : `@@unique([stripeSessionId, artworkId])`.
- **PostalAddress** : appartient à un `User` (`onDelete: Cascade`), flags `isDefaultBilling` / `isDefaultShipping`.
- **User** + `Account` / `Session` (NextAuth), `Basket` / `BasketItem`.
- Enums : `InvoiceStatus` (dont `PAID`, `REFUNDED`, `PENDING`), `UserRole` (`ADMIN`, `CLIENT`).

## State client

- **Redux Toolkit** (`store/`) pour l'état UI/global.
- **React Query (TanStack)** pour le data-fetching serveur (`src/lib/tanStack/queryClient.ts`).
