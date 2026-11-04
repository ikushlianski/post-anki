# Todo: add-knowledge-subject-check

## shared-contract

### Scope
- Request and response schemas for the subject check
- Out of scope: No API or UI code

### Goal
- One Zod contract defines the check request and every possible response.

### Criteria
- [x] Request caps excerpt length and block count
- [x] Response is ok, none or unavailable
- [x] Confidence is high, medium or low

### Coding tasks
- [x] Add request schema with text and url blocks, excerpt cap and optional parent subject id.
- [x] Add response schema as ok, none or unavailable with recommendations and optional new-subject proposal.
- [x] Add unavailable reason enum: disabled, budget, rate_limited, timeout, failed.
- [x] Export the schemas from the shared index and add schema tests for each response variant.

### Notes
- Owns packages/shared/src/knowledge-source-subject-check.ts, its test, packages/shared/src/index.ts
- Depends on none

## candidate-selection

### Scope
- Pick the few existing subjects shown to the model
- Out of scope: No model call, no HTTP route

### Goal
- Choose at most fifteen assignable subjects with short descriptions and sample cards for the prompt.

### Criteria
- [x] Subjects with children are never candidates
- [x] More than fifteen leaves are shortlisted by similarity
- [x] A parent scope limits candidates to its leaves

### Coding tasks
- [x] Add a repo query returning leaf subjects with description, derived kind, embedding and two approved sample statements.
- [x] Reuse the effective-subject expression so sample cards follow the bit's real subject.
- [x] Add shortlistCandidates: all leaves when fifteen or fewer, else nearest by embedding then leaves lacking one.
- [x] Add a parent-scope filter reusing the subtree helper from the core package.
- [x] Add pure tests for shortlist order, cap, missing embeddings and parent scope.
- [x] Add a Postgres integration test for the repo query, in its own file.

### Notes
- Owns apps/api/src/knowledge-source/knowledge-source-subject-check.candidates.ts, .candidates.repo.ts, their tests
- Depends on shared-contract
- Uses existing subject-kind derivation; description trimmed to 120 chars, samples to 100.

## checker-agent

### Scope
- Cheap-tier agent that advises on a subject from untrusted text
- Out of scope: No persistence, no tools

### Goal
- The model sees escaped excerpts and aliased candidates and returns schema-checked advice only.

### Criteria
- [x] Excerpts are wrapped in tags and escaped
- [x] Candidates are shown as aliases, never real ids
- [x] Output that fails the schema throws

### Coding tasks
- [x] Add the agent with cheap tier, no tools and instructions that treat tagged text as data.
- [x] Add buildCheckPrompt: escaped excerpts, aliased candidates, parent names for new subjects.
- [x] Add the model-output Zod schema: up to three alias recommendations and optional new-subject proposal.
- [x] Run the call through recordGenerateCall with no retries, a 12 second timeout and the output-token cap.
- [x] Register the agent and its key in the agent registry.
- [x] Add tests with the agent mocked: prompt escaping, alias mapping, schema failure; no real model call.

### Notes
- Owns apps/api/src/mastra/knowledge-source-subject-checker.agent.ts, its test, apps/api/src/mastra/mastra.ts
- Depends on shared-contract
- Verify the output-token option exists on the Mastra generate call; otherwise rely on prompt size only.

## check-endpoint

### Scope
- Validate, cap and serve the check
- Out of scope: No change to the save endpoints

### Goal
- One route returns validated advice or unavailable and never throws to the client.

### Criteria
- [x] Unknown aliases and bad names are dropped
- [x] Hourly cap and budget give unavailable
- [x] Switch off gives unavailable without a call

### Coding tasks
- [x] Add the config file: excerpt sizes, candidate cap, hourly cap 30, timeout, enabled switch.
- [x] Add validateAdvice: drop unknown aliases, dedupe, sort by confidence, sanitize name and reason, drop sibling-name clashes.
- [x] Add placeNewSubject: business hints under the Business root or top-level Business, language hints as language kind.
- [x] Drop the new-subject proposal whenever a high recommendation exists.
- [x] Add a call-log count by operation and time window for the hourly cap.
- [x] Add the orchestrator: caps, shortlist, one agent call, validate, map every error to unavailable.
- [x] Add the controller and register POST /knowledge-sources/subject-checks in the route table and router.
- [x] Add tests: injected instructions, hallucinated alias, over-budget, hourly cap, timeout, switch off.

