# Phone layout report (2026-10-11)

Task: phone tap targets of at least 44 px and phone-width checks without horizontal overflow, on the screens listed in docs/architecture/phone-layout.md.

## Root cause worth knowing

- apps/web/src/styles.css sets the spacing unit to 0.22rem, so min-h-11 renders at 39 px. Phone targets use min-h-[44px] (and size-[44px]/w-[44px]).
- A mobile device emulation hides overflow (the layout viewport widens to the content), so the script uses a plain 390x844 window.

## Before (real output, scripts/phone-layout-check.mjs, 390x844)

```
FAIL dashboard              width 457/390 OVERFLOW small:15
FAIL add-knowledge          width 390/390 small:8
FAIL approve                width 390/390 small:55
FAIL review-question        width 390/390 small:4
FAIL suspended              width 390/390 small:4
FAIL subject-page           width 390/390 small:6
FAIL admin-settings         width 390/390 small:11
FAIL admin-compare-models   width 471/390 OVERFLOW small:17
FAIL: 122 problem(s)
```

The full listing named: header logo 70x26, global search 243x35, menu button 21x21, chat button 122x36, subject search 355x38, drag handles and toggles 28 px wide, add-knowledge fields and mode buttons 29-31 px high, grade buttons 28x28, approve/reject/regenerate 39 px high, compare link 18 px high, compare page models checkboxes and select (page 471 px wide), dashboard subject row (page 457 px wide), admin-settings tier options and On/Off toggle 25 px high.

## After (real output)

```
ok   dashboard              width 390/390 small:0
ok   add-knowledge          width 390/390 small:0
ok   approve                width 390/390 small:0
ok   review-question        width 390/390 small:0
ok   suspended              width 390/390 small:0
ok   subject-page           width 390/390 small:0
ok   admin-settings         width 390/390 small:0
ok   admin-compare-models   width 390/390 small:0
extraction data cleared (sources, suggestions, cards); grades kept
PASS: no overflow, no target under 44px
```

## Screenshots (proof/phone-layout/)

- add-knowledge.png
- admin-compare-models.png
- admin-settings.png
- approve.png
- dashboard.png
- review-question.png
- subject-page.png
- suspended.png

Removed stale screenshots review-after-reveal.png and review-empty.png from the earlier session; review-question.png replaces them.

## Verification

- npx tsc --noEmit in apps/web: exit 0.
- Web tests: see the line below.
- vitest run in apps/web: Test Files 175 passed (175), Tests 1144 passed (1144).
- The check script ends with PASS: no overflow, no target under 44px; seeded cards were removed afterwards (db:dev:clear-extraction, grades kept).

## Left open

- Inline links inside running text are not an issue on the screens checked, but any future paragraph link needs the pixel class.
- The floating Ask my cards button still overlaps page content at the bottom right on phones (it is 44 px high now).
- Domain map graph screens still use min-h-11 (their tests assert it) and were not part of this check.
- No real device was used; the check is a 390x844 desktop-browser window.

## Review fixes (second round)

An independent review found two High and two Medium issues. All four are addressed.

- **High 1, the script could print PASS on a broken screen.** The script now requires a landmark per screen within 15 s, checks that `page.goto` answered with a success status, fails when the Business subject id is empty, fails a screen that measured 0 interactive elements, no longer swallows a failed seed wait, requires at least one pending card on the approve screen (otherwise `NOT VERIFIED: approve cards` and a non-zero exit) and exits non-zero on any failure. Proof it can fail: with `APP_URL=http://localhost:5540/does-not-exist` every screen reports `page answered 404` and the exit code is 1.
- **High 2, desktop regressions.** Phone-first sizes now reset at `sm`: subject grip and chevron (`w-[44px] sm:w-8`, grip also `min-h-[44px] sm:min-h-8`), subject search (`min-h-[44px] sm:min-h-0 sm:pr-10`) and its clear button (`size-[44px] sm:size-8`), the floating chat button (`min-h-[44px] px-5 sm:min-h-0 sm:px-4`), the overflow menu button (`-m-[8px] h-[44px] w-[44px] sm:m-0 sm:h-8 sm:w-8`) and the review grade buttons (`min-h-[44px] sm:min-h-11`). A scan of every added 44 px class found no other class without a reset (the mobile menu button is hidden from `md`). The grip test asserts the phone and desktop classes. The script has a 1280x800 section asserting the sizes did not grow.
- **Medium 4, the script wiped the DB by default.** It now seeds only with `--seed`, prints a one-line warning first, and without the flag says it only measures what is on screen.
- **Medium 3 (decision, unchanged).** The curricula count stays hidden on phones; it is listed under Left open.

### Real output of the final run (`node scripts/phone-layout-check.mjs --seed --shots`, exit code 0)

```
WARNING: --seed adds one knowledge source and afterwards runs `npm run db:dev:clear-extraction` (sources and cards only, grades kept).

== phone (390x844) ==
ok   dashboard              width 390/390 measured:32 small:0
ok   add-knowledge          width 390/390 measured:12 small:0
ok   approve                width 390/390 measured:45 small:0
ok   review-question        width 390/390 measured:8 small:0
ok   suspended              width 390/390 measured:5 small:0
ok   subject-page           width 390/390 measured:9 small:0
ok   admin-settings         width 390/390 measured:12 small:0
ok   admin-compare-models   width 390/390 measured:19 small:0

== desktop (1280x800) ==
ok   dashboard              width 1280/1280 measured:38 small:0
       ok  subject grip width <= 32 (28x45)
       ok  subject chevron width <= 32 (28x45)
       ok  subject search height <= 38 (1027x38)
       ok  chat button height <= 36 (122x36)
       ok  row menu button <= 32x32 (28x28)
       ok  search clear button <= 32x32 (28x28)
extraction data cleared (sources, suggestions, cards); grades kept

PASS: phone and desktop sections verified
```

- `npx tsc --noEmit` in apps/web: exit 0.
- `vitest run` in apps/web: Test Files 175 passed (175), Tests 1144 passed (1144).
- After the run `db:dev:clear-extraction` removed the seeded source; the database holds 0 sources and 0 pending bits (grades kept).

## Left open

- The curricula count on the dashboard subject row is hidden on phones by design (decision kept).
- Inline links inside running text are not an issue on the screens checked, but any future paragraph link needs the pixel class.
- The floating Ask my cards button still overlaps page content at the bottom right on phones (it is 44 px high now).
- Domain map graph screens still use min-h-11 (their tests assert it) and were not part of this check.
- No real device was used; the check is a 390x844 desktop-browser window.

END-OF-REPORT
