# Chat panel focus and two false passes in the phone check (2026-10-11)

Item: Fix chat panel focus handling and two false passes in the phone check.

## What changed

- `apps/web/src/global-card-chat/global-card-chat-panel.tsx`: the open panel has `role="dialog"`, `aria-label="Ask my cards"` (non-modal, no focus trap, `tabIndex -1`); focus moves to the question field on open; Escape and the close button (now with an aria-label) close it; on close focus returns to the first visible of: the control that opened it, the round button, the phone menu button (`mobile-nav-toggle`).
- `scripts/phone-layout-check.mjs`: (a) a failed dev-database query now throws (`listSourceIds`), the start-up read exits 1 and the cleanup paths count a failure instead of printing an empty clean list; (b) the phone chat check distinguishes `absent` (fails), `hidden` (needs the menu entry assertion) and `visible` (fails).
- `docs/architecture/phone-layout.md`: updated (chat focus section, absent-versus-hidden, silent-failure rule).

## Tests

- New in `global-card-chat-panel.test.tsx`: dialog role and label, focus into the question field on open, Escape closes and restores focus to the round button, close restores focus to the menu button or round button when opened from the phone menu entry, Tab leaves the panel (no trap).

## Real output

- `npx tsc --noEmit` in apps/web: exit 0.
- `npx vitest run` in apps/web: Test Files 175 passed (175), Tests 1152 passed (1152).
- `node scripts/phone-layout-check.mjs --seed`: exit 0, ended with `cleanup: deleted 1 feedback row(s) and 0 extraction-grade row(s) that belong to the 1 seeded source(s)`, `extraction data cleared (sources, suggestions, cards); grades kept`, `ok   cleanup self-check: no source created by this run remains`, `PASS: phone, chat overlap and desktop sections verified`. Overlap at 640, 700, 768, 1024 and 1280 px: covered 0 each.
- Database afterwards: 0 knowledge sources, 0 feedback rows.

## Left open

- The failing-query path of the script was verified by reading the code (a missing container makes `docker exec` fail, so `psql` returns not ok and the helper throws); it was not exercised by stopping the database.

END-OF-REPORT
