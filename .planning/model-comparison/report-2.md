# Compare page helpers: samples, Run again, suggestion progress

Nothing committed. apps/api/.env and the local Docker DB on 5562 untouched. No migration needed (all three items are web-side and reuse existing endpoints).

## What was built

1. Ready samples. `apps/web/src/model-comparison/model-comparison-samples.ts` holds three samples generated from the fixtures (Russian sales text 751 characters, Russian Redis text 703, English long text trimmed at a paragraph boundary to 2710 characters). `model-comparison-samples-picker.tsx` is a select above the character count; choosing a sample replaces the textarea content, nothing is filled otherwise, and each option shows its length.
2. Run again. `model-comparison-page.tsx` now has one `runComparison(excerpt, modelIds)` used by Run and by `repeatRun(runId)`. A "Run again" button sits next to the Results heading and next to every earlier comparison (`model-comparison-runs-list.tsx`). It loads the earlier run, sends the same excerpt and the same model ids to the normal create endpoint (same validation and cost cap), and shows the new run (new id, no grades). Both buttons are disabled while a run is in progress; a failure shows "Could not repeat that comparison." and leaves the form as it was.
3. Suggestion progress. `admin-compare-models.tsx` loads the same suggestion as the admin settings page and passes it to the page, which renders `ModelSuggestionNote` above the excerpt. `ModelSuggestionNote` now accepts an omitted `onUse` and `currentModelId`; without `onUse` it shows no "Use as default" button (the admin settings page still passes both, so its behavior is unchanged).
4. Docs: `docs/architecture/model-comparison/model-comparison.md` has a new section describing the three helpers in present tense.

## Verification (real outputs)

- `npx tsc --noEmit`: exit 0 in apps/api, apps/web, packages/shared, packages/core.
- apps/web `npx vitest run`: Test Files 173 passed (173), Tests 1126 passed (1126).
- `src/model-comparison` and `src/admin-settings` together: Test Files 8 passed (8), Tests 45 passed (45). New tests: sample picker fills only on choice and shows the count; every sample is within the cap; Run again from the results view sends the same excerpt and models and shows an ungraded run; repeat from the list is disabled while running and re-enabled after; repeat failure keeps the form; progress line with and without evidence shows no Use as default.
- apps/api was not touched, so its suite was not rerun.
- No real-browser run was done for these three items.

## Left open

- Run again repeats the stored excerpt as it was saved (trimmed); the earlier run's grades are untouched.
- The progress line does not refresh after grading on the same page; it updates on the next page load (the suggestion is loaded by the route loader).

END-OF-REPORT
