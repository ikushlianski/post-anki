# Duplicate review: report

Built per `plan.md`. Settings > Tools has a "Duplicates" row opening a Subjects/Sources switcher. The simulator build succeeds.

- Subjects: pending pairs with similarity; "Keep A"/"Keep B" ask first (destructive merge), "Not duplicates" rejects; toolbar Scan asks first and reports the count.
- Sources: pending pairs with titles and course names, "Same link" or similarity; Acknowledge and Dismiss without confirm.
- Names missing from lookups show "(removed)"; 409 shows "Already handled." and reloads.

Defaults: one model for both lists; the toolbar Scan runs whichever list is showing.
