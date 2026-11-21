# Card synthesis mining

## What it does
- Once a day, looks at a small batch of approved cards (oldest unexamined first, up to 60) in one allow-listed subject tree.
- Groups related cards, asks a cheap model whether a group is a chain or process, and drafts one high-level overview card when none exists yet.
- Each card is a seed exactly once; skipping a day loses nothing because selection follows the examined ledger, not the date.

## Safety
- Drafts are filed as pending in triage. Nothing is ever approved automatically.
- Card text reaches the model only as escaped data; outputs are validated and every step must cite its cards.
- Caps: 3 new cards per UTC day, 6 clusters per run, 240 s per run, $0.05 and 150k tokens per day, $1 per month (feature budget), plus the global LLM daily budget.
- The run stops on a budget denial or an open breaker (3 consecutive failed clusters); clusters not reached stay unmarked and return on a later day.

## Kill switch and enabling
- Off by default: `CARD_SYNTHESIS_MINING_ENABLED` must be true/1/on/yes and `CARD_SYNTHESIS_MINING_SUBJECT_IDS` (comma-separated subject ids) must be non-empty.
- Deploy reads both from the repo variables `PROD_CARD_SYNTHESIS_MINING_ENABLED` and `PROD_CARD_SYNTHESIS_MINING_SUBJECT_IDS`.
- The Cloud Scheduler job `post-anki-card-synthesis-mining` (08:00, config `cardSynthesisMiningSchedule`) is paused until the Pulumi config `cardSynthesisMiningEnabled` is true.
- To enable: set the two repo variables, redeploy, run a dry run, then `pulumi config set cardSynthesisMiningEnabled true` and `pulumi up`.

## Route and dry run
- `POST /card-synthesis-mining` with the shared-secret bearer; `?limit=N` only lowers the caps.
- `?dryRun=1` works even when disabled: it reads the batch and clusters it, then reports selected cards and clusters. It writes nothing, marks nothing and calls no model.
- The response summarises `status`, `selected`, `clusters`, `created`, `duplicates`, `notChain`, `ungrounded`, `failed`, `skipped` and `costUsdToday`.
- To re-queue examined cards, delete their rows from `synthesis_mining_examined_bits`.
