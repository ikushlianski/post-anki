# Searchable select adoption

## What changed
- One shared searchable list (`apps/web/src/ui/searchable-select.tsx`, 243 lines) now backs every selector in the add-knowledge form and the regenerate panel (and the other subject-picker callers through the thin SubjectCombobox wrapper).
- Behaviour: type to filter (case-insensitive, matches group name too), ArrowUp/Down/Enter/Escape/Tab, role=combobox + listbox/option + aria-activedescendant, "nothing matches" row, group headings, per-option badge, disabled options with a reason, 44px rows and field on phones (`min-h-[44px] sm:min-h-0` / `sm:min-h-9`), borderless light grey style.
- Model selector: vendor groups, price per 1M tokens on each row, "Suggested" badge from the existing suggestion hook, no preselected default, explicit choice still required (Replace/submit stay disabled). Models past their `expiresOn` are shown disabled with "Retired <date>"; ones retiring later show "Retires <date>". The model list is the existing curated allowlist from `@post-anki/shared`, not a live OpenRouter fetch.
- Subject selector: unchanged logic in `use-knowledge-subject-choice.ts` (parents hidden unless "Also allow parent subjects", opened parent's children listed first, parent hint). Clearing the text and leaving the field clears the subject. No create-new-subject flow exists in these forms, so none was added.
- No new dependency, no commits.

## Verification (real output)
- `npx tsc --noEmit` (apps/web): exit 0, no output.
- `npx vitest run` (apps/web): Test Files 178 passed (178), Tests 1198 passed (1198).
- eslint: apps/web has no eslint.config.* (ESLint 10 reports "couldn't find an eslint.config.* file"), so lint could not run here.
- Browser: Storybook http://localhost:6006 story `add-knowledge-searchable-select--desktop`, Playwright (chromium) at 390 and 1280 wide, 0 page errors:
  - phone option rows 44px, desktop 36px; groups OpenAI|Anthropic|Google|Mistral|Meta
  - suggested row text: "Claude Haiku 5.5Suggested$0.10 in / $0.50 out per 1M"
  - typing "zzz" shows "No model matches"; typing "sal" + Enter in subject gives "Business › Sales"
- The isolated e2e stack was running (web :5550) but needs auth/seeding; not driven. Dev app :5540 and DB :5562 were not touched.

## Tests
- New: `ui/searchable-select.test.tsx` (filtering, group match, empty state, keyboard, activedescendant, Escape, click, disabled option with reason, clearable, 44px classes).
- Rewritten: `ui/subject-combobox.test.tsx`, `knowledge-bit/extraction-model-select.test.tsx` (vendor grouping, price, suggested badge, retiring vs retired with injected `today`).
- Adapted to the new control: `routes/-add-knowledge.test.tsx`, `knowledge-bit/knowledge-bit-review-panel.regeneration.test.tsx`, `admin-settings/knowledge-item-model-select.test.tsx`, `learning-list/classify-action.test.tsx`.
- Helper: `ui/searchable-select-test-utils.ts`.

## Changed files (all under apps/web/src)
- ui/searchable-select.tsx (new)
- ui/searchable-select.test.tsx (new)
- ui/searchable-select-test-utils.ts (new)
- ui/subject-combobox.tsx
- ui/subject-combobox.test.tsx
- knowledge-bit/extraction-model-select.tsx
- knowledge-bit/extraction-model-select.test.tsx
- knowledge-bit/knowledge-bit-review-regenerate.tsx (wrapper width only)
- knowledge-bit/knowledge-bit-review-panel.regeneration.test.tsx
- knowledge-source/add-knowledge-form.tsx (container width only)
- routes/-add-knowledge.test.tsx
- admin-settings/knowledge-item-model-select.test.tsx
- learning-list/classify-action.test.tsx
- storybook/add-knowledge/searchable-select.stories.tsx (new)

## Notes
- Other files in the working tree (decision strip, panel, etc.) were already modified by other agents; not touched by this work.
- The older lab variants in storybook/add-knowledge are left as they were.
- The admin settings model picker also uses the shared control now (same wrapper).

END-OF-REPORT
