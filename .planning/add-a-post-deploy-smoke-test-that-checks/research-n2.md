# Research: Should the /push auth check use only a negative case (a wrong or missing bearer returns 401, no message sent), or also a valid-secret call? A valid call sends a real Telegram message to the owner.

## Facts
- Fact: The bot's POST /push compares the Authorization header with `Bearer ${TELEGRAM_WEBHOOK_SECRET}`. A mismatch returns 401 with an empty body, before any push logic runs. This makes a wrong or missing bearer a safe negative check. (source: apps/bot/src/server.ts:149-154)
- Fact: With a valid secret, /push returns 200 immediately and then runs runDailyPush in the background (fire-and-forget). The 200 therefore does not show that a message was delivered. (source: apps/bot/src/server.ts:156-160)
- Fact: A valid call sends the owner's Telegram chat a question and digest via sendTodaysQuestion and sendMessageWithKeyboard. It first clears the owner's chat context (clearChatContext), which is a side effect beyond the message. (source: apps/bot/src/server.ts:166-175)
- Fact: runDailyPush returns 'paused' without sending if reminders are paused. It claims the local day first and returns 'duplicate' if the day was already claimed. Otherwise it sends and returns 'sent'. A smoke-test valid call made before the scheduled run would therefore claim the day and could suppress that day's real scheduled push. A call after the scheduled run would be a no-op duplicate that proves nothing about auth. (source: apps/bot/src/digest/daily-push.ts:34-55)
- Fact: The scheduler authenticates to /push with the same value, the Pulumi secret telegramWebhookSecret. It must equal the bot's TELEGRAM_WEBHOOK_SECRET. A negative-only test cannot prove that the two secrets match. (source: .inbox/TODOS.md:31)
- Fact: The /push route is also covered by the project's own docs as bearer-gated. The README lists POST /push with `Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>`. (source: apps/bot/README.md:54)
- Fact: The prod webhook secret is a deploy secret (PROD_TELEGRAM_WEBHOOK_SECRET). A valid-secret smoke call would require that secret to be available to wherever the smoke test runs. (source: .inbox/TODOS.md:31)

## Open questions
- Open question: Recommendation, not sourced: make the /push check negative-only (missing bearer and wrong bearer both expect 401). A valid call sends a real message, clears chat context and claims the day, which can suppress the scheduled push. If the stakeholder wants proof that the scheduler's secret matches, add a valid call as an explicit opt-in (for example a flag). Decide whether that opt-in is wanted.
- Open question: It is unknown whether the smoke test will have access to the prod TELEGRAM_WEBHOOK_SECRET at all (for example in CI or locally). I found no smoke-test script or config to show where it runs.
