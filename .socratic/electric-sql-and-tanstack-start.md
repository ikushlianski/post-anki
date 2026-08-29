# Electric SQL and TanStack Start

- [✅] server-fn handler body is stripped from the client bundle at build time; only ever runs on the server — `apps/web/src/curriculum/curriculum.api.ts:88-92`
- [🔁] why server-fn-then-invalidate over optimistic `.insert()`: optimistic writes can show the user unconfirmed state ("lying to the user"), requiring rollback/error UX the simpler path avoids — `apps/web/src/curriculum/board.collection.ts:65-75` (no mutation handlers wired)
- [🔁] Electric watches Postgres's write-ahead log via a logical-replication slot, not the client/collection, fanning changes out to matching Shapes
- [✅] Electric's live sync is long polling (bounded-wait request/response, immediately reopened), not one persistent stream
- [🔁] the 20s long-poll timeout exists so Electric's sync service stays stateless and CDN-cacheable (request-collapsing), not for freshness
