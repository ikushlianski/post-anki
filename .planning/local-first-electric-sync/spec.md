---
type: spec
branch: local-first-electric-sync
task: Local-first read path for the dashboard board via ElectricSQL + TanStack DB
complexity: complex
state: confirmed
updated: 2026-07-16
---
# Spec: Local-first sync, proof-of-concept slice

Goal: prove the local-first pattern end-to-end on ONE read-heavy screen (the subjects/
curricula board, `apps/web/src/routes/index.tsx`) before expanding further. Everything else
in the app keeps its current fetch-through-`apps/api` path unchanged.

### Why this shape (decisions made autonomously)

1. **TanStack Start is already in place** — no router/SSR migration needed. Only Electric +
   TanStack DB are new.
2. **Electric self-hosted on Cloud Run, `minScale: 1`** (user chose self-host over Electric
   Cloud) — the other 3 services stay `minScale: 0`; Electric alone needs to stay warm for its
   persistent replication connection to Neon.
3. **Electric service is PRIVATE** (no `allUsers` invoker) — unlike the other 3 services, it
   has no app-level auth of its own, so it's protected by Cloud Run IAM instead. Only
   `apps/api`'s service account gets `roles/run.invoker` on it.
4. **`apps/api` owns a shape gatekeeper**, not `apps/web` directly — `GET /electric/v1/shape`
   on `apps/api` authenticates the existing `API_SHARED_SECRET` bearer, then proxies 1:1 to
   Electric's `/v1/shape` (forwarding `table`/`offset`/`handle`/`live`/`cursor` params and the
   `electric-*` response headers), using a GCP ID token for the private Cloud Run call. This
   is the piece a future mobile client reuses as-is — it talks to `apps/api`, never to Electric
   directly.
5. **`apps/web` adds a thin same-origin server route**, `GET /api/electric-shape`, that forwards
   the browser's `ShapeStream` requests to `apps/api`'s gatekeeper server-side — the browser
   must never hold `API_SHARED_SECRET` (existing invariant in `api-client.ts`), so it can't call
   `apps/api` directly.
6. **No per-user `WHERE` scoping yet** — this app is single-user today (matches the existing
   `user_streaks` single-row precedent); the gatekeeper's job is authentication, not
   multi-tenancy. Multi-tenancy is a non-issue for "mobile reuse" since mobile will be the same
   one user, just a second client.
7. **Writes are unchanged** — `index.tsx`'s board is read-only today (create/delete subject
   happens elsewhere), so this slice needs no optimistic-write wiring yet. That pattern is
   deferred to whichever slice tackles a write-heavy route.
8. **IaC only, no live deploy in this pass** — Pulumi source is written and typechecked but
   `pulumi up` is NOT run. Same for any Neon console changes (direct/non-pooled connection
   string). Both are handed off via `todo.md`.

### Contract between the pieces

```
Browser (index.tsx)
  → @electric-sql/client ShapeStream, url: /api/electric-shape (same-origin)
apps/web server route (Nitro/TanStack Start API route)
  → forwards to apps/api, header: Authorization: Bearer API_SHARED_SECRET
apps/api  GET /electric/v1/shape
  → validates bearer, forwards to Electric Cloud Run service (private), with a GCP ID token
Electric (Cloud Run, minScale 1)
  → reads Postgres logical replication (Neon `main`), serves the shape
```

### Files to create

```
infra/index.ts                          — + Electric Cloud Run service (private, minScale 1),
                                            + apps/api SA granted run.invoker on it
apps/api/src/electric/
  electric-proxy.controller.ts           — GET /electric/v1/shape handler
  electric-proxy.service.ts              — forwards to Electric w/ GCP ID token
apps/web/src/routes/
  api.electric-shape.ts                  — same-origin proxy route (TanStack Start API route)
apps/web/src/curriculum/
  board.collection.ts                    — TanStack DB electric collection for subjects/curricula
docs/architecture/local-first-electric-sync.md — architecture doc + Mermaid diagram
```

### Files to modify

```
apps/api/src/server.ts                  — register the new /electric/v1/shape route
apps/api/package.json                   — + google-auth-library (ID token minting)
apps/web/src/routes/index.tsx           — loader/board render swaps to the TanStack DB live query
apps/web/package.json                   — + @electric-sql/client, @tanstack/db,
                                            @tanstack/react-db (or current equivalent pkg names —
                                            confirm exact current package names before installing)
```

### Scope boundary

Out of scope this pass: any other route's conversion (dashboard, curriculum tree, stats,
probe/quiz sessions, chat) — those stay on the existing fetch path until this slice is proven
in production. Optimistic writes / mutation wiring. Electric Cloud (self-host chosen instead).
Per-user shape scoping. Mobile app itself (only the reusable contract is being built).
`pulumi up`, Neon console changes, and any live deploy/test — handed off in `todo.md`.
