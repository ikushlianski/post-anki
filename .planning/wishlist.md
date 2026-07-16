# Post Anki wishlist

Priority order — top is highest priority. `/grand-loop` picks the first `- [ ]` item.

- [ ] Build a simple React Native mobile app for Post Anki, reusing the existing `apps/api`
      backend contract (the same one the local-first Electric sync work already built the
      gatekeeper for — see `.planning/local-first-electric-sync/spec.md` and
      `docs/architecture/local-first-electric-sync.md`) rather than standing up a parallel
      backend. Start with the core study/review flow, not full feature parity with the web app.
- [ ] Ship the learning-map sidebar chat — already fully planned and `state: confirmed` at
      `.planning/learning-map-chat/` (spec.md, scenarios.md, architecture.md, todo.md), just not
      yet implemented. `/grand-loop` should detect this existing confirmed plan and skip straight
      to the build/verify step rather than re-planning.
- [ ] Build a Tauri desktop app for Post Anki wrapping the same web app / reusing the same
      `apps/api` backend, so the same account and data are available on desktop without a
      separate backend.
