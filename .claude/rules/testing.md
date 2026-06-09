---
paths:
  - "**/*.test.ts"
---

# Tests

Runner : **Vitest** (config [vitest.config.ts](vitest.config.ts)).

## Lancer les tests

```bash
npm run test:db:up     # 1. démarre Postgres de test (docker compose, port 5433) — REQUIS
npm test               # 2. vitest run
npm run test:watch     # mode watch
npm run test:db:down   # arrête + purge la DB de test (-v)
```

Les tests utilisent une **vraie base PostgreSQL** (pas de mock Prisma), définie par [docker-compose.test.yml](docker-compose.test.yml) : `postgres:16-alpine`, port hôte **5433**, user/pwd/db = `test`/`test`/`art_app_test`, données en `tmpfs` (éphémères). `.env.test` doit pointer `DATABASE_URL` dessus.

## Particularités de la config

- `environment: "node"`, `pool: "forks"`, `fileParallelism: false` → les tests tournent **en série** (ils partagent la même DB).
- `globalSetup` : [src/test/global-setup.ts](src/test/global-setup.ts).
- `setupFiles` : [src/test/setup.ts](src/test/setup.ts) → **`TRUNCATE` de toutes les tables `RESTART IDENTITY CASCADE` avant chaque test**, et `prisma.$disconnect()` en fin de run. Chaque test part donc d'une base vide.
- `include` : `src/**/*.test.ts` et `app/**/*.test.ts`.

## Helpers

- **Factories** : [src/test/factories.ts](src/test/factories.ts) pour créer les entités de test.
- **Mock de session** : [src/test/auth-mock.ts](src/test/auth-mock.ts) → `sessionFor({ id, email?, role? })` retourne une session NextAuth factice (rôle `CLIENT` par défaut).

## Couverture actuelle

Tests existants : `basket.action`, `invoice.action`, `invoices/by-session`, `stripe/webhook`, `stripe/create-checkout-session`, `mail/client`. La refacto invoices (cf. [ROADMAP.md](ROADMAP.md)) devra adapter les assertions `res.error.message`.
