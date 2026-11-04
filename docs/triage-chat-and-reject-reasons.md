# Triage, Chat queue and reject reasons

How suggested cards are sorted, discussed with the tutor and rejected, and where the numbers show up.

## Sorting cards

On iPhone each suggested card is swiped:

- Right: accept the card.
- Left: reject it, then pick a reason (or skip).
- Up: send it to the Chat queue.
- Down: set it aside in the Inbox.

Every swipe can be undone, including a move to Chat. On the web, the focus view uses the right and left arrow keys (or A, and R or X) to accept and reject, and Z to undo. C sends the card to the Chat queue ("Chat about this") and I sets it aside in the Inbox. The Chat queue page lists cards sent to Chat; on the web it opens from the "Chat" entry in the sidebar, which shows the waiting count.

## Chat queue

The Chat queue holds cards you want to talk through with the tutor before deciding. Open a card to see a conversation thread, and accept or reject it from there.

- A thread allows up to 8 of your messages, each up to 1000 characters. After that the card must be accepted or rejected.
- "Delete last exchange" under the thread removes your latest message and the tutor reply to it, and gives that question back. It is blocked while the tutor is answering. The hourly reply limit and daily AI budget still count the deleted reply.
- Snooze a card for 1, 3, 7 or 14 days. It stays in the list marked "Snoozed until" and does not count in the badge or reminders. Unsnooze brings it back.
- The web list can be searched and filtered by subject, and moved with j and k (Enter opens a card). x selects a card, i sends it to Inbox, s snoozes it for 1 day, ? lists the keys.
- The header on web and iPhone shows how many cards are waiting and snoozed, and how long the oldest waiting card has waited. A snooze that has run out counts as waiting.
- "Waiting over 14 days" (web: select button, iPhone: chip) picks the stale cards; on iPhone "Move all to Inbox" moves them after a confirmation.
- Message search looks through conversation text (web and iPhone) and opens the matching card's thread. It is served by `GET /knowledge-bits/chat-queue/search`.
- "Retry" (web) / "Retry answer" (iPhone) under the last tutor reply asks for that reply again.
- The thread header shows the source title, linked to the source when the URL is a safe web link.
- `/knowledge/chat?card=<id>` opens that card's thread directly. Telegram `/chat` lines link this way.
- Threads of accepted or rejected cards are deleted 30 days after the decision. The cleanup runs at most hourly, triggered by the Chat count request (`CHAT_THREAD_RETENTION_DAYS`).
- "Make a card" under a tutor reply turns that reply into a new suggested card in the same subject.
- Export a subject's Chat conversations as a Markdown file: "Export Markdown" on the web (pick a subject first), "Share as Markdown" on iPhone.

### Reminders

- The Telegram daily digest adds one line when a Chat card has waited more than 3 days, with the count and the age of the oldest.
- The bot sends that reminder at most once per day: the `reminder_state` table in the bot database stores the last day sent.
- `/chat` in the Telegram bot lists the oldest waiting cards, 10 per page, under a header with the total waiting and, when any, how many are snoozed. `/chat 2` shows the next page.
- `/rejected` lists recent rejected cards with a count per reason. `/rejected <reason>` filters by a reason code; any other text searches the cards. When more cards exist than the five shown, a last line says how many more and links to the Rejected page.
- `/help` lists every bot command. A mistyped slash command gets "Unknown command, see /help". The bot also registers its commands with Telegram on startup so they appear in the command menu.
- If the API cannot be reached, `/chat` and `/rejected` reply with a short "couldn't reach" line.
- `/digest` replies with last week's accepted, rejected and reviewed counts compared with the week before, plus the Chat backlog. When top reject reasons are listed and the web address is configured, it also links to the Rejected page.

## Reject reasons

When you reject a card you can choose one reason and add a short note (up to 500 characters). These reasons are offered:

- Question doesn't make sense, bent to fit the answer: the question only works because it was shaped around the answer.
- Just restates the text, no practical value: the card repeats the source without teaching anything useful.
- Only checks the text's wording, not understanding: answering needs the exact phrasing, not the idea.
- Wrong or unsupported answer: the answer is incorrect or the source does not back it.
- Wrong language: the card is in a language other than the one you study.
- Duplicate or overlaps another: the card covers something another card already covers.
- Other: anything else.

Older reasons (too vague or no context, meta wording, not a fact or trivial, bad format) are no longer offered but still appear with their names in past decisions and statistics. A rejection without a reason shows as "No reason given".

### Rejected page

- Lists rejected cards, filterable by reason, subject and text search (web and iPhone). Each reason chip shows its card count.
- Each row shows the source title, linked to the source when the URL is a safe web link.
- Restore puts one card back; checkboxes plus "Restore selected (N)" restore several at once, and a select-all box covers the list.

Telegram `/inbox` replies with the number of cards waiting in the Inbox and a link to the web Inbox (`/knowledge/inbox`); it says "Inbox is empty." when none wait. Owner-only, like `/chat` and `/rejected`.

## Nothing extracted

When a note is processed and nothing in it is worth turning into a card, the note shows "Nothing here looked worth turning into a card." in a neutral style, not as an error. It does not count toward the needs-attention badge.

- Extract anyway runs the extraction again on the same note and asks for at least one card. The server only allows it while the note is still marked nothing-extracted.
- Dismiss removes the notice.

## Per-subject card style

Each subject has its own settings, not inherited from a parent subject:

- Card detail: Concise, Standard or Deep. Standard is the default and changes nothing; the others make new cards shorter or more thorough.
- Show hints in review: when off, the hint next to a blank is hidden in web review. On by default.

On the web they sit in the subject's study options; on iPhone, in the subject's Study plan screen.

## Statistics

The statistics page has these sections:

- Reject reasons: how many rejected cards per reason, with a share bar.
- Weekly trend: the reject rate for each of the last 12 weeks, with counts for the top three reasons.
- Per subject: subjects ranked by reject rate, shown once a subject has at least 5 decisions.
- Nothing-extracted rate: the share of processed notes per week that produced no cards.

The weekly digest card on the web home page and the iPhone Review tab shows accepted, rejected and reviewed cards for the last 7 days against the 7 before, plus the Chat backlog. When top reject reasons are listed and the web address is configured, it also links to the Rejected page. It also lists the top reject reasons with the change against the week before (for example +2), each linking to the Rejected page for that reason, and a "Chat: N cards, M turns this week" line when there was Chat activity.

In Telegram, `/rejected` shows the note typed at rejection after the reason (flattened, cut to 60 characters). `/chat` and `/inbox` show "200+ cards" and "Showing the first 200 of N" when the list is cut at 200 cards; nothing changes otherwise.
