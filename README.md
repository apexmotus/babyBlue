# BabyBlue — Care, connected.

Public website, backend foundation and Flow demo for the BabyBlue platform (App · OS · Growth · Flow).
Read [PROGRESS.md](PROGRESS.md) first for what is built, tested and blocked.

## Run locally
```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 49 tests (unit + Postgres via PGlite)
npm run typecheck
npm run build
```
Contact-form submissions are written to `.data/leads.jsonl` in development. In production they require Supabase env vars (see `.env.example`); otherwise the API returns 503 and the form says nothing was saved.

## Database
`supabase/migrations/` holds the schema, business functions and RLS. Apply with the Supabase CLI (`supabase db push`) or SQL editor, in order. Tests apply the same files to an in-process Postgres.

## What's where
- Marketing site: `src/app/(site)/*` · Flow demo (fictional data): `/c/rosebank-family`, `/staff/login`
- Docs: BRAND · PRODUCT · ARCHITECTURE · DESIGN_SYSTEM · COMPLIANCE · ROADMAP · PROGRESS · DECISIONS

## Deploy (Vercel)
```bash
vercel deploy --scope jameel-the-designers-projects      # preview (default)
```
1. Set env vars from `.env.example` in the Vercel project (Preview and Production).
2. Keep `ALLOW_INDEXING` unset/false until the production domain is ready.
3. **Production promotion and DNS require explicit authorisation** and are not done here (`vercel --prod` re-points `babyblue-demo.vercel.app`).
4. After deploy verify: `/`, `/patient`, `/practice/login`, `/contact` (submit a test), `/sitemap.xml`, `/robots.txt`, `/og?title=Test`.

## Conventions
Branches: work on `dev`; `staging` and `main` only by explicit merge. Commit messages: `type: BabyBlue — what changed`.
