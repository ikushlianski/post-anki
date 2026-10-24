# Phone layout

## The rule

On a phone-width screen (390 px) no page scrolls sideways, and every button, link, text field, select and checkbox label is at least 44 px high and 44 px wide. From the `sm` breakpoint up the denser desktop sizes apply.

## Why sizes are written in pixels

`apps/web/src/styles.css` sets the Tailwind spacing unit to `0.22rem` instead of the default `0.25rem`. Every spacing utility is therefore about 12% smaller than its name suggests: `min-h-11` is 39 px, not 44 px. A phone target is written as `min-h-[44px]` (or `size-[44px]`, `w-[44px]`) and relaxed on desktop with `sm:min-h-0` or the desktop size.

Shared button classes (`apps/web/src/knowledge-bit/knowledge-bit-review-classes.ts`) already carry the phone size. New buttons reuse them; a one-off control adds the pixel class itself.

## Wrapping instead of overflowing

Rows that put several pieces of information side by side wrap on phones. The dashboard subject row shows the name and the menu on the first line and the due summary on a second line, and it hides the curricula count that the desktop row shows.

## The check

`scripts/phone-layout-check.mjs` has two sections.

- **Phone (390x844):** every key screen must show its landmark element within 15 seconds, answer with a successful status, hold at least one measurable interactive element, not scroll sideways, and hold no visible button, link, text field, select or checkbox label under 44 px in either direction. Screens: dashboard, add knowledge, approve suggestions, review question, suspended cards, a subject page, admin settings and the compare models page. The approve screen needs at least one pending card; without one it prints `NOT VERIFIED: approve cards` and the run fails.
- **Layers closed by default (phone):** the script opens each one, checks that it appeared, applies the same overflow and 44 px rules to the controls inside it, and closes it again. An opener that cannot be found, or a layer that does not appear, fails the run. The layers are: the three-dot menu of a dashboard subject row, the navigation drawer behind the header menu button, the add-knowledge model select, the regenerate confirm panel with its model select on the approve screen, the "Why?" strip that appears after Reject (the script presses Undo afterwards), the subject header menu on a subject page, and the model picker list on the compare models page. A native select's popup is drawn by the operating system and cannot be measured; the select itself is. The "Why?" strip presses Reject and Undo on real cards, so it only runs with `--seed`; without it the run prints `NOT VERIFIED` and fails.
- **Chat button (phone and just above):** the floating Ask my cards button only exists from 640 px (`hidden sm:flex`, a 44x44 round icon). At 390 px the script asserts that the button is present in the page but hidden (a button missing from the DOM fails the run), that the Ask my cards entry in the open navigation drawer is at least 44 px high, and that clicking it opens the chat panel. At 640, 700, 768, 1024 and 1280 px wide (900 px high) on the approve screen the button must be visible (a button with no size at a width where it must be visible fails the run, so the probe can never pass vacuously) and must not intersect any card textarea or button: the script scrolls in half-screen steps and compares the button's box with each field and button at every step.
- **Desktop (1280x800):** the dense desktop sizes did not grow: the subject grip and chevron at most 32 px wide, the subject search field at most 38 px high, the chat button exactly a 44x44 round icon (page content keeps a 64 px right gutter from the sm breakpoint so the button never covers cards), and the row menu and search clear button at most 32x32.

A checkbox or radio is measured by its label, because the label is the tap area. A development error overlay with a "Hide Error" button is skipped. When a page overflows, the script prints the elements whose right edge passes the screen width.

Run it on the isolated stack, never on the dev app. The stack has its own database, API and web server (see `e2e/README.md`):

```
npm run e2e:stack:up
node scripts/phone-layout-check.mjs --seed --shots
npm run e2e:stack:down
```

The script targets `http://localhost:5550` and the `post-anki-e2e-db` container by default. `scripts/lib/stack-guard.mjs` makes it refuse the dev web and API ports (5540, 5560), the dev database container and the `postanki_dev` database. `--use-dev-app` is the only way to measure the dev app, for a read-only look at the user's own data; it can never be combined with `--seed`.

Without `--seed` the script only measures what is on screen and says so; it never writes to the database. `--seed` refuses to run when the isolated database already holds knowledge sources. Otherwise it prints a warning, adds one knowledge source through the UI to get pending cards (the isolated stack answers extraction with an offline mock, `scripts/e2e-mock-openrouter.mjs`), and runs every section inside a `try/finally`, so the cleanup also runs when a section crashes. The cleanup deletes the feedback and extraction-grade rows that belong to the sources this run created, matched by source id through `docker exec` on the isolated container only (the Reject and Undo step leaves a feedback row behind), prints how many rows it deleted, clears extraction data on the isolated database (sources and cards), and finally asserts that no source created by the run remains. `--shots` saves full-page phone screenshots to `proof/phone-layout/`. `APP_URL` and `PLAYWRIGHT_CORE` override the app address and the Playwright location. The exit code is 0 only when nothing failed and nothing was left unverified.

The script emulates a narrow desktop window, not a mobile device. A mobile emulation widens the layout viewport to fit overflowing content and hides the overflow.

## Chat panel focus

The open chat is a non-modal dialog labelled Ask my cards. Opening it moves focus to the question field; Escape or the close button closes it and gives focus back to the control that opened it (the round button, or the menu button when the phone menu entry opened it). Focus is never trapped: Tab moves on to the page.

## Failures that cannot pass silently

The cleanup of seeded data lists sources through the isolated database; if that query fails the run fails instead of printing a clean result.
