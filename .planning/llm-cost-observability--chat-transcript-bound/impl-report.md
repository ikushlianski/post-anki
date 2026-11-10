# Implementation report: chat transcript bound

## Files changed
- packages/shared/src/study-chat.ts: added MAX_CHAT_TRANSCRIPT_MESSAGES (12), MAX_CHAT_TRANSCRIPT_REQUEST_MESSAGES (200), chatTranscriptSchema, takeRecentChatMessages(); study input uses the bounded schema.
- packages/shared/src/{qa-chat,global-card-chat,knowledge-bit-chat}.ts: transcripts (including the draft input) use chatTranscriptSchema; MAX_DRAFT_TRANSCRIPT_MESSAGES now equals MAX_CHAT_TRANSCRIPT_MESSAGES (still 12, still exported).
- apps/api/src/{study-chat/study-chat,qa-chat/qa-chat,knowledge-bit/knowledge-bit-chat,global-card-chat/global-card-chat}.service.ts: transcript passed through takeRecentChatMessages before formatting. Existing uncommitted edits left intact.
- Tests: packages/shared/src/chat-transcript-limit.test.ts (new), apps/api/src/study-chat/study-chat.service.test.ts (new), and appended cases in qa-chat, knowledge-bit-chat and global-card-chat service tests.

## Limits
- Trim: 12 messages, the same as the existing draft limit; one shared constant.
- Hard max: 200 messages on every transcript array including the draft input (well above 12). The web client keeps the full history in component state; 200 turns is far beyond a real session. Over-max requests fail through the existing Zod validation path.
- curriculum.ts has no transcript; nothing changed there.

## Tests
- `npx vitest run src` in packages/shared: 11 files, 73 passed, 0 failed.
- `npx vitest run src/qa-chat src/study-chat src/global-card-chat src/knowledge-bit/knowledge-bit-chat` in apps/api: 7 files, 65 passed, 0 failed.

## tsc
`tsc --noEmit -p` for apps/api, packages/shared, apps/web: zero errors.

## Defaults and notes
- Prompts are flattened text with role labels, so a trimmed window starting on an assistant reply is left as is (no provider user-first requirement); not adjusted.
- The current message is a separate field and is never trimmed.
- Nothing staged, committed or reverted. Web client not changed.

## Undone
Nothing.

## Fix round 1
- Web clients now trim at the request-building point; UI state keeps the full history. Fixed once in apps/web/src/curriculum/api-client.ts: askStudyChat, askGlobalCardChat and askKnowledgeBitChat pass the transcript through takeRecentChatMessages (covers the three panels). The draft path already trims in use-card-proposal-requests.ts. No QA-chat client exists in api-client.ts, so nothing to change there.
- Tests: new "chat transcript trimming" cases in apps/web/src/curriculum/api-client.test.ts (card, global card, study chat send only 12 newest turns). `npx vitest run` on api-client.test.ts, global-card-chat and knowledge-bit-chat-panel.test.tsx in apps/web: 3 files, 44 passed.
- `npx tsc --noEmit -p apps/web`: zero errors.
- Side effect: a request with no transcript now sends `[]` instead of omitting the field; the API treats both the same.

END-OF-REPORT
