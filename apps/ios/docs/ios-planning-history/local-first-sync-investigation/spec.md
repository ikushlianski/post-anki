## The ask
Investigate whether post-anki-ios can get Electric SQL-style local-first sync: fast, snappy,
works offline, no manual refetch.

## What to do
Fact: post-anki's web and Expo mobile apps already sync via `@electric-sql/client` (post-anki
apps/mobile/package.json:6) against Electric's HTTP-based Shape protocol — a documented,
client-agnostic wire protocol (long-polling/SSE, initial snapshot + change log), not tied to
JS/TS.

Assumption (from a web search, not independently verified by running them): real third-party
Swift clients for this exact protocol exist —
`ElectricSwift` (actor-based, handles snapshot/long-poll/SSE/recovery), `ElectricSync`
(SwiftUI + SwiftData persistence), and `electric-sync-swift` (dependency-free shape-stream
client). None are Electric's own official SDK; all are community-maintained, so pin a version
and expect to patch protocol drift ourselves if one goes stale.

Assumption: for this app's small local data (course/deck lists, a knowledge-bit queue),
Electric-style sync is worth it mainly for offline-first browsing and instant list updates, not
raw speed — a plain cached GET already feels fast on a small payload. The real win is not
re-fetching from scratch on every screen open and surviving flaky connectivity.

Superseded: prod Electric has no DB secret set and has never passed a health check (post-anki's
own `.planning/TODO.md`), so there is nothing to sync from yet, and no Electric Swift client is
registered in `TECH-STACK-BY-PROJECT.md` — PowerSync is the entry already named there for
post-anki's mobile app. Revisit Electric here only after prod Electric is actually live; in the
meantime "snappy" comes from a plain local cache (SwiftData or cached JSON), not a sync engine.

## Files to touch
None — investigation only, implementation is a separate todo item.

## Done when
Finding is written above; a follow-up "Coding tasks" item names ElectricSwift + SwiftData
specifically so the next round doesn't re-investigate.
