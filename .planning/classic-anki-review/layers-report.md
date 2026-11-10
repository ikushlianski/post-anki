# Phone check: closed layers and chat button overlap (2026-10-11)

Task: extend `scripts/phone-layout-check.mjs` so menus, the drawer, the regenerate panel, the model selects and the "Why?" strip are opened and measured, and add a check that the floating chat button never covers a card field or button.

## What the script now does

- Measures inside an opened layer with the same overflow and 44 px rules (a `rootSelector` scope; when the root is itself a control, the root is measured too).
- Each layer is named, its opener is found by test id or role, and the run fails when the opener is missing or the layer does not appear (6 s timeout). Layers: dashboard row menu, navigation drawer, add-knowledge model select, regenerate confirm panel (with its model select), "Why?" strip after Reject (closed with Undo), subject header menu, compare model picker list.
- The "Why?" strip presses Reject and Undo on real cards, so without `--seed` it prints `NOT VERIFIED` and the run fails.
- Overlap check on the approve screen: scrolls in half-screen steps and compares the fixed chat button box with every card textarea and button box.

## Defects the new layers found (first run, before any fix)

```
FAIL layer dashboard row menu       measured:6 small:6   (188x36 menu items: Open, Review, Add sub-subject, Move under…, Rename, Delete subject)
FAIL layer subject header menu      measured:4 small:4   (188x36 menu items)
FAIL layer decision strip after Reject measured:21 small:11 (reason chips and Undo/Dismiss 32 px high, note input 36 px)
FAIL layer add-knowledge model select measured:0           (script bug: it measured the select's children, not the select)
```

## Fixes (one-class sizing, no other agent was editing these files)

- `apps/web/src/ui/overflow-menu.tsx`: `OVERFLOW_MENU_ITEM_CLASS` is now `flex min-h-[44px] items-center … sm:block sm:min-h-0` (desktop look unchanged).
- `apps/web/src/knowledge-bit/knowledge-bit-review-decision-strip.tsx`: chips `min-h-[44px] sm:min-h-9`, dismiss button `size-[44px] sm:size-9`, note input `min-h-[44px] sm:min-h-0`.
- `scripts/phone-layout-check.mjs`: a root that is itself an interactive element is measured.

## Overlap check: both orders

- The chat-button agent's change to `global-card-chat-panel.tsx` was already in the working tree when the check first ran, so the "before" order could not be reproduced on the real page. The earlier screenshot `proof/phone-layout/approve.png` (before that change) shows the button over a card field.
- Detection proven on a synthetic page with the same test ids (probe code extracted from the script): an overlapping layout reports `["textarea \"\""]`, a clear layout reports `[]`.
- On the real approve screen after the change: `fields or buttons covered: 0`.

## Final run (real output, `node scripts/phone-layout-check.mjs --seed`)

```
ok   dashboard              width 390/390 measured:31 small:0
ok   layer dashboard row menu       width 390/390 measured:6 small:0
ok   layer navigation drawer        width 390/390 measured:7 small:0
ok   add-knowledge          width 390/390 measured:11 small:0
ok   layer add-knowledge model select width 390/390 measured:1 small:0
ok   approve                width 390/390 measured:44 small:0
ok   layer regenerate confirm panel width 390/390 measured:3 small:0
ok   layer decision strip after Reject width 390/390 measured:21 small:0
ok   chat button overlap            fields or buttons covered: 0
ok   review-question        width 390/390 measured:7 small:0
ok   suspended              width 390/390 measured:4 small:0
ok   subject-page           width 390/390 measured:8 small:0
ok   layer subject header menu      width 390/390 measured:4 small:0
ok   admin-settings         width 390/390 measured:11 small:0
ok   admin-compare-models   width 390/390 measured:18 small:0
ok   layer compare model picker list width 390/390 measured:11 small:0
desktop: dashboard ok; grip 28x45, chevron 28x45, search 1027x38, chat button 122x36, row menu 28x28, clear 28x28
extraction data cleared (sources, suggestions, cards); grades kept
PASS: phone and desktop sections verified
```

## Verification

- `node --check scripts/phone-layout-check.mjs`: ok.
- `npx tsc --noEmit` in apps/web: exit 0. `npx vitest run` in apps/web: Test Files 175 passed, Tests 1147 passed.

## Left open

- One intermediate run printed `NOT VERIFIED: approve cards` because the API was restarted by another agent's edit while the run was in progress (the seeded cards were not visible); the next run passed. The script reports such a run as failed, as intended.
- The subject header and dashboard menus open on the actions view only; the follow-up views (add sub-subject, move, rename, delete confirmation) are not opened by the script.
- A native select's popup (model dropdown) is OS-drawn and not measured; the select itself is.
- No real device was used.

