# iOS to post-anki API endpoint contract

Scope: every HTTP call in `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/Sources/PostAnkiIOS/API/APIClient.swift`, matched to the server routes in `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src`. Read-only; nothing was executed against a live server.

Abbreviations: `SW` = `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/Sources/PostAnkiIOS/API/`, `API` = `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/`, `SHARED` = `/Users/ikushlianski/webdata/ilya-projects/post-anki/packages/shared/src/`.

## Endpoint table

Auth column: every route passes through `authorized()` (`API/api-server.ts:406-407`). The iOS client sends no `Authorization` header (`SW/APIClient.swift:30-32`), so it passes only when the server has `API_SHARED_SECRET` unset (`API/api-server.ts:316-318`). See Notes.

| # | Swift function (APIClient.swift) | iOS call | Server route (router-table.ts) | Server dispatch and handler | Request schema | Response vs Swift Models.swift | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | `listSubjects()` (:49-51) | `GET /subjects` | `API/router-table.ts:15` `listSubjects` | `API/api-server.ts:442-443` to `API/subject/subject.controller.ts:22-40` | none | 200 array of subject objects from `API/subject/subject.repo.ts:39-46`; Swift `Subject` (`SW/Models.swift:3-7`) needs `id`, `name`, `description?`, all present in `SHARED/subject.ts:4-13` | EXISTS |
| 2 | `listCurricula()` (:53-55) | `GET /curricula` | `API/router-table.ts:208` `listCurricula` | `API/api-server.ts:532-533` to `API/curriculum/curriculum.controller.ts:69-74` | none (`subjectId` query optional, not sent by iOS) | array from `API/curriculum/curriculum.repo.ts:119`; Swift `Curriculum` (`SW/Models.swift:9-15`) needs `id`, `subjectId`, `name`, `description?`, `status`, all in `SHARED/curriculum.ts:36-50` | EXISTS |
| 3 | `getCurriculumDetail(_:)` (:57-59) | `GET /curricula/{id}` | `API/router-table.ts:247` `getCurriculum` | `API/api-server.ts:536-537` to `API/curriculum/curriculum.controller.ts:635-647` (404 `not_found` when missing) | none | `{curriculum, modules}` built at `API/curriculum/curriculum.repo.ts:2283-2290`; schema `SHARED/curriculum.ts:126-129`; Swift `CurriculumDetail`, `Module`, `Topic` (`SW/Models.swift:17-33`) use `id`, `curriculumId`, `title`, `topics`, `moduleId`, all in `SHARED/module.ts:9-24` and `SHARED/topic.ts:29-40` | EXISTS |
| 4 | `nextQuestionVariants(topicId:limit:)` (:61-67) | `GET /knowledge-bits/question-variants/next?limit=N[&topicId=X]` | `API/router-table.ts:74-75` `listNextKnowledgeBitQuestionVariants` | `API/api-server.ts:472-473` to `API/knowledge-bit/list-next-knowledge-bit-question-variants.controller.ts:7-30` (reads `limit`, `tagId`, `topicId`, `knowledgeBitId`; default 5) | none | rows selected at `API/knowledge-bit/knowledge-bit-question-variant.repo.ts:106-120` include `variantId`, `kind`, `prompt`, `knowledgeBitId`, `bitBody`; Swift `NextQuestionVariant` (`SW/Models.swift:35-43`) decodes those five fields; extra `background` is ignored | EXISTS |
| 5 | `gradeAnswer(variantId:userAnswer:)` (:69-78) | `POST /knowledge-bits/question-variants/{id}/answers` body `{userAnswer}` | `API/router-table.ts:122-123` `gradeKnowledgeBitVariantAnswer` | `API/api-server.ts:470-471` to `API/knowledge-bit/grade-knowledge-bit-variant-answer.controller.ts:12-39`; input Zod `gradeVariantAnswerInput` at :7-9 (local to controller, not in `SHARED`) | `{userAnswer: string, trim, min 1}` | 200 result from `API/knowledge-bit/grade-knowledge-bit-variant-answer.orchestrator.ts:13-15` contains `ok: true`, `followUpQuestion`, `tagIds`, plus grader fields `score` (int 0-10), `verdict` (`"Ok" \| "NeedsReview" \| "NeedsDeepDive"`, `SHARED/practice.ts:21`), `feedback` (`API/mastra/knowledge-bit-answer-grader.agent.ts:62-66`); Swift `GradeQuestionVariantAnswerResult` (`SW/Models.swift:45-52`) matches; error bodies (403/404/409/502) surface as `APIError.badStatus` | EXISTS |
| 6 | `createKnowledgeSource(text:)` (:80-86) | `POST /knowledge-sources` body `{text}` | `API/router-table.ts:17` `createKnowledgeSource` | `API/api-server.ts:446-447` to `API/knowledge-source/knowledge-source.controller.ts:87-200` (single-text branch, 201 at :199) | `singleTextInput` at `API/knowledge-source/knowledge-source.controller.ts:22-26` (`text` max 50000, optional `subjectId`, `modelId`) | 201 with the inserted source (`API/knowledge-source/knowledge-source.repo.ts:15-30`, has `id`); Swift `CreateKnowledgeSourceResult` (`SW/Models.swift:66-68`) reads `id?` | EXISTS |
| 7 | `detectKnowledgeBits()` (:88-90) | `POST /knowledge-sources/detect-bits`, no body | `API/router-table.ts:19` `detectKnowledgeBits` | `API/api-server.ts:450-451` to `API/knowledge-bit/detect-knowledge-bits.controller.ts:20-32` (502 `scan_failed` on error) | none | body ignored by Swift (`EmptyResponse`, `SW/Models.swift:72-74`) | EXISTS |
| 8 | `listPlacementSuggestions()` (:92-94) | `GET /knowledge-bits/placement-suggestions` | `API/router-table.ts:69-70` `listPendingPlacementSuggestions` | `API/api-server.ts:466-467` to `API/knowledge-bit/detect-knowledge-bits.controller.ts:158-164` (limit 200) | none | rows `{id, body, placementSuggestion}` from `API/knowledge-bit/knowledge-bit-placement.repo.ts:111-134`; matches Swift `PendingPlacementSuggestion` (`SW/Models.swift:76-80`) and `SHARED/knowledge-bit.ts:4-8` | EXISTS |
| 9 | `resolvePlacementSuggestion(id:accepted:moduleId:title:)` (:96-117) | `PATCH /knowledge-bits/{id}/placement-suggestion`, body `{status:"accepted",moduleId,title}` or `{status:"rejected"}` | `API/router-table.ts:116-117` `resolvePlacementSuggestion` | `API/api-server.ts:468-469` to `API/knowledge-bit/detect-knowledge-bits.controller.ts:186-214` (400 invalid_input, 404 not_found or module_not_found, 409 already_resolved) | `SHARED/knowledge-bit.ts:11-18` discriminated union on `status`; Swift encodes the same two shapes (`SW/Models.swift:84-109`) | repo result `{outcome:"rejected"}` or `{outcome:"accepted", topicId}` (`API/knowledge-bit/knowledge-bit-placement.repo.ts:139-143`, function at :149); Swift `ResolvePlacementSuggestionResult` (`SW/Models.swift:111-114`) reads `outcome?`, `topicId?` | EXISTS |
| 10 | `chatWithKnowledgeBit(id:message:transcript:)` (:122-135) | `POST /knowledge-bits/{id}/chat` body `{message, transcript?}` | `API/router-table.ts:366-367` `askKnowledgeBitChat` | `API/api-server.ts:693-694` to `API/knowledge-bit/knowledge-bit-chat.controller.ts:11-30` (400 invalid_input, 404 not_found, 403 not_approved) and `API/knowledge-bit/knowledge-bit-chat.service.ts:29` | `SHARED/knowledge-bit-chat.ts:7-11`: `message` 1 to 20000 chars, `transcript` optional array of `SHARED/study-chat.ts:7-10` entries `{role: "user" \| "assistant", text}` | `{reply: string}` (`SHARED/knowledge-bit-chat.ts:16-18`); Swift `ChatWithKnowledgeBitResult` (`SW/Models.swift:126-128`) matches. Request transcript field differs: Swift `ChatTranscriptEntry` (`SW/Models.swift:116-119`) sends `content`, server requires `text` | EXISTS-DIFFERENT |

