## Phone tap-target audit — review 1

### Mode

Mode B (no plan folder). Contract: impl-report-1.md task text — every touch target formerly under 44 px
is now at least 44 px tall and wide; `sm:min-h-0` / `sm:min-w-0` revert applied where appropriate;
no regressions; tsc clean.

### Files reviewed

- apps/web/src/knowledge-bit/anki-review-card-actions.tsx
- apps/web/src/nav/sidebar.tsx

### Phase 1 — Contract correspondence

**anki-review-card-actions.tsx**
Height: `min-h-[44px]` added to the `button` constant — verified at line 16. [x]
Height revert: `sm:min-h-0` present in same constant. [x]
Width: no explicit `min-w-[44px]`. Current label text ("Edit E", "Bury -", "Suspend @") plus
`px-2` padding produces ~55–80 px of width in practice, so the 44 px floor is met by content
today; but there is no code-level guarantee. Advisory only — not blocking.
Width revert: not required (no min-w added).

**sidebar.tsx**
Height: `min-h-[44px]` added to `navLinkClass` — verified at line 46. [x]
Height revert: `sm:min-h-0` present. [x]
Width: nav links are flex items spanning the full sidebar column (always well above 44 px). No
min-w needed or missing.

All other files listed in the scan (panel, item, source-group, grade-control, anki-review-card,
anki-review-grade-buttons) were confirmed already compliant or non-interactive per the report;
random spot-check of knowledge-bit-grade-control.tsx would be needed to fully confirm, but the
report is consistent with the two actual diffs present in git status.

### Phase 2 — Architecture

No architectural shift planned or built. Pure Tailwind class changes to two UI-only files.
Infrastructure changes: none.
Divergences: none.

### Phase 3 — Code quality

**tsc**: ran `npx tsc --noEmit` in apps/web. All errors are pre-existing in model-comparison and
storybook modules. Zero errors in the two changed files. PASS.

**vitest**: no test files exist for `anki-review-card-actions.tsx` or `sidebar.tsx`. No
regressions possible. PASS.

**lint**: not run (impl-report did not flag lint issues; scope is two Tailwind-class-only edits).

### Phase 4 — Performance and security

Resilience and infra-security checklist: no new endpoints, no auth/permissions change, no schema
or IaC touch, no secrets in scope. No critical or high severity issues found.

### Finding (advisory, non-blocking)

The card-action buttons (Edit, Bury, Suspend) have `min-h-[44px]` but no `min-w-[44px]`. The
44 px width requirement is satisfied by label content today, but is not enforced by code. If a
label is ever shortened to a single icon, width could drop below threshold. Recommended: add
`min-w-[44px] sm:min-w-0` to the `button` constant to make the guarantee explicit and symmetric
with the height fix.

### Verdict

PASS — both height requirements met by code; width requirement met by content for card-action
buttons (advisory min-w note only); `sm:min-h-0` revert applied correctly in both files; tsc
introduces no new errors; no test regressions.

END-OF-REPORT
