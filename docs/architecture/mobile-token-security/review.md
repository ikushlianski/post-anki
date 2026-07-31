---
type: debrief
branch: main
feature: mobile-token-security
updated: 2026-07-31
verdict: critical-issue-found
diagram-format: mermaid-png
---

# Architecture Review: mobile-token-security

## What was reviewed

The mobile Connect screen now tells a user whether they're pairing for the first time or
re-pairing after their session was revoked, instead of showing identical copy either way. The
same change also added a transport-security guard, `assertSecureUrl`, that is supposed to refuse
sending the Bearer token over plaintext HTTP to any host except a small fixed loopback allowlist —
and a double-tap fix on the Connect button. In scope: `apps/mobile/app/connect.tsx`,
`apps/mobile/src/api/client.ts`, `apps/mobile/src/api/token-storage.ts`, and the corresponding
update to `docs/architecture/mobile-study-review-app.md`. Reviewed against merge commit `1243c0d`
(parent `51c5b1d`, feature commit `015f68c`), already on `main`.

## Documentation found

`.planning/mobile-token-security/spec.md` (state: confirmed) has the full design and reasoning,
including six autonomous decisions with rationale. `.planning/LOG.md`'s entry for this item claims
the build was independently re-verified before merging, specifically calling out "all 7 of the
parser's key cases (including the IPv6 bracketed loopback...) run directly and confirmed correct."
`docs/architecture/mobile-study-review-app.md` was updated in place with a new paragraph
describing the guard. That paragraph states the guard "throws for any `http://` URL whose host
isn't a recognized loopback address" — see Verdict below for why that statement is not accurate
as shipped, which counts as documentation drift on a security guarantee, not just an omission.

## As-built architecture

![as-built](./as-built.png)

Every network call in `apps/mobile` funnels through exactly two `fetch()` call sites, both in
`client.ts` (`verifyToken` and `apiFetch`), and both call `assertSecureUrl(apiBaseUrl())` as their
first line, as the diagram shows. Confirmed by grepping the whole `apps/mobile` tree: no other
`fetch`, `XMLHttpRequest`, `axios`, or WebSocket call site exists, and no alternative networking
dependency is installed. So coverage of the guard itself is complete — every code path that sends
the token over the network does call it. The problem is what the guard does once it's called: it
parses the URL with a hand-rolled regex (`extractProtocolAndHost`) instead of the platform's `URL`
class, deliberately, because `LOG.md` documents a real cross-platform disagreement between WHATWG
`URL` and React Native's own `URL` polyfill on bracketed IPv6 loopback addresses (`"[::1]"`). That
reasoning is sound, and the polyfill divergence is real. The regex itself, however, disagrees with
real URL parsing in two ways that make it possible for a URL that actually points at a remote,
plaintext HTTP host to be misread as loopback and waved through — detailed in Verdict below. The
double-tap fix on `connect()` (a `useRef`-backed `busyRef`, not just `useState`) matches the same
pattern already used on the Today screen, the practice screen, and `startBatch`, so it's
consistent with precedent, not a one-off.

## Verdict

**Two ways to bypass `assertSecureUrl`, both verified empirically against Node's WHATWG `URL`
parser (the same parsing model browsers, `fetch`, and React Native's own polyfill implement for
this part of the syntax — userinfo/host splitting and scheme case-folding are basic, uncontested
URL syntax, not the obscure bracketed-IPv6 spot where the two engines are known to diverge).**

**1. Embedded credentials make a remote host look loopback.** The regex's host group is
`[^/:?#]+` — it stops at the first `:`, `/`, `?`, or `#`, but not at `@`. For a URL like
`http://localhost:x@evil-host/path`, the regex extracts `host = "localhost"` (everything before
the first `:`) and allows the request. The real network destination — per WHATWG `URL`, confirmed
in Node — is `evil-host`, with `localhost` and `x` parsed as username/password. The same trick
works with any of the four allowlisted hosts as the fake username (`127.0.0.1:x@evil-host`,
`[::1]:x@evil-host`, `10.0.2.2:x@evil-host`). The Bearer token is then sent to an arbitrary host
in cleartext, on every `apiFetch` call the app makes for the rest of the session — not just at
pairing.

**2. The scheme comparison is case-sensitive; the real one isn't.** The guard's check is
`protocol === "http:"`. A URL like `HTTP://evil-host/path` or `hTTp://evil-host/path` is
real plaintext HTTP — WHATWG `URL` normalizes the scheme to lowercase `"http:"` regardless of how
it's written — but the regex captures whatever case was actually in the string, so
`"HTTP:" !== "http:"` and the guard's block condition never fires. The URL passes as if it were
HTTPS.

**Exploitation precondition, stated plainly:** both of these require `EXPO_PUBLIC_API_BASE_URL`
(the only input to `apiBaseUrl()`) to be set to a crafted value — this is a build-time env var, not
something a network attacker can inject at runtime. So this is not remotely exploitable against a
correctly-configured build. It matters because it is exactly the class of misconfiguration the
guard exists to catch: a value like `http://localhost:8030@staging.internal` reads, to a human
reviewing config, as "obviously pointed at localhost" — the real destination only becomes visible
if you know to check where the `@` lands. It would pass code review and pass the guard, and the
app would silently leak the stored PAT in cleartext on every request. That combination — a check
that exists specifically to prevent silent plaintext leakage, defeated by an input shape that
looks safe to a human and passes the automated check that's supposed to catch what a human
misses — is a genuine security exposure, not a style nitpick. It also means the LOG.md claim that
"all 7 of the parser's key cases... run directly and confirmed correct" was true for the cases
tested, but the case list didn't include either of these two shapes, so the stated verification
was real but incomplete relative to what the guard is supposed to guarantee.