## Counts

- EXISTS: 9 (rows 1 to 9)
- EXISTS-DIFFERENT: 1 (row 10, chat transcript field name)
- MISSING: 0

## Notes

### Facts

- The app makes 10 calls, not the 11 the brief expects. The list in the brief has 10 items, and `SW/APIClient.swift` has 10 request functions (:49-135).
- The chat route is implemented, which contradicts the brief's premise. The route is registered (`API/router-table.ts:366-367`), dispatched (`API/api-server.ts:693-694`), has a controller and service (`API/knowledge-bit/knowledge-bit-chat.controller.ts:11-30`, `API/knowledge-bit/knowledge-bit-chat.service.ts:29-31`), and a router test exists (`API/router.test.ts:92-93`). The Swift comment calling it "Proposed contract, not yet confirmed/implemented" (`SW/APIClient.swift:119-121`) is out of date against the repo.
- Chat transcript mismatch: Swift sends `content` (`SW/Models.swift:116-119`). The server schema `chatMessageSchema` requires `text` (`SHARED/study-chat.ts:7-10`). A non-empty transcript fails the Zod parse and returns 400 `invalid_input` (`API/shared/http.ts` `readJsonBody` returns `ok:false`, and `API/knowledge-bit/knowledge-bit-chat.controller.ts:17-21` maps that to 400). An empty or missing transcript passes, because Swift omits the key when empty (`SW/APIClient.swift:132`).
- Auth: the iOS client sends no `Authorization` header (`SW/APIClient.swift:8-10`, `:30-32`). `authorized()` returns true only if `API_SHARED_SECRET` is unset (`API/api-server.ts:316-318`). Otherwise it needs an exact `Bearer <secret>` match (`:320-325`) or an active personal access token hash (`:327-340`). `API_SHARED_SECRET` is optional in `API/shared/env.ts:15`.
- Swift treats every non-2xx status as `APIError.badStatus` (`SW/APIClient.swift:41-44`), so the server's 409 `already_resolved` and 403 `not_approved` are not handled separately.
- Swift `resolvePlacementSuggestion` throws `APIError.badURL` before any request when `accepted` is set without `moduleId` or `title` (`SW/APIClient.swift:102-107`). This is a client-side error type, not a contract mismatch.

### Assumptions

- EXISTS for rows 1 to 9 assumes Swift's default JSON decoder ignores extra server fields, which it does by default for `Decodable` structs.
- The shared `SHARED/curriculum.ts` schemas describe the actual response; the repo functions were checked for the top-level keys only.

### To verify

- Whether the deployed server at `https://api.postanki.ilya.online` (`SW/APIClient.swift:14`) runs this repo revision, and whether `API_SHARED_SECRET` is set there. If it is set, every iOS call returns 401.
- Whether the chat route is deployed. No live request was made.
- Whether the deployed `knowledge-bits/:id/chat` accepts `content` through any alias. The repo schema does not.
- Whether `SHARED/curriculum.ts` `curriculumDetailSchema` (:126-129) is the exact response of `getCurriculumDetail` (:2283-2290). Only the top-level keys were compared.

### OpenAPI or Swagger

- No OpenAPI spec, Swagger file, or zod-to-openapi generator in post-anki. Root `package.json` and `apps/api/package.json` contain no openapi, swagger, or zod-to-openapi entries. The only matches are transitive lockfile entries, `package-lock.json:6889` (`hono-openapi`) and `package-lock.json:10187` (`@standard-community/standard-openapi`).

END-OF-REPORT
