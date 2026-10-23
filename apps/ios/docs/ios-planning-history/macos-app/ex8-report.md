# ex8 report: architecture guide

Wrote docs/ARCHITECTURE.md (121 lines) and added one line to README.md (before "Planned screens"). Both staged, nothing committed, no todo ticked.

Sections: API package, token and server address, shared screens, Mac shell and registry validation, iOS shell, error and load-state conventions, tests, generated project file, add-a-Mac-feature recipe with the Open questions worked example.

Verification: every file path named in the guide was checked to exist at the end (only template placeholders such as Mac<Name>View.swift are unmatched by design). Menu bar, back/forward, drafts and tests being added by siblings are not described, except that ServerScope users were taken from the current tree.

Defaults: no code touched, so tsc/lint/vitest do not apply (Swift repo; no build run). Diff: git diff --cached -- docs/ARCHITECTURE.md README.md

END-OF-REPORT
