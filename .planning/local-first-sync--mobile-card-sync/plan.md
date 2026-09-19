# Sync cards to the mobile app locally, Electric-backed

## What and why

The mobile app (`apps/mobile`) has no card-browsing/studying surface yet, and does plain REST
fetch for everything it does have. The `local-first-sync` direction's goal is local-first reads —
cards synced onto the device via Electric (the same mechanism `apps/web` already uses for
subjects/curricula/phrases/attempts), not fetched fresh over the network on every open. Since
there's no existing mobile cards screen to migrate, this builds the mobile cards surface
local-first from the start.

Research confirmed: `@electric-sql/client` has first-party React Native/Expo support via its
default long-poll transport (dedicated package export, `AppState` lifecycle integration, no
IndexedDB dependency, graceful `localStorage` degradation) — the `experimental_live_sse` transport
must NOT be used on mobile (hard browser-only calls). Mobile can authenticate directly against
`apps/api`'s `/electric/v1/shape` endpoint with its existing PAT bearer token — no new auth
mechanism needed, and no web SSR proxy hop (that proxy exists only to hide a web-only secret from
the browser, which doesn't apply here). `topic_cards` has no `topic_id` column — it links via
`card_set_id` → `topic_card_sets.topic_id` — so three tables need syncing and joining client-side:
`topic_card_sets`, `topic_cards`, `topic_card_variants`.

## Phases

### Phase 1: Expose card tables through the Electric shape registry
Goal: `topic_card_sets`, `topic_cards`, `topic_card_variants` become valid Electric shapes.
Key files: `apps/api/src/electric/electric-shape-registry.ts` (add three registry entries, no
`where`/`columns` restriction needed — matches the existing whole-table entries like `phrases`).

### Phase 2: Add the Electric client + a mobile cards collection
Goal: mobile can open a live, locally-cached read of the three card tables.
Key files: `apps/mobile/package.json` (add `@electric-sql/client`), a new
`apps/mobile/src/cards/cards.collection.ts` mirroring `apps/web/src/curriculum/board.collection.ts`'s
shape — three `electricCollectionOptions` collections (card sets, cards, variants), `shapeOptions.url`
pointed at `${apiBaseUrl()}/electric/v1/shape`, `headers: { authorization: async () => \`Bearer ${await getStoredToken()}\` }`
(the async-header-getter form `@electric-sql/client` supports directly), default long-poll only —
never set `experimental_live_sse`/`live_sse`.

### Phase 3: Join into a per-topic card view and render it
Goal: a learner can open a topic on mobile and see its cards, read entirely from the local
Electric-backed collections (no REST call for the read path).
Key files: a join helper (mirroring `board.collection.ts`'s `mapCurriculumRow`'s client-side join
of `curriculumSourcesCollection`) producing `{ concept, variants: [{prompt, answer}] }[]` per
topic; a new `apps/mobile/app/cards/[topicId].tsx` screen; a link to it from the existing
`apps/mobile/app/mentor/[subjectId].tsx` (mirroring `router.push("/practice")`'s existing pattern
in `apps/mobile/app/index.tsx`).

## Constraints and risks

- Whole-table shapes only (the registry deliberately excludes client-supplied filters) — mobile
  receives every learner's card data in these three tables, not scoped to one topic server-side.
  Fine at this app's current single-user scale; a real risk if this ever becomes multi-tenant.
- Must confirm at implementation time whether `@tanstack/electric-db-collection` (the ergonomic
  wrapper used on web) is itself RN-safe, not just the underlying `@electric-sql/client` — the
  research confirmed the wrapper's built output has no browser-only globals, but this wasn't
  exercised end-to-end on a real device/simulator. If the wrapper turns out to have an issue,
  fall back to `@electric-sql/client`'s own `ShapeStream` directly (lower-level, more code, but
  the same RN-support guarantees apply to it directly).
- No offline-write path in this phase — this is a read-only local-first sync (matching what
  `local-first-sync`'s own scope asks for); writes (marking a card reviewed, etc.) still go
  through the existing REST API, unchanged.
