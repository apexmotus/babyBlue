# BabyBlue — interactive demo

Clickable build of the BabyBlue design canvas (clinic queue: patient mobile web + staff portal).
All data is made up and lives in the browser (`localStorage`), so staff and patient tabs stay in sync.

- Stack: Next.js (App Router) · React · TypeScript · plain CSS tokens (`src/app/globals.css`)
- Demo data: `src/lib/seed.ts` · state + actions: `src/lib/store.ts`
- Source design: `../03_Design/BabyBlue_Design_Canvas_source.html`

## Run
    npm install
    npm run dev

## Try it
1. Staff: `/staff/login` (pre-filled, just sign in) → **Call next** on the queue.
2. Patient: `/q/v-thabo` in a second tab flips from *Waiting* to *You're being seen now*.
3. Floating **Demo** button: reset data, add a random patient, simulate offline.

Next step: real backend (Supabase) + WhatsApp/SMS provider in place of the localStorage store.
