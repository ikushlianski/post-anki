# Statistics page
## statistics

### Scope
- A statistics page in the web app (and later the iPhone) showing the owner's learning and simple learning patterns.
- Time of day and amount learned per day, over time.
- AI spending on cards and on chat, shown separately, over time.
- Out of scope: Advanced analytics, predictions and sharing.

### Goal
- The owner can see how much and when they learn, and what the AI costs for cards and for chat, over time.

### Criteria
- [ ] Learning per day and time-of-day are shown from real review data
- [ ] AI spend over time is shown separately for cards and for chat
- [ ] Production and development figures never mix

### Coding tasks
- [x] Build a Statistics page in the web app with tiles (streak, 7-day accuracy, reviews today, spend this month), daily bars, an hour-of-day chart, and cards-versus-chat spend over time, plus an environment badge so dev and prod are never confused.
- [x] Add a learning statistics endpoint returning reviews, new cards, passed answers and study time per day in the owner's time zone, reviews per hour of day, the streak and the accuracy.
- [x] Add an AI spend endpoint that prices each day's tokens per model with an editable price table (with dated price changes), splits cards, chat and other, and reports calls whose price is unknown instead of counting them as zero.
- [x] Tag every AI call with its purpose (cards, chat or other) through one map from agent to purpose, add the nullable purpose column in a new migration, and keep call records for 400 days instead of 30 so spend history lasts.
- [x] Show the same statistics on the iPhone.

### Notes


