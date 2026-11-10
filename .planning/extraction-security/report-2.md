# DNS rebinding gap in link fetching: closed

Task: make the link fetch connect to exactly the address it validated, on every redirect hop, and declare `undici` as a direct dependency. Nothing committed, `apps/api/.env` untouched, the local Docker DB on 5562 untouched, and the files owned by the model-comparison agent untouched.

## What changed

- `apps/api/src/shared/pinned-dispatcher.ts` (new): `createPinnedLookup` answers a connection's lookup with a fixed list of addresses (single answer or all of them, `ENOTFOUND` when the list is empty). `createPinnedDispatcher` builds an `undici` `Agent` whose `connect.lookup` is that function.
- `apps/api/src/shared/guarded-fetch.ts`: each hop now resolves the hostname once (`resolvePinnedAddresses`), refuses it unless every returned address is public (IPv4, IPv6 and IPv4-mapped IPv6 through the existing `isPublicIpAddress`), and passes the validated answer to a per-hop pinned agent. IP literals are handled by the existing `isSafeSourceUrl` check and connect directly. Origins listed for the end-to-end stage skip only the public-address check, not the pinning, and the list is still ignored in production. All per-hop agents are closed in `finally`. Timeouts, size cap, redirect limit, content-type rule and every error code and outcome shape are unchanged. The agent is attached with `Reflect.set` because the global `fetch` types come from a different `undici-types` copy than the package.
- Every other link-fetching caller (`source-fetch.ts`, `refetch-link.ts`, `outbound-fetch.ts`, `github-chapters.ts`, `learning-list-source.ts`, `slice-generation.orchestrator.ts`) already goes through `guardedFetchText`, so all are covered.
- Docs: new section "Fetching a link" in `docs/architecture/knowledge-bit/knowledge-bit-ingestion-pipeline.md` (no earlier doc described link-fetch safety).

## Dependency diff (exact)

- `apps/api/package.json`: `+    "undici": "^7.26.0"` in dependencies.
- `package-lock.json`: the `apps/api` workspace entry gains `"undici": "^7.26.0"`, and `node_modules/undici` loses `"dev": true` (it is now a production dependency). Version stays 7.26.0 (the one already installed). `git diff --stat`: 2 files, 2 insertions, 1 deletion. A first attempt with `undici@^7.26.0` resolved to 7.30.0 and was reverted; the installed 7.26.0 was kept as asked.

## Tests (all in apps/api/src/shared, no existing test changed)

- `pinned-dispatcher.test.ts` (3): single answer regardless of hostname, all answers when asked, `ENOTFOUND` when nothing is pinned.
- `guarded-fetch.pinning.test.ts` (15): a hostname resolved once even when a later lookup would answer privately; each redirect hop gets its own dispatcher and its own lookup; a redirect hop that resolves privately is blocked after the first fetch; six private IPv6 literals (`::1`, `::ffff:127.0.0.1`, `::ffff:7f00:1`, `::ffff:a00:1`, `fd00::1`, `fe80::1`) refused without any fetch; four hostnames resolving to private IPv6 or IPv4-mapped addresses refused; a public IPv6 answer accepted.
- `guarded-fetch.pinned-connection.test.ts` (2, real sockets, real global `fetch`): a loopback server is reached through a hostname whose first lookup says 127.0.0.1 and whose later lookups say 203.0.113.9, with exactly one lookup and the original `Host` header; in production mode the same listed origin is blocked and the server sees no request.
- Mutation check: with the dispatcher not attached, 4 of these tests fail (one of them is the real-socket test); restored, all pass.

## Verification (real output)

- `npx tsc --noEmit` in `packages/core`: exit 0.
- `npx tsc --noEmit` in `apps/api`: no errors in any file of this task; the only errors present are in `apps/api/src/model-comparison/*` and its repo, from the other agent's unfinished work (new usage fields).
- `npx vitest run` in `apps/api`: Test Files 163 passed (163), Tests 1529 passed (1529).
- `npx vitest run src/shared`: Tests 70 passed (70).

## Left open

- The `apps/api` type errors from the model-comparison work in progress need that agent to finish.
- Hosts that resolve to several public addresses are pinned to the whole list; the connection picks among them (happy eyeballs), which is intended.
- No real-network test against a public host was run (the environment sandbox rules out outbound checks); the pinned path is covered with real loopback sockets.

END-OF-REPORT
