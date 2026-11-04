# Accent phrases
## accent-phrases

### Scope
- Optional accent phrases entered with English knowledge input
- Phrases are stored on the knowledge source and sent to the card-generating model
- Out of scope: Non-English subjects and the Notion phrase import

### Coding tasks
- [ ] [blocked: user] Ship target phrases: commit, open the PR, merge and deploy to production.
  - Why: The tree holds 1,926 uncommitted files from several sessions (bot, desktop and extension work too), the commit hook blocks on 61 report files, the push hook has no grant, and production needs migrations 0128, 0129 and 0141-0144.
  - Decision: Which files go in this PR, and approval to push, merge and migrate production.
  - Default: Open a PR with only the web, API, shared and iOS files from this session and the review-card-chat feature, then deploy after you approve the migrations.
- [x] On iPhone and Mac Add Knowledge, show the same accent phrases group for English subjects and send the filled phrases with the source.
- [x] On the web Add Knowledge form, show an accent phrases group (one input, add and remove more) only for the English subject and its sub-subjects, and send the filled phrases with the source.
- [x] Accept up to 5 optional accent phrases (200 characters each) when a knowledge source is added, store them on the source, and include them in the English card-generation prompt as untrusted data.

### Notes