**This does not require abandoning the hand-rolled parser** — the IPv6-polyfill reasoning for
avoiding `new URL()` is sound and should stay. The fix is roughly three lines inside the existing
`extractProtocolAndHost`/`assertSecureUrl` pair, closing both gaps without touching the bracket
handling:
- Reject any authority substring (everything between `://` and the first `/`, `?`, or `#`) that
  contains an `@`, before extracting the host — checking `match[2]` alone is not sufficient, since
  in the bypass case `match[2]` is already just `"localhost"` with no `@` in it.
- Lowercase the extracted scheme before comparing to `"http:"`.
- Lowercase the extracted host before the `LOOPBACK_HOSTS` lookup (this also fixes an unrelated,
  non-security false-block: `http://LOCALHOST/path` is currently refused even though it's a
  legitimate loopback URL, because the allowlist only has the lowercase spelling).

**Everything else about this feature holds up.** The revoked-vs-first-launch distinction correctly
uses module-level state read once on mount rather than a route param, which is the right call
given the documented race between `apiFetch`'s imperative redirect and `_layout.tsx`'s effect-based
one — both paths land on the same module variable regardless of which redirect wins. The decision
not to add a proactive cold-start token probe is correct: gating on `verifyToken()`'s result would
evict valid tokens on any offline cold start, since that function's `catch { return false }`
can't distinguish "revoked" from "no network yet." Keeping `assertSecureUrl` out of `apiBaseUrl()`
itself and calling it explicitly before `verifyToken`'s try/catch, rather than inside it, is
correctly reasoned and correctly implemented — a guard error genuinely propagates to `connect.tsx`
now, verified by reading the code path directly, and `connect()`'s new try/catch shows a distinct
message for it. The double-tap fix matches the codebase's existing pattern exactly. `npx tsc
--noEmit` in `apps/mobile` is clean.

## Proposed alternative

![proposed-alternative](./proposed-alternative.png)

Same architecture, same hand-rolled parser, same two call sites — only `assertSecureUrl`'s internal
logic changes, closing the three gaps listed above. This is a targeted patch to the existing
function, not a redesign: it keeps the deliberate choice to avoid `new URL()`, keeps the guard
outside `verifyToken`'s try/catch, and keeps the loopback allowlist exactly as scoped. Cost to
switch is a few lines inside one function plus re-running the same kind of direct-execution
verification `LOG.md` already used, this time against a case list that includes credential-
embedded authorities and mixed-case schemes.

## Questions a reviewer would ask

1. What was the actual list of 7 cases `LOG.md` says were verified, and can that list be committed
   somewhere (a comment, a script) so the next person touching `assertSecureUrl` re-runs the same
   set instead of re-deriving it from scratch — and so the two shapes this review found get added
   to it permanently?
2. `docs/architecture/mobile-study-review-app.md` currently states the guard "throws for any
   `http://` URL whose host isn't a recognized loopback address" — should that wording be softened
   until the fix lands, since right now it's describing intent rather than actual behavior for
   these two URL shapes?
3. Is there any code path, now or realistically soon, where `apiBaseUrl()` could ever incorporate
   anything other than the build-time `EXPO_PUBLIC_API_BASE_URL` env var — a deep link, a QR-code
   pairing flow, a remembered "last server" setting? If that's ever added, the exploitation
   precondition stated in this review (developer-controlled build-time value) no longer holds and
   this becomes materially more exploitable.
4. Should `LOOPBACK_HOSTS` also accept the uppercase/mixed-case spelling of its own entries (e.g.
   `LOCALHOST`), or is failing closed on that acceptable — right now a case-preserving allowlist
   look-up means `http://LOCALHOST/path` is refused even though it's a genuine loopback address?
5. The spec's Decision 3 deliberately excludes real-LAN IPs (e.g. `192.168.x.x`) from the
   allowlist, forcing HTTPS or a tunnel for real-device-on-Wi-Fi development. Has that actually
   been tried end to end, or is it an untested friction point that will surface the first time
   someone tests on a physical device over Wi-Fi?
6. No Playwright coverage exists for `apps/mobile` and no simulator was available for this review
   — is there a plan (even a manual checklist) to exercise SCENARIO 3 (the plaintext-URL rejection
   path) on a real device or simulator before this ships to anyone but the single developer-user,
   given that the untested path is exactly the one with the bug this review found?
7. `verifyToken`'s `catch { return false }` still can't distinguish "server said no" from "network
   unreachable" from "DNS failure." Now that `assertSecureUrl` can throw distinctly, is there a
   case for giving `apiFetch`'s and `verifyToken`'s generic network failures the same kind of
   distinct messaging Decision 6 gave the transport-guard failure, rather than lumping them into
   the existing catch-all copy?
