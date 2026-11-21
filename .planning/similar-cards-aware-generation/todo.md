# Similar-cards-aware generation
## known-cards-wiring

### Scope
- Call the resolver from both extraction paths and document it.
- Out of scope: Judge internals.

### Goal
- New raw notes get the already-known block on both the inline and the durable extraction path, without any retry paying twice.

### Criteria
- [ ] The inline path and the durable path both resolve the block once per chunk
- [ ] A failed or skipped step leaves the chunk output unchanged
- [ ] A retry does not call the resolver again
- [ ] The Notion import and the MCP submit paths are confirmed to reach the same pipeline
- [ ] The ingestion docs describe the current behavior

### Coding tasks
- [ ] Wire the resolver into the inline chunk path and add a remembered known-cards step to the durable extraction workflow, then update the ingestion documentation and verify the MCP and Notion paths reach it.

### Notes
- Depends on known-cards-judge and known-cards-prompts. Owns the extraction orchestrator, the chunk code, the durable steps and the ingestion pipeline doc.


## known-cards-prompts

### Scope
- Let every card-generation prompt accept an optional already-known block.
- Out of scope: Retrieval and judging.

### Goal
- Phrase, lesson, card, legacy and business prompts include the already-known block only when it is not empty.

### Criteria
- [ ] Each of the four generation paths contains the block exactly when it is non-empty
- [ ] The phrase prompt keeps its word-for-word rule
- [ ] Fusion and validation retries reuse one block
- [ ] Tests cover each path

### Coding tasks
- [ ] Add an optional already-known string to the generation options and thread it into the five prompt builders, with the rule to avoid restating those cards and cover a new angle, per the plan.

### Notes
- Owns the extraction types and the source-items, legacy, business, lessons and meeting-phrase agents and prompts, and depends on nothing else.


## known-cards-judge

### Scope
- Retrieve similar approved cards, judge how much they overlap with the new note, and build the capped already-known block.
- Out of scope: Prompt edits and executor wiring.

### Goal
- For a new note we can get a short, safe already-known block, or an empty one when anything fails.

### Criteria
- [ ] Retrieval reuses the existing embedding search with top 6 and a 0.60 floor
- [ ] A cheap judge agent returns exact, near, related or unrelated per candidate with card text treated as untrusted
- [ ] The block lists at most 5 entries and 1200 characters and never includes the judge's free-text reason
- [ ] Every failure returns an empty block and never throws, with the outcome written to the audit table
- [ ] Tests cover alias whitelist, injection text, caps and each failure

### Coding tasks
- [ ] Build the retrieval, the cheap judge agent, the block builder and a resolver that ties them together and respects the budget check and breaker, per the plan.

### Notes
- Depends on known-cards-ledger. Owns the new judge agent, its registration and a new known-cards retrieval, judge, block and orchestrator module, plus the audit purpose list and untrusted-text helper.


## known-cards-ledger

### Scope
- Persisted cost and outcome ledger on the existing model-call audit table, price lookup, daily and monthly budget check, circuit breaker, kill switch.
- Out of scope: Retrieval, judging and prompts.

### Goal
- Every model call is recorded with cost and outcome, and a daily and monthly spend check plus a stored circuit breaker can stop extra calls.

### Criteria
- [ ] Each model call writes tokens, price, outcome and the source it belongs to
- [ ] Daily and monthly caps by cost and tokens are enforced from the stored calls
- [ ] Breaker opens after repeated failures and survives a restart
- [ ] Turning the feature off skips all extra calls
- [ ] Tests cover caps, breaker and off switch

### Coding tasks
- [ ] Add a budget check and a breaker stored in the database that read the audit rows and decide whether extra duplicate-check calls may run, with an off switch setting and tests.
- [ ] Extend the existing model-call audit table with source id, cost and outcome, and fill the price from the existing price list, so every call is traceable and costed. See the plan file for the owned areas.

### Notes
- Owns the database schema and its generated migration, the model-call audit and pricing code, the retry wrapper, the embeddings client and a new known-cards config, ledger and budget module. Plan: .planning/similar-cards-aware-generation/plan.md