### Notes
- Owns apps/api/src/knowledge-source/knowledge-source-subject-check.{config,validate,orchestrator,controller}.ts, their tests, router-table.ts, router.ts
- Owns apps/api/src/llm-call-events/llm-call-events.repo.ts count addition
- Depends on shared-contract, candidate-selection, checker-agent
- Embed the excerpt once with the existing embeddings client; failure falls back to listing candidates by name order.

## web-data

### Scope
- Client calls and the decision of when to check
- Out of scope: No visual components

### Goal
- The form can request a check and knows when to skip, retry or stop.

### Criteria
- [x] Chosen subject means no request
- [x] Declined text is not rechecked until edited
- [x] Any thrown error becomes unavailable

### Coding tasks
- [x] Add the check call to the web API client and a server function.
- [x] Add use-subject-check: states idle, checking, advice, unavailable, dismissed.
- [x] Add decideCheckNeed covering picked subject, preselected leaf, preselected parent scope and dismissal.
- [x] Clear dismissal and advice when any block text or type changes.
- [x] Add hook tests with the server function mocked.

### Notes
- Owns apps/web/src/knowledge-source/use-subject-check.ts, its test, knowledge-source.api.ts, apps/web/src/curriculum/api-client.ts
- Depends on shared-contract, check-endpoint

## form-extraction

### Scope
- Make room in the Add knowledge form
- Out of scope: No behavior change

### Goal
- The form file stays under 300 lines after the check is wired in.

### Criteria
- [x] Existing form tests pass unchanged
- [x] Form file is under 250 lines

### Coding tasks
- [x] Move the block list rendering into its own component with the same test ids.
- [x] Run the existing form and route tests unchanged to prove no behavior change.

### Notes
- Owns apps/web/src/knowledge-source/knowledge-block-list.tsx, add-knowledge-form.tsx
- Depends on none

## recommendation-panel

### Scope
- What the owner sees and taps
- Out of scope: No auto-filing, no stored decisions

### Goal
- The owner sees ranked suggestions and chooses; nothing is filed without a tap.

### Criteria
- [x] Primary style only on a high row
- [x] Pick another focuses the subject picker
- [x] Unavailable adds unfiled with a visible notice

### Coding tasks
- [x] Add the panel with up to three suggestion rows, pick another and add without subject.
- [x] Add the create-and-add row calling the existing create-subject function then saving under the new id.
- [x] Render model text as plain text; panel is a polite live region with 44px targets.
- [x] Show a success-line notice when added unfiled because suggestions were unavailable.
- [x] Add panel and form tests; mock the check in existing form tests so they pass unchanged.
- [x] Wire the form: a blank subject runs the check, a tap submits, none or unavailable submits unfiled.

### Notes
- Owns apps/web/src/knowledge-source/subject-check-panel.tsx, its test, add-knowledge-form.tsx wiring
- Depends on web-data, form-extraction
- Parent-preselected hint and allow-parents behavior must keep working.

## docs-and-verify

### Scope
- Documentation and final gates
- Out of scope: No new features

### Goal
- Docs describe the pre-save check and every quality gate passes.

### Criteria
- [x] Pipeline doc names the check step
- [ ] Typecheck and lint are clean
- [x] Vitest passes for touched files

### Coding tasks
- [x] Update the ingestion pipeline doc with the pre-save subject check step.
- [ ] Run typecheck, lint and vitest for touched packages and fix findings.
- [ ] Try the check by hand on real subjects, including business, language and unclear text.

### Notes
- Owns apps/api/src/knowledge-bit/ingestion-pipeline.md
- Depends on recommendation-panel, check-endpoint

## Decisions to make
- [ ] Confirm: never auto-file a high-confidence match (default: always one tap).
- [ ] Confirm: check before saving, not in the background after (default: before).
- [ ] Confirm: URL blocks use the URL only, no page fetch (default: URL only).
- [ ] Confirm: AI may propose a new subject only when no strong match (default: yes).

