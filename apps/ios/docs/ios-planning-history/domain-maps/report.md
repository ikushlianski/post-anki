# Domain maps: report

Built per `plan.md`. Settings > Tools now has "Knowledge maps" and "Refocus suggestions". The simulator build succeeds.

- Map screen: subject picker, outline tree with coverage and depth chip; node screen with depth picker, courses, destructive merge confirm.
- Triage screens: priority suggestions (with review status and paid-run confirm), document scan, "what to learn next" (accept confirms, then "Open course"), per-course mappings (confirm with depth, reject, suggest), refocus nudges.
- Shared edit: one line `SettingsToolsSection()` in `SettingsScreen.swift` after the Save/Remove section.

Defaults: screen models for triage screens live in the same file as their screen; recommendations are filtered to pending on the client; 409 shows "Already handled." and reloads.
