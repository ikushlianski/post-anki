# Storybook blank/error stories: diagnosis and fix

## Summary

Before the fix, 19 of 32 stories on the 6006 instance failed. After the fix, all 37 stories
on a restarted instance (port 6016) load with no console or page errors and a non-empty
`#storybook-root`. The 6006 instance still runs the old Storybook config and must be
restarted to pick up these changes.

## Root causes

1. **Server functions in the browser bundle (10 dashboard stories, module load failure).**
   Components import `*.api.ts` modules that call `createServerFn` from `@tanstack/react-start`.
   That package's server runtime uses `AsyncLocalStorage`, which does not exist in the browser.
   Error: `AsyncLocalStorage is not a constructor`.
   Fix: alias `@tanstack/react-start` to `apps/web/.storybook/stubs/tanstack-react-start.stub.ts`.
   The stub's server functions reject when called. Stories pass data through props, so none call them at render.

2. **No router context (8 knowledge-bit-review stories).** The review page renders `Link`
   from `@tanstack/react-router` without a `RouterProvider`. Error:
   `Cannot read properties of null (reading 'isServer')` in `useLinkProps`.
   Fix: global decorator `apps/web/.storybook/decorators.tsx` (QueryClientProvider plus a memory router),
   registered in `apps/web/.storybook/preview.ts`. Stories that bring their own providers still nest correctly.

3. **Electric sync against a missing endpoint (4 dashboard stories, console 404s).** The board
   collections in `apps/web/src/curriculum/board.collection.ts` sync from `/api/electric-shape`,
   which the Storybook server does not serve. The UI still rendered, but each load logged errors.
   Fix: alias `../curriculum/board.collection` to `apps/web/.storybook/stubs/board.collection.stub.ts`.
   It exports empty local-only collections and re-exports the real pure mappers.

4. **Story bugs (2 stories, not production bugs).**
   - `knowledge-bit-review-suggestion-card--editing-card-inline` clicked a test id
     (`knowledge-bit-review-edit-var-spacing-basic`) that does not exist. The production card has no
     edit button; its Front and Back fields are always editable. The play function now types into the Front field, which triggers the autosave busy state the story describes.
   - `dashboard-subject-search--result-count-and-clear` asserted the result count synchronously, before the debounced search updated it. The assertion is now wrapped in `waitFor`.

## Before (port 6006, original config)

| story id | status | errors | first error |
|---|---|---|---|
| dashboard-home--several-subjects | error | 1 | import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor |
| dashboard-home--empty-dashboard | error | 1 | import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor |
| dashboard-home--subject-menu-open | error | 1 | import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor |
| dashboard-home--nested-subject-expanded | error | 1 | import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor |
| dashboard-home--phone-width | error | 1 | import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor |
| dashboard-subject-search--results-with-parent-path | error | 1 | import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor |
| dashboard-subject-search--no-matches | error | 1 | import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor |
| dashboard-subject-search--result-count-and-clear | error | 1 | import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor |
| dashboard-subject-search--failed-with-retry | error | 1 | import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor |
| dashboard-sortable-subject-group--drag-in-progress | error | 1 | import_browser_external_node_async_hooks.AsyncLocalStorage is not a constructor |
| knowledge-bit-review-suggestion-card--pending-with-three-variants | ok | 0 |  |
| knowledge-bit-review-suggestion-card--waiting-for-questions | ok | 0 |  |
| knowledge-bit-review-suggestion-card--focused-card | ok | 0 |  |
| knowledge-bit-review-suggestion-card--approve-failed | ok | 0 |  |
| knowledge-bit-review-suggestion-card--editing-card-inline | error | 1 | TestingLibraryElementError: Unable to find an element by: [data-testid="knowledge-bit-review-edit-var-spacing-basic"] |
| knowledge-bit-review-approve-page--ready-to-approve | error | 3 | Cannot read properties of null (reading 'isServer') |
| knowledge-bit-review-approve-page--no-pending-suggestions | error | 3 | Cannot read properties of null (reading 'isServer') |
| knowledge-bit-review-approve-page--phone-width | error | 3 | Cannot read properties of null (reading 'isServer') |
| knowledge-bit-review-source-group--source-with-three-items-and-bulk-bar | error | 3 | Cannot read properties of null (reading 'isServer') |
| knowledge-bit-review-source-group-regenerate--idle | error | 3 | Cannot read properties of null (reading 'isServer') |
| knowledge-bit-review-source-group-regenerate--confirming-replace | error | 3 | Cannot read properties of null (reading 'isServer') |
| knowledge-bit-review-source-group-regenerate--regenerating | error | 3 | Cannot read properties of null (reading 'isServer') |
| knowledge-bit-review-source-group-regenerate--failed | error | 3 | Cannot read properties of null (reading 'isServer') |
| suspended-cards-page--mixed-reasons | ok | 0 |  |
| suspended-cards-page--bringing-back-and-failed | ok | 0 |  |
| suspended-cards-page--only-buried | ok | 0 |  |
| suspended-cards-page--more-pages-available | ok | 0 |  |
| suspended-cards-page--empty | ok | 0 |  |
| add-knowledge-selector-lab--desktop-1280 | ok | 0 |  |
| add-knowledge-selector-lab--phone-390 | ok | 0 |  |
| add-knowledge-selector-lab--soft-look | ok | 0 |  |
| add-knowledge-selector-lab--keyboard-walkthrough | ok | 0 |  |

