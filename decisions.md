# Decisions log

One entry per decision: what we chose, what we rejected, why. This becomes DESIGN.md.

## 1. Next.js (App Router) as the single app
- **Chose:** one Next.js app — UI in `app/page.tsx`, API in `app/api/*/route.ts`.
- **Rejected:** separate Express backend + Vite/React frontend.
- **Why:** one `npm run dev` starts everything; no CORS; one deploy. All agent logic lives in `lib/` (framework-agnostic), so Next.js is only the HTTP shell.
