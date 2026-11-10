# Select-all on All cards works on a Russian keyboard layout

## Files changed
- apps/web/src/knowledge-bit/knowledge-overview-keyboard.ts
- apps/web/src/knowledge-bit/knowledge-overview-keyboard.test.ts

## Behaviour
- Ctrl/Cmd+A selects all loaded rows when the physical key is KeyA (event.code) or when event.key is a/A, as before.
- Shift, repeat and Alt still block it.
- Inside input, textarea, select or contenteditable (isTypingTarget) and on buttons, the shortcut returns null, so the browser selects the field text.
- Caller use-knowledge-overview-selection.ts passes the React keyboard event straight to the resolver, which already carries code, so it needed no change.

## Tests
- Command: `npx vitest run src/knowledge-bit/knowledge-overview-keyboard.test.ts` in apps/web
- Result: 1 file passed, 17 tests passed, 0 failed.
- New: Cyrillic key with code KeyA selects all (Ctrl and Cmd); Cyrillic key on KeyB does nothing; Cyrillic key with KeyA inside input and textarea is ignored.
- Existing Latin Ctrl+A and in-input tests still pass.

## tsc
`npx tsc --noEmit` in apps/web: no errors.

## Defaults and undone
- Defaults: optional `code` field on OverviewKeyEvent, matching ReviewKeyFacts.
- Nothing undone. No staging or commits.

## Citation
apps/web/src/knowledge-bit/knowledge-overview-keyboard.ts:43 (`event.code === 'KeyA' || event.key.toLowerCase() === 'a'`)

END-OF-REPORT
