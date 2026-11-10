# Impl report: friendly error and not-found pages

## Evidence check
- Confirmed: apps/web/src/router.tsx had no default error, pending or not-found component; __root.tsx has no errorComponent/notFoundComponent; apps/web/src/routes/index.tsx:41 calls `getBoard()` unguarded (other calls use settle); the approval route sets its own errorComponent at apps/web/src/routes/knowledge-bit-review.tsx:10-11.
- Installed @tanstack/react-router 1.170.10 (package.json says "latest"). Types checked in node_modules: `defaultErrorComponent` takes `ErrorComponentProps` (`error`, `reset`), `defaultNotFoundComponent`, `defaultPendingComponent` exist on router options.

## Files changed
- apps/web/src/router.tsx: registers the three defaults.
- New folder apps/web/src/route-fallback/: route-load-error.tsx, route-not-found.tsx, route-pending.tsx, route-fallback.test.tsx.
- Not touched: __root.tsx and routes/index.tsx (not needed). Root-level failures also use the router defaults. The dashboard loader failure propagates to the default error component because `getBoard()` is unguarded.

## Behavior
- Load failure on any route without its own errorComponent: plain message, Retry (calls `reset()` then `router.invalidate()`), link to the dashboard. The raw error is only logged with console.error, never shown.
- Unknown address: "Page not found" with a link to the dashboard.
- Slow navigation: "Loading..." status (router default delay is 1000 ms, left unchanged).
- The approval route keeps its own error screen (route-level errorComponent overrides the default).

## Tests
- `cd apps/web && npx vitest run src/route-fallback`: 1 file, 4 passed, 0 failed.
  Covers: loader failure shows the message and hides the raw error; Retry re-runs the loader through router.invalidate and recovers; unknown route renders not-found with a home link; pending status.
- Tests use a small real router with a throwing loader on `/`, not the real dashboard route (which pulls in Electric collections).

## tsc
- `cd apps/web && npx tsc --noEmit`: no errors.

## routeTree.gen.ts
- I did not edit it. It shows 42 added lines in git diff, but I added no route files, so that comes from other in-progress work or the dev server regenerating it, not from this change.

## Defaults and undone
- Component folder named `route-fallback`. No per-route guard on `getBoard()`. Offline mode out of scope. Approval-route error screen not restyled.

## Citation
apps/web/src/router.tsx:26 (`defaultErrorComponent: RouteLoadError`) with not-found and pending defaults on the following lines.

END-OF-REPORT
