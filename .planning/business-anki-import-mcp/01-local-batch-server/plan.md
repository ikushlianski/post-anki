# Plan: local-batch-server

## Goal
A stdio MCP server (`apps/anki-batch-mcp`) that parses an Anki export, backs it up once, hands out batches by id and removes a batch from the file only on `confirm_batch`.

## Approach
New workspace `apps/anki-batch-mcp`, no network/db/AI, per `brief.md`. Touches only: that folder, root `package.json` workspaces (+ `package-lock.json` via `npm install`), `.mcp.json`. Real export checked (1,685 records, LF, 2 fields each, 6 labelled decks = 854/226/294/188/89/29, 1,571 cloze notes, 5 image-occlusion notes with no label, 0 duplicate records). Files under `src/`, kebab-case, each under 300 lines, imports with `.js` suffix like apps/api:
- `anki-record-reader.ts`: header lines (leading `#`), RFC-4180 split into records; a field opens a quote only at field start, `""` is a literal quote, quoted fields span lines, tab splits outside quotes, `\n` ends a record. Returns each record's exact source slice plus its 2 fields.
- `anki-html-text.ts`: `htmlToText(html)`, `decodeEntities`.
- `anki-export-parser.ts`: `parseAnkiExport(text) -> { headerLines, notes: ParsedNote[] }`, `ParsedNote = { hash, deck, front, back, rawText, isCloze, source }`.
- `batch-file-store.ts`: `createBatchFileStore(path)`: `read()`, `ensureBackup()`, `backupExists()`, `removeByHashes(set)`.
- `batch-session.ts`: `createBatchSession()`: `open(hashes) -> batchId`, `confirm(batchId) -> hashes | error`, `openHashes()`, `pendingCount()`.
- `anki-batch-tools.ts`: zod shapes and the three handlers; `anki-batch.server-factory.ts`: `createAnkiBatchServer(filePath)` (McpServer `anki-batch`, `registerTool` like `apps/api/src/mcp/list-decks.tool.ts`/`register-browse-tools.ts`: inputSchema/outputSchema `.shape`, text JSON content plus `structuredContent`).
- `anki-batch-mcp.server.ts`: entry only: `process.argv[2]` resolved against `process.cwd()`, exit 1 with a stderr message if missing or unreadable, connect `StdioServerTransport`. Never write to stdout except through the SDK (no `console.log`).

## Steps
1. `apps/anki-batch-mcp/package.json` (`@post-anki/anki-batch-mcp`, private, `type: module`, scripts `typecheck: tsc --noEmit`, `test: vitest run`, `start: tsx src/anki-batch-mcp.server.ts`; deps `@modelcontextprotocol/sdk ^1.31.0`, `zod ^3.23.0`; dev `@types/node ^22.10.0`, `tsx ^4.19.0`, `typescript ^5.7.0`, `vitest ^2.1.0`), `tsconfig.json` (copy `apps/api/tsconfig.json`, include `src/**/*.ts`), `vitest.config.ts` (include `src/**/*.test.ts`). Add `"apps/anki-batch-mcp"` after `apps/api` in root `package.json` workspaces, run `npm install` at the root.
2. `anki-html-text.ts` in this order: drop the `subdeck-label` div; replace each active cloze `<span class="cloze" ... data-cloze="X" ...>...</span>` (lazy to first `</span>`, any inner text, `[...]` or a hint) with `decodeEntities(X)` once, the result stays HTML (it can hold `<br>`); remove `script|style|canvas|button` blocks and `<img>`; `<br>`, `<li>` open -> `\n- `, closes of `div|p|li|h1-6|ul|ol` -> `\n`; strip remaining tags (this unwraps `cloze-inactive` spans, nested ones included); decode entities ONCE after stripping (hex `&#x20;`, decimal, `&nbsp;`->space, `&lt; &gt; &amp; &quot; &apos;`, single regex pass so `&amp;lt;` becomes `&lt;`); per line collapse spaces/tabs, trim, collapse 3+ newlines to 2, trim.
3. `anki-record-reader.ts` and `anki-export-parser.ts` with these rules. `deck`: `/class="subdeck-label"[^>]*>\s*(?:[^<:]+::)?([^<]+?)\s*</` on field 1; when absent, fall back to `/display:\s*none"?>\s*<div>([^<]+)<\/div>/` (the `Маркетинг воронка` notes), else `null`. Image occlusion (`id="image-occlusion-container"` in either field): front, back, rawText all `""`, isCloze false. Otherwise `front = htmlToText(field1)`, `back = htmlToText(field2 without label)`; `isCloze` = field 1 has `data-cloze`. For cloze notes compare whitespace-collapsed texts: back equals front -> `""`; back starts with front -> back becomes the collapsed remainder (the Anki "extra", 109 real cases); else keep. `rawText = front`, plus `"\n\n" + back` when back non-empty. `hash = sha256(field1 + "\t" + field2)` hex, first 16 chars, over the unquoted field values.
4. `batch-file-store.ts`: `read()` parses the file fresh every call (hand edits between batches are safe). `ensureBackup()` = `copyFile(file, file + ".bak", COPYFILE_EXCL)`, swallow `EEXIST` only, returns whether it created one. `removeByHashes` calls `ensureBackup`, re-reads, drops every note whose hash is in the set (identical duplicates share a hash and all go), writes `headerLines` + remaining `source` slices (each ending `\n`) to `<file>.tmp` then `rename`; remove `.tmp` on failure; hashes not in the file are ignored. Returns `{ removed, remaining }`.
5. `batch-session.ts`: Map `batchId (randomUUID) -> { hashes, confirmed }`; unknown or already-confirmed id returns a distinct plain error. Lost on restart by design: unconfirmed notes simply come back.
6. `anki-batch-tools.ts` + factory. `get_next_batch` input `{ size: z.number().int().min(1).max(50).default(10) }`, output `{ batchId: z.string(), remaining: z.number(), notes: z.array({ hash, deck: z.string().nullable(), front, back, rawText, isCloze: z.boolean() }) }`: `ensureBackup()`, take the first `size` notes (first occurrence per hash) not in `openHashes()`, `open()` them; no notes left -> `batchId: ""`, `notes: []`, no batch opened. `confirm_batch` input `{ batchId: z.string().min(1) }`, output `{ removed, remaining }`; unknown or confirmed id -> `isError: true` with plain text and the file untouched. `status` input `{}`, output `{ file, backupExists, remaining, pendingBatches }` (no backup created). `remaining` everywhere = records still in the file, open batches included. Annotations: `get_next_batch` and `confirm_batch` `readOnlyHint: false`, `status` `readOnlyHint: true`.
7. Entry file as in Approach. Add to `.mcp.json` next to the existing `mastra` and `notion` entries (left unchanged): `"anki-batch": { "type": "stdio", "command": "npx", "args": ["tsx", "apps/anki-batch-mcp/src/anki-batch-mcp.server.ts", "subjects/Business.txt"] }`, no `env`, no headers.
8. Tests below, then the verification commands.

