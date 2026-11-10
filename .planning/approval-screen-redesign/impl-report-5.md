# impl-report-5: source card horizontal space

Changed classes (only these):
- apps/web/src/knowledge-bit/knowledge-bit-review-source-group.tsx, source `<li>`: `p-5` -> `px-3 py-5` (all breakpoints; vertical unchanged).
- apps/web/src/knowledge-bit/knowledge-bit-review-page.tsx, `<main>`: `px-4 sm:px-8` -> `px-1 sm:px-2` (page-specific wrapper; max-w-7xl kept).

Checked, no change: knowledge-bit-review-panel.tsx (no horizontal padding), routes/knowledge-bit-review.tsx (none), knowledge-bit-review-source-text.tsx (none), table cell padding (px-3, left as is), routes/__root.tsx untouched.

Default taken: applied px-3 at all breakpoints rather than wide-only, to keep one rule; touch targets unaffected (button sizing unchanged).

Checks (apps/web): npx tsc --noEmit clean; npx vitest run src/knowledge-bit passes. Files staged: the two above only.
END-OF-REPORT
