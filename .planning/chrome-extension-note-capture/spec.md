---
type: spec
branch: chrome-extension-note-capture
task: Chrome extension for quick note/link capture into post-anki's hierarchy
complexity: complex
state: confirmed
updated: 2026-07-11
---

# Spec: Chrome extension note capture

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| P1 — Capture, file, auth, seed | 1,2,3,4,5,6,7,8,9,12,13,14 | `captures` + `extension_tokens` tables; extension-token auth + route allowlist; CORS; lightweight curriculum-creation branch; captures CRUD routes; extension-token admin routes | Chrome extension (popup, context menu, options); admin-settings "Extension Access" section; captures read surface on curriculum detail page | None | Popup capture round-trip < 1s on a warm Cloud Run instance; cold start (scale-to-zero) acceptable up to a few seconds, shown as a loading state, not a failure |
| P2 — Organize/promote | 10,11 | none new — reuses existing `addSources`, `reparse`, `confirmCurriculum`, `deleteModule` | new "Organize captures" screen in apps/web | P1 shipped (needs real unfiled captures to exist) | N/A — bounded by existing AI pipeline's own performance, unchanged |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `validateCaptureContent` | `{ text, sourceUrl }` | valid / invalid (at least one non-empty) | 2, 14 |
| `resolveDefaultHierarchyForOrigin` | page origin, stored origin→path map | pre-selected subject/curriculum/module/topic or none | 7 |
| `isRouteAllowedForExtensionToken` | route name, auth mode (shared-secret / extension-token) | allow / deny | 13 |
| `resolveCurriculumCreationMode` | `sources` array | `"lightweight"` (skip AI) / `"ai-driven"` (existing orchestrator path) | 4 |
| `filterUnfiledCaptures` | captures list | captures with `curriculumId IS NULL AND promotedAt IS NULL` | 10 |
| `hashExtensionToken` | plaintext token | sha256 hash | 9 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| 1. Capture via selection | None | `apps/extension/src/background.ts` (context menu), `apps/extension/src/popup/*` | `apps/extension/manifest.json` |
| 2. Capture via popup | `apps/api/src/capture/capture.controller.ts`, `capture.repo.ts` | `apps/extension/src/popup/capture-form.tsx` | None |
| 3. File under existing path | `apps/api/src/router.ts` (reuse listSubjects/listCurricula/getCurriculum) | `apps/extension/src/popup/hierarchy-picker.tsx` | None |
| 4. Create subject/curriculum inline | `apps/api/src/curriculum/curriculum.controller.ts` (lightweight branch), `curriculum.repo.ts` | `apps/extension/src/popup/hierarchy-picker.tsx` | None |
| 5. Create module inline (escape hatch) | None — reuse existing `createModule` | `apps/extension/src/popup/hierarchy-picker.tsx` | None |
| 6. Read surface for filed captures | `apps/api/src/capture/capture.controller.ts` (list by module/topic) | `apps/web/src/capture/captures-list.tsx`, `apps/web/src/curriculum/module-section.tsx` (mount point) | None |
| 7. Same-site hierarchy memory | None | `apps/extension/src/lib/storage.ts` | None |
| 8. Save feedback | `apps/api/src/capture/capture.controller.ts` (error shapes) | `apps/extension/src/popup/capture-form.tsx` | None |
| 9. Extension token admin | `apps/api/src/extension-token/extension-token.controller.ts`, `extension-token.repo.ts`, `token-hash.ts` | `apps/web/src/extension-token/*`, `apps/web/src/routes/admin-settings.tsx` | None |
| 10. Batch-promote (P2) | reuse `addSources`, `reparse` controllers | `apps/web/src/capture/organize-captures.tsx`, `apps/web/src/routes/organize-captures.tsx` | None |
| 11. Review/finalize AI structure (P2) | reuse `confirmCurriculum`, `deleteModule` | existing curriculum detail page — no new FE | None |
| 12. Seed Webdev hierarchy | `apps/api/scripts/seed-webdev-hierarchy.ts` | None | None |
| 13. Extension token scoped auth | `apps/api/src/server.ts` (`authorized()`), `apps/api/src/shared/env.ts` | None | `infra/index.ts` (`EXTENSION_ID` env var + CORS origin) |
| 14. Capture validation | `apps/api/src/capture/capture.deriver.ts` | `apps/extension/src/popup/capture-form.tsx` (client-side mirror) | None |

### Files to create

