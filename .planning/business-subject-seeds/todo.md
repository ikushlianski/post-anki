# Business subject seeds
## seed-business-areas

### Scope
- Make the seed script recreate every current area under Business and add the missing ones.
- Out of scope: Moving other top-level subjects, deleting any subject, desktop app work.

### Goal
- Running the seed on an empty database gives Business all the areas it has today plus Negotiation and Loyalty.

### Criteria
- [ ] The seed lists every area currently under Business, including Sales and Management sub-areas.
- [ ] Negotiation and Loyalty are seeded under Business.
- [ ] Running the seed twice creates nothing new.
- [ ] No existing subject is renamed, moved or deleted.

### Coding tasks
- [ ] [blocked: user] Run the Business seed against the production database, which needs the production connection string.
  - Why: The production database password is a secret I may not fetch without your approval.
  - Decision: Run it yourself, or approve fetching the production connection string to a private file.
  - Default: Run it yourself: DATABASE_URL=<production url> npm run db:seed:business-sub-subjects -w @post-anki/api
- [ ] Decide whether Investing, a separate top-level subject, should move under Business.
  - Why: It is the only top-level subject close to business; the others are languages, programming or test data.
  - Decision: Move Investing under Business or keep it top-level.
  - Default: Keep it top-level.
- [x] Add the nine areas that exist under Business but are missing from the seed, plus Negotiation and Loyalty, and update the seed's test.

### Notes


