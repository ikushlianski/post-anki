# Research: What does 'bot /push auth' mean for pass criteria? Safest reading: no or wrong bearer gives 401. A valid-secret call would trigger a real Telegram push to the owner, so whether to send one (or only check 401) needs a decision.

## Facts
- Fact: The bot's POST /push compares the Authorization header to `Bearer ${TELEGRAM_WEBHOOK_SECRET}` and returns 401 with an empty body when it doesn't match, so a missing or wrong bearer is a safe, side-effect-free check. (source: apps/bot/src/server.ts:149-154)
- Fact: With a valid bearer, /push returns 200 immediately and then runs runDailyPush in the background. That job clears the owner's chat context and sends the day's question to OWNER_TELEGRAM_CHAT_ID. A valid-secret call therefore causes a real Telegram message and a context reset. (source: apps/bot/src/server.ts:156-169)
- Fact: The bot has two other bearer-gated endpoints that mirror /push's auth: one returns 401 at line 194 and the other at line 219. Neither is named in the ticket. (source: apps/bot/src/server.ts:189-219)
- Fact: The secret that /push checks is the same value as the bot's TELEGRAM_WEBHOOK_SECRET. The Cloud Scheduler job sends it as the bearer when it POSTs the bot's /push once a day. (source: infra/index.ts:16)
- Fact: The scheduler job post-anki-daily-push targets `${botService.statuses[0].url}/push`. (source: infra/index.ts:309-323)
- Fact: The API's GET /daily-push only returns a question and delivers nothing. The web app uses it as a pull, and the bot fetches from it. (source: .inbox/TODOS.md:61)
- Fact: The existing manual post-deploy check for the daily push is to trigger the scheduler once and expect a Telegram message. This is a separate, delivering check. (source: .inbox/TODOS.md:56)

## Open questions
- Open question: Pass criterion for 'bot /push auth': the safest reading is that no bearer and a wrong bearer both return 401, with no valid-secret call. Whether the smoke test should also send the real secret and expect 200 (which triggers a real Telegram push to the owner) needs a decision. Without it, the test proves the gate rejects bad callers but not that the deployed secret matches the one the scheduler uses.
- Open question: Whether the API GET /daily-push check should send API_SHARED_SECRET and expect 200, or only check that it returns 401 without credentials. Calling it with the secret runs the mentor and OpenRouter, which costs money, and I did not read the API route or its auth code.
- Open question: How the smoke test gets the prod URLs and secrets (for example PROD_API_DOMAIN and the bot domain from CI env) was not confirmed. I did not read the deploy workflow.