```
apps/api/src/
  capture/
    capture.deriver.ts        # validateCaptureContent
    capture.repo.ts
    capture.controller.ts
  extension-token/
    token-hash.ts              # hashExtensionToken
    extension-token.repo.ts
    extension-token.controller.ts
  db/migrations/000X_captures_and_extension_tokens.sql   # generated, not hand-written

apps/web/src/
  capture/
    captures-list.tsx          # SCENARIO 6 read surface
    organize-captures.tsx      # SCENARIO 10/11 (P2)
  extension-token/
    extension-token-list.tsx
    generate-token-dialog.tsx
    extension-token.api.ts
  routes/
    organize-captures.tsx      # P2 route, wraps organize-captures.tsx

apps/extension/                # new app, sibling to apps/api|web|bot
  manifest.json
  package.json
  vite.config.ts
  src/
    background.ts               # context menu + message passing
    popup/
      popup.html
      popup.tsx
      capture-form.tsx
      hierarchy-picker.tsx
    options/
      options.html
      options.tsx                # paste/store extension token
    lib/
      api-client.ts
      storage.ts                 # resolveDefaultHierarchyForOrigin + chrome.storage.local

packages/shared/src/
  capture.schema.ts             # Zod: Capture shape shared by api/web/extension
  extension-token.schema.ts

.planning/chrome-extension-note-capture/
  seed-data.md                  # already written
  diagrams/architecture.mmd, architecture.png, scenario-13.mmd, scenario-13.png
```

### Files to modify

```
apps/api/src/
  db/schema.ts                  # add captures, extension_tokens tables
  router.ts                     # add listCaptures/createCapture/updateCapture/deleteCapture,
                                 # createExtensionToken/listExtensionTokens/revokeExtensionToken
  server.ts                     # authorized(): extension-token check + isRouteAllowedForExtensionToken;
                                 # CORS headers for chrome-extension:// origin — must not change existing
                                 # API_SHARED_SECRET behavior for apps/web/apps/bot
  shared/env.ts                 # EXTENSION_ID env var
  curriculum/curriculum.controller.ts  # explicit lightweight branch on empty sources —
                                 # must not change behavior when sources is non-empty

apps/web/src/
  routes/admin-settings.tsx     # add "Extension Access" section — the existing testToggle
                                 # placeholder stays untouched
  curriculum/module-section.tsx # mount captures-list.tsx per module

infra/index.ts                  # EXTENSION_ID env var wiring for apps/api Cloud Run service
.github/workflows/deploy.yml    # PROD_EXTENSION_ID secret/var if not passed via Pulumi config directly
```

### Data model changes

See `architecture.md` "Data model evolution" — two new tables (`captures`,
`extension_tokens`), no existing table altered. Generate via Drizzle
(`db:generate` / project's existing migrate script), never push directly.

### Documentation changes

No existing `docs/` file covers API auth or the content hierarchy. A new
Mermaid diagram of this architecture will be published to
`docs/architecture/chrome-extension-note-capture.md`, reusing
`diagrams/architecture.png` already rendered during planning.

### Decisions made autonomously

- Extension token route allowlist excludes all delete/probe/socratic/gap/daily-push
  routes — least-privilege default, no meaningful alternative tradeoff.
- `captures` has no separate status enum; "needs organizing" is derived from
  `curriculumId IS NULL AND promotedAt IS NULL` — avoids a redundant column.
- Multi-select promote in P2 uses a client-side loop over single `PATCH`/reuse
  of existing `addSources`, not a new bulk endpoint — avoids premature
  abstraction for what's still personal-scale data.
- Extension built with Vite + a small React popup/options UI (background
  service worker stays vanilla TS, since MV3 service workers can't run React);
  matches the stack already used in `apps/web` rather than introducing a
  second frontend framework.
- Extension distributed as "Load unpacked" for personal use — not published to
  the Chrome Web Store; no store-listing assets planned.
- `chrome.storage.local` (not `sync`) holds the extension token and
  origin→hierarchy memory — avoids syncing a secret through a Google account.
- Seed script (`seed-webdev-hierarchy.ts`) is idempotent on
  subject+curriculum+module name, run manually rather than wired into deploy.

### Implementation order

1. `/tdd validateCaptureContent` — covers SCENARIO 2, 14
2. `/tdd resolveCurriculumCreationMode` — covers SCENARIO 4
3. `/tdd isRouteAllowedForExtensionToken` — covers SCENARIO 13
4. `/tdd hashExtensionToken` — covers SCENARIO 9
5. `/tdd resolveDefaultHierarchyForOrigin` — covers SCENARIO 7
6. `/tdd filterUnfiledCaptures` — covers SCENARIO 10 (P2)
7. Migration: `captures`, `extension_tokens` tables
8. `apps/api`: capture controller/repo, extension-token controller/repo, `server.ts`
   auth + CORS wiring, curriculum lightweight branch
9. `apps/web`: admin-settings Extension Access section, captures read surface
10. `apps/extension`: manifest, background service worker, popup, options
11. Seed script + manual production run (blocked — see `todo.md`)
12. P2: `apps/web` organize-captures screen, wiring to existing `addSources`/`reparse`/`confirmCurriculum`

### Scope boundary

Out of scope for this task:
- Any transformation of capture text into actual flashcard/topic content
  (`topic.summary`, `gaps`) — captures and promoted sources stay raw; content
  authoring remains a human/AI step on the existing curriculum pages.
- Per-suggestion (as opposed to whole-curriculum) accept/reject UI for
  AI-proposed modules — flagged as an open question in `todo.md`, not built
  unless grill-me surfaces it as required.
- Chrome Web Store publishing, multi-device sync of extension state beyond
  `chrome.storage.local`, Firefox/Edge ports.
- Any change to `apps/bot`'s Telegram flows.