## Tests (co-located, vitest, `describe`/`it should`, temp dirs under `os.tmpdir()`, never `subjects/Business.txt`)
Fixture `src/test-fixtures/small-export.txt` (synthetic, 7 records, 2 header lines): plain question with empty answer; question with answer; multi-line quoted field with `""`; cloze whose back repeats the sentence; cloze whose back adds an extra line; `&#x20;`/`&nbsp;`/`&lt;` text; image-occlusion record without label (deck from hidden div).
- `anki-html-text.test.ts`: hex/`&nbsp;`/`&lt;` decoding order; `<br>` and block ends become newlines; `<script>`/`<img>` dropped; cloze restore with `[...]` and with a hint; nested `cloze-inactive`; a malformed hint containing `</div>` still restores.
- `anki-export-parser.test.ts`: headers skipped; empty answer; multi-line `""` field; labelled deck with and without `Business::`; hidden-div deck; occlusion note empty with deck set; back dropped on equal, remainder kept on extra; stable 16-hex hash, different for different content; `source` slices re-join to the original records byte for byte.
- `batch-file-store.test.ts`: `.bak` created once, second call after the file changed leaves it untouched; remove deletes exactly the given hashes, keeps headers and the other records byte-identical; unknown hash ignored; no `.tmp` left behind.
- `batch-session.test.ts`: unknown id refused; confirmed id refused the second time; open hashes excluded from the next batch.
- `anki-batch-mcp.server.test.ts`: SDK `Client` + `InMemoryTransport.createLinkedPair()` on a temp copy of the fixture: tools list is exactly the three; `status` before any call (`backupExists: false`, nothing created); `get_next_batch` size 3 returns 3 notes with deck/front/back/rawText and creates `.bak`; a second call returns the next 3 (no overlap); `confirm_batch` removes exactly those, `remaining` drops by 3; unknown and repeated id give `isError`; size 0 and 51 rejected; final file keeps both header lines.
- `anki-batch-mcp.stdio.test.ts`: `StdioClientTransport` spawning `npx tsx src/anki-batch-mcp.server.ts <temp copy>`, lists the 3 tools (30 s timeout).
- `mcp-config.test.ts`: root `.mcp.json` has `anki-batch` with the exact command/args, still has `mastra` and `notion`, and no `env`/`headers` on it.

## Done when
- First `get_next_batch` creates `<file>.bak`; a later run never overwrites it (store + server tests).
- `get_next_batch` returns the requested count with deck, front, back, rawText, isCloze, cloze notes restored to full sentences.
- `confirm_batch` removes exactly the returned notes and refuses unknown or repeated ids; file stays valid with headers.
- `.mcp.json` entry committed, no secret; `/mcp` in Claude Code lists `anki-batch` with 3 tools.
- In `apps/anki-batch-mcp`: `npx vitest run` and `npx tsc --noEmit` clean; root `npx depcruise --config .dependency-cruiser.cjs --output-type err apps packages` still clean.
- Read-only dry parse of the real file (no write): `npx tsx -e` calling `parseAnkiExport` on `subjects/Business.txt` prints 1,685 notes, 1,571 `isCloze`, deck counts as above plus 5 `Маркетинг воронка`; `status` via `/mcp` reports 1,685 remaining and `backupExists: false`.

## Defaults chosen
- Hash over unquoted field values, not raw text: stays stable if quoting changes.
- Back remainder kept when it extends the restored front (draft only dropped on equality): avoids repeating the sentence in 109 notes.
- Image-occlusion notes (5, no text) get empty `rawText` and deck from the hidden div; contract unchanged, callers skip empty `rawText`.
- Images dropped from text, link targets dropped: the pipeline takes prose only.
- Identical duplicate records share one hash and are handed out once: none exist today.
- Batch of zero notes returns `batchId: ""` instead of an error: end of file is not a failure.
- Reader treats only `\n` as a record end: the export has no CRLF.
- No `.gitignore`, CI matrix or Dockerfile change: `subjects/` is untracked today and this tool is local only.
- Repo has no `CLAUDE.md`; only the global one and `apps/api` conventions were applied.
