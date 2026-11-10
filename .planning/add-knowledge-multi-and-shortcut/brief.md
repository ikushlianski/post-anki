# Add knowledge: several pieces per subject on native, configurable highlight shortcut

## 1. Several raw pieces under one subject (Mac + iPhone)
- Web already does this: `apps/web/src/knowledge-source/add-knowledge-form.tsx` keeps a list of blocks
  (`knowledge-form-blocks.ts`, `knowledge-block-list.tsx`) with "add another", per-block remove, one subject for all,
  submitted via `submit-knowledge-blocks.ts` (one knowledge source per block). Mirror that behaviour natively.
- Native Add knowledge today is one input: `apps/ios/Sources/Shared/add-knowledge-screen.swift`, `add-knowledge-composer.swift`,
  `add-knowledge-input.swift`, `add-knowledge-highlights-bar.swift`, footer, previews, subject picker.
- Each piece keeps its own text, highlights and target phrases; one subject picker applies to all; Submit sends every
  non-empty piece; failed pieces stay in the list with their reason, sent ones clear (same as web).
- Reuse the existing native create-knowledge-source client call per piece; no new API unless the web uses one.

## 2. Configurable highlight shortcut (Mac + web; iPhone with a hardware keyboard gets it for free via SwiftUI)
- Web has a hard-coded Cmd/Ctrl+Shift+H in `apps/web/src/knowledge-source/highlighted-text-field.tsx`; native has no shortcut.
- New default: Command+D (Ctrl+D on non-Mac web). The highlight button keeps working.
- Configurable per device: a setting "Highlight shortcut" (record a key combo, or pick from a short list, reset to default).
  Web: store in localStorage alongside existing per-browser prefs; Mac: UserDefaults/AppStorage in Mac settings.
  Follow where each platform already keeps per-device preferences.
- Must not break Cmd+Enter submit; ignore combos that clash with it.
- Show the current shortcut in the highlight button's tooltip/label.

## Out of scope
Server changes, highlights semantics, iPhone settings UI for the shortcut (Mac and web only).

## Done when
- Web vitest for touched files passes (`--maxWorkers=2`), tsc clean.
- `apps/ios/scripts/run-mac.sh --test` passes with new tests for multi-piece submit and the shortcut setting; generic
  iOS simulator build of PostAnkiIOS succeeds.
