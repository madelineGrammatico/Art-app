# CLAUDE.md

Galerie d'art e-commerce **destiné à la production** → viser un code propre, sécurisé et testé. Signaler les vrais risques de sécurité/solidité.

**Stack** : Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Prisma 6 / PostgreSQL (Neon en prod) · NextAuth v5 · Stripe · Redux Toolkit + React Query · Tailwind 3 + Radix · Resend · Zod · Vitest.

## Commandes essentielles

```bash
npm run dev            # dev server (turbopack)
npm run build          # prisma generate + next build
npm run db:migrate     # prisma migrate dev
npm run test:db:up     # Postgres de test (docker, port 5433) — REQUIS avant les tests
npm test               # vitest run
```

## Contexte du projet

Le contexte et les décisions du projet sont importés ci-dessous (chargés à chaque session) :

@MEMORY.md

Ce qui reste à faire (refacto invoices, shipping) → [ROADMAP.md](ROADMAP.md) *(lu à la demande).*

## Règles détaillées (chargées automatiquement quand pertinent)

Ces fichiers vivent dans [.claude/rules/](.claude/rules/) et se chargent **conditionnellement** via leur frontmatter `paths:` quand je touche les fichiers concernés — pas besoin de les lire manuellement :

- `conventions.md` → conventions de code (`**/*.{ts,tsx}`)
- `testing.md` → tests, DB docker, factories (`**/*.test.ts`)
- `architecture.md` → auth, stripe, RBAC, modèles Prisma (`app/**`, `src/**`, `prisma/**`)

## Règles de collaboration

- **Git** : la développeuse gère seule commits/branches/PR → ne pas proposer ces opérations spontanément.
- **Éléments dev temporaires** (mdp min 3 caractères, code de debug) → ne pas les signaler comme bugs critiques.
- **Messages utilisateur en français.**

## Setup sur une nouvelle machine

La mémoire auto de Claude (`~/.claude/projects/…/memory/`) est **machine-local et ne voyage pas**. Sur une nouvelle machine, le contexte vient donc **de ce repo** (CLAUDE.md + `@MEMORY.md` + `.claude/rules/`). À recréer manuellement (non versionné) :

- `.env*` (git-ignorés) : `DATABASE_URL`, secrets NextAuth, `GOOGLE_CLIENT_*`, `STRIPE_*` (dont `STRIPE_WEBHOOK_SECRET`), clé Resend. `.env.test` → DB docker port **5433** (`test`/`test`/`art_app_test`).
- Permissions locales (`.claude/settings.local.json`).

Puis `npm install` → `npm run db:migrate` (ou `npx prisma generate`).
