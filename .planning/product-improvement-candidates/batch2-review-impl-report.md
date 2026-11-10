# Batch 2 review items: implementation report

## Item 1: review shortcuts on a Russian layout
- Files: apps/web/src/knowledge-bit/anki-review-keyboard.ts, anki-review-keyboard.test.ts.
- Behavior: undo (KeyZ), edit (KeyE), suspend (Shift+Digit2) and bury (Minus) match the physical key, falling back to the typed character, so all old shortcuts still work. `code` and `shiftKey` are optional facts passed from the keydown event. Typing in an input, textarea, select or editable element still blocks every shortcut.
- Tests: `npx vitest run src/knowledge-bit/anki-review-keyboard.test.ts` (from apps/web) with the daily-storage file: 25 passed, 0 failed (keyboard file 15 tests, including 2 new: Cyrillic key with Latin code, plain Digit2 stays Hard, Cyrillic in a text field ignored).
- tsc: `npx tsc --noEmit` in apps/web, zero errors.
- Defaults: select-all on All cards (knowledge-overview-keyboard.ts) not touched, since that area is off-limits. Grade keys 1-4 and Space unchanged (layout independent).
- Undone: select-all fix.
- Citation: apps/web/src/knowledge-bit/anki-review-keyboard.ts:45 (`event.code === 'KeyZ' || event.key === 'z'`).

## Item 3: local-day review count and streak
- Files: apps/web/src/knowledge-bit/daily-review-storage.ts, daily-review-storage.test.ts.
- Behavior: one helper builds the key from the local year, month and day, used for today and for the look-back. Old UTC keys are left alone, so the first local day after the change may show a lower count.
- Tests: daily-review-storage.test.ts 10 passed, 0 failed under TZ=Europe/Moscow and under TZ=America/Los_Angeles; new cases pin 23:30 and 00:30 and a streak across midnight.
- tsc: zero errors.
- Defaults: used the browser's local clock (same zone browserTimeZone() reports) instead of importing browserTimeZone, because anki-review-session-actions.ts already imports this file and the import would be circular.
- Undone: none.
- Citation: apps/web/src/knowledge-bit/daily-review-storage.ts:1 (`localDateKey`).

END-OF-REPORT