Totals: {"error":19,"ok":13} of 32

## After (port 6016, restarted with the fixes)

| story id | status | errors | first error |
|---|---|---|---|
| add-knowledge-searchable-select--desktop | ok | 0 |  |
| add-knowledge-searchable-select--phone | ok | 0 |  |
| add-knowledge-searchable-select--opened-from-parent-subject | ok | 0 |  |
| add-knowledge-searchable-select--retired-model-is-disabled | ok | 0 |  |
| add-knowledge-searchable-select--keyboard-walkthrough | ok | 0 |  |
| add-knowledge-selector-lab--desktop-1280 | ok | 0 |  |
| add-knowledge-selector-lab--phone-390 | ok | 0 |  |
| add-knowledge-selector-lab--soft-look | ok | 0 |  |
| add-knowledge-selector-lab--keyboard-walkthrough | ok | 0 |  |
| dashboard-home--several-subjects | ok | 0 |  |
| dashboard-home--empty-dashboard | ok | 0 |  |
| dashboard-home--subject-menu-open | ok | 0 |  |
| dashboard-home--nested-subject-expanded | ok | 0 |  |
| dashboard-home--phone-width | ok | 0 |  |
| dashboard-subject-search--results-with-parent-path | ok | 0 |  |
| dashboard-subject-search--no-matches | ok | 0 |  |
| dashboard-subject-search--result-count-and-clear | ok | 0 |  |
| dashboard-subject-search--failed-with-retry | ok | 0 |  |
| dashboard-sortable-subject-group--drag-in-progress | ok | 0 |  |
| knowledge-bit-review-suggestion-card--pending-with-three-variants | ok | 0 |  |
| knowledge-bit-review-suggestion-card--waiting-for-questions | ok | 0 |  |
| knowledge-bit-review-suggestion-card--focused-card | ok | 0 |  |
| knowledge-bit-review-suggestion-card--approve-failed | ok | 0 |  |
| knowledge-bit-review-suggestion-card--editing-card-inline | ok | 0 |  |
| knowledge-bit-review-approve-page--ready-to-approve | ok | 0 |  |
| knowledge-bit-review-approve-page--no-pending-suggestions | ok | 0 |  |
| knowledge-bit-review-approve-page--phone-width | ok | 0 |  |
| knowledge-bit-review-source-group--source-with-three-items-and-bulk-bar | ok | 0 |  |
| knowledge-bit-review-source-group-regenerate--idle | ok | 0 |  |
| knowledge-bit-review-source-group-regenerate--confirming-replace | ok | 0 |  |
| knowledge-bit-review-source-group-regenerate--regenerating | ok | 0 |  |
| knowledge-bit-review-source-group-regenerate--failed | ok | 0 |  |
| suspended-cards-page--mixed-reasons | ok | 0 |  |
| suspended-cards-page--bringing-back-and-failed | ok | 0 |  |
| suspended-cards-page--only-buried | ok | 0 |  |
| suspended-cards-page--more-pages-available | ok | 0 |  |
| suspended-cards-page--empty | ok | 0 |  |

Totals: {"ok":37} of 37

## Notes

- Five `add-knowledge-searchable-select--*` stories appeared in the index after the baseline run. They belong to another agent's work and were not edited here. They pass in the after run.
- The check does not measure visual correctness. It flags console errors, page errors, and an empty `#storybook-root`.
- Production components under `apps/web/src/knowledge-bit/` and `apps/web/src/dashboard/` were not changed. `apps/web/src/storybook/add-knowledge/` was not touched.
- `apps/web/.storybook/stubs/knowledge-bit-review.api.stub.ts` shows as modified in git. This change was not made in this task.
- `npx tsc --noEmit` in `apps/web` reports 0 errors after the changes.
- Check script: `/tmp/post-anki-sb-check/check.mjs` (run with `SB_URL=http://localhost:6016`).
- Nothing was committed or pushed.

END-OF-REPORT