## Update after the coordinator's review (two High findings)

### High 1: the chat button overlap check was vacuous at 390 px

- Cause: the button is `hidden sm:block`, so below 640 px it has no size and "covered: 0" always passed.
- Fix in `scripts/phone-layout-check.mjs`:
  - At 390 px the script now asserts the button is hidden, that the `nav-ask-my-cards` entry inside the open drawer (scoped to the drawer, because the hidden desktop sidebar renders the same test id) is at least 44 px high, and that clicking it opens `global-card-chat-panel`.
  - A new section measures the real overlap at 640x900 and 700x900 on the approve screen with a seeded card. A button with no size at those widths is a failure, never a pass.
- The first run of the new section printed a strict-mode error because two elements carry `nav-ask-my-cards` (hidden desktop sidebar and drawer); fixed by scoping to the drawer.

### High 2: Reject/Undo and crashes left data behind

- Reject then Undo leaves a feedback row (verdict back to pending, reason cleared); the sections used to run outside `try/finally`.
- Fix: every browser section now runs in `try/finally`. The cleanup deletes the feedback rows and extraction-grade rows of the sources created by this run (matched by source id, `docker exec` on `post-anki-dev-db` only, ids validated against `^[A-Za-z0-9_-]{1,100}$`), prints the counts, runs `npm run db:dev:clear-extraction`, then asserts that no source created by the run remains.
- The script refuses to seed when the database already has knowledge sources, because the cleanup would remove them.
- Evidence from the real run: `cleanup: deleted 1 feedback row(s) and 0 extraction-grade row(s) that belong to the 1 seeded source(s)` and `ok   cleanup self-check: no source created by this run remains`.
- Two orphan feedback rows from earlier runs of this script (verdict pending, no rating, no wording rating, no reason, no note, same Redis seed text, source already gone) were found after the first run and deleted by a query that only matches that exact shape (`delete ... where verdict='pending' and rating is null and wording_rating is null and reason_code is null and note is null and no source with that id exists`): 2 rows. Final database state: 0 sources, 0 feedback rows, 0 extraction-grade rows, 0 comparison runs.

### Final run (real output, `node scripts/phone-layout-check.mjs --seed`)

```
== phone (390x844) ==
ok   dashboard              width 390/390 measured:31 small:0
ok   layer dashboard row menu       width 390/390 measured:6 small:0
ok   layer navigation drawer        width 390/390 measured:7 small:0
ok   add-knowledge          width 390/390 measured:11 small:0
ok   layer add-knowledge model select width 390/390 measured:1 small:0
ok   approve                width 390/390 measured:44 small:0
ok   layer regenerate confirm panel width 390/390 measured:3 small:0
ok   layer decision strip after Reject width 390/390 measured:21 small:0
ok   chat button on phone           hidden below 640px; reachable through the menu entry (197x44) which opens the chat panel
ok   review-question        width 390/390 measured:7 small:0
ok   suspended              width 390/390 measured:4 small:0
ok   subject-page           width 390/390 measured:8 small:0
ok   layer subject header menu      width 390/390 measured:4 small:0
ok   admin-settings         width 390/390 measured:11 small:0
ok   admin-compare-models   width 390/390 measured:18 small:0
ok   layer compare model picker list width 390/390 measured:11 small:0

== chat button overlap (640x900) ==
ok   chat button overlap @640       fields or buttons covered: 0

== chat button overlap (700x900) ==
FAIL chat button overlap @700       fields or buttons covered: 2
       chat button covers button "Approve"
       chat button covers button "Reject"

== desktop (1280x800) ==
ok   dashboard              width 1280/1280 measured:38 small:0
       (six desktop size checks ok)
cleanup: deleted 1 feedback row(s) and 0 extraction-grade row(s) that belong to the 1 seeded source(s)
extraction data cleared (sources, suggestions, cards); grades kept
ok   cleanup self-check: no source created by this run remains

FAIL: 2 problem(s), 0 unverified
```

### Real defect now visible (not a script problem)

At 700x900 on the approve screen the floating chat button covers the Approve and Reject buttons of a card at some scroll position (at 640x900 it covers nothing). The old 390 px check could never have shown this. This is a web fix (page padding or button position between 640 and about 767 px) outside this task's file scope; the coordinator's chat-button item (A) owns it, and the script will go green when it is fixed.

### Verification

- `node --check scripts/phone-layout-check.mjs`: ok. No web code was touched in this update. Earlier in this task: `npx tsc --noEmit` in apps/web exit 0, vitest 175 files / 1147 tests pass.

END-OF-REPORT

