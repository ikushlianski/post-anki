# Card synthesis mining
## mining-job

### Scope
- Orchestrator, route, dry run, breaker and the Cloud Scheduler job.
- Out of scope: Selection and LLM internals.

### Goal
- The deployed API runs the mining job daily from Cloud Scheduler within the budget, and a dry run shows its cost without any model call.

### Criteria
- [ ] A shared-secret route runs the job and a dry run changes nothing and calls no model
- [ ] A circuit breaker stops the run on repeated failures or a cap hit
- [ ] The scheduler job is created paused and the kill switch is off by default
- [ ] Skipping a day loses nothing
- [ ] Wiring tests pass

### Coding tasks
- [ ] Write the orchestrator tying selection and synthesis together, the route with dry run, the breaker, and the paused Cloud Scheduler job modeled on the existing daily jobs.

### Notes
- Depends on mining-selection and mining-synthesis. Owns the mining orchestrator, its route registration and the infrastructure job.


## mining-synthesis

### Scope
- Two cheap LLM steps: classify a cluster as a chain, then write the overview card grounded in its cards.
- Out of scope: Scheduling.

### Goal
- A cluster that forms a process with no overview card yields a grounded overview card that waits in triage as pending.

### Criteria
- [ ] The classifier returns whether it is a chain, its ordered steps and the evidence cards
- [ ] The writer uses only facts from the evidence cards and cites them
- [ ] A duplicate check against existing overview cards runs before writing
- [ ] New cards get origin synthesis and pending state and are never auto-approved
- [ ] At most 3 new cards per day
- [ ] Every model call is audited with cost and outcome
- [ ] Tests use mocked models

### Coding tasks
- [ ] Add the classifier and writer agents, the grounding check, the duplicate gate and the insert of pending cards with their own source and origin, per the plan.

### Notes
- Depends on mining-foundation and can run beside mining-selection. Owns the two new agents and their registration, plus the pending insert option for sources.


## mining-selection

### Scope
- Choose the day's cards, cluster them and mark them examined exactly once.
- Out of scope: LLM steps.

### Goal
- Each day a bounded slice of approved cards from allowed subjects is grouped into candidate clusters and marked examined forever.

### Criteria
- [ ] Only cards not yet examined are selected, oldest first, up to 60 from one subject subtree
- [ ] Clusters use stored embeddings with a 0.60 similarity threshold
- [ ] Cards in a cluster that failed or found nothing are still marked examined
- [ ] Cards cut off by a cap or breaker are not marked
- [ ] An empty allow-list means the job does nothing
- [ ] Tests cover selection, clustering and marking

### Coding tasks
- [ ] Build the repository for picking unexamined cards, the pure clustering step and the marking of examined cards, per the plan.

### Notes
- Depends on mining-foundation. Owns a new card-synthesis-mining folder for selection, clustering and the examined ledger.


## mining-foundation

### Scope
- Mining-specific database tables, config and kill switch, reusing the shared audit and price work from the similar-cards task.
- Out of scope: Selection, clustering and LLM steps.

### Goal
- The mining job has its ledger tables, caps and an off-by-default kill switch, built on the shared cost audit.

### Criteria
- [ ] A table records every examined card so none is selected twice
- [ ] A table records clusters and their evidence cards
- [ ] The kill switch defaults to off and per-run caps are configurable
- [ ] The daily and monthly spend caps reuse the shared budget check
- [ ] Migration is generated and not applied

### Coding tasks
- [ ] Add the examined-cards and cluster tables with a generated migration, the mining config with caps and an off-by-default switch, and use the shared cost audit and budget check from the similar-cards work.

### Notes
- Needs the known-cards-ledger work in the similar-cards task finished first. Owns the database schema additions and a new card-synthesis-mining config.


