## Phone tap-target audit — implementation report 1

### Files scanned

- apps/web/src/knowledge-bit/knowledge-bit-review-panel.tsx — no interactive elements own their sizing; delegates to child components
- apps/web/src/knowledge-bit/knowledge-bit-review-item.tsx — Approve/Reject use PRIMARY_BUTTON_CLASS / SECONDARY_BUTTON_CLASS; both already carry `min-h-11` (44 px)
- apps/web/src/knowledge-bit/knowledge-bit-review-source-group.tsx — "Approve all from this source" uses SECONDARY_BUTTON_CLASS; already at 44 px
- apps/web/src/knowledge-bit/knowledge-bit-grade-control.tsx — 1-5 grade buttons already use `size-[44px] sm:size-8`; no change needed
- apps/web/src/knowledge-bit/knowledge-bit-review-source-actions-menu.tsx — file does not exist in the repo; nothing to fix
- apps/web/src/knowledge-bit/anki-review-card.tsx — Show answer button already carries `min-h-11`; no change needed
- apps/web/src/knowledge-bit/anki-review-grade-buttons.tsx — Again/Hard/Good/Easy already carry `min-h-11`; no change needed
- apps/web/src/knowledge-bit/anki-review-card-actions.tsx — **FIXED** (see below)
- apps/web/src/nav/sidebar.tsx — **FIXED** (see below)
- apps/web/src/routes/add-knowledge.tsx — page-level route file; no interactive elements of its own

### Changes made

**apps/web/src/knowledge-bit/anki-review-card-actions.tsx**
Edit/Bury/Suspend buttons had only `px-2 py-1` (≈ 28 px on mobile). Changed the local `button` constant to add `inline-flex min-h-[44px] items-center justify-center` and `sm:min-h-0`.

**apps/web/src/nav/sidebar.tsx**
All nav links (including "Add knowledge") used `block py-1.5` (≈ 32 px). Changed `navLinkClass` from `block` to `flex items-center` and added `min-h-[44px] sm:min-h-0`.

### Checks

- `npx tsc --noEmit` in apps/web: pre-existing errors only (model-comparison, storybook mocks); zero errors introduced by this change
- `npx vitest run`: 161 pre-existing failures unrelated to changed files; no test files exist for the two files edited; no regressions
- No existing aria-label or test-id assertions reference the button class strings; no test updates required

END-OF-REPORT
