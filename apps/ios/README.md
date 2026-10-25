# post-anki-ios

A simple native iOS companion app for post-anki, written in Swift/SwiftUI. Authenticates with a
bearer access token kept in the Keychain and talks directly to the post-anki API.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the package, shared screens, Mac registry and how to add a Mac feature.

## iPhone tabs

- Home: due-today row, summary, the latest topic or course to continue, daily push, practice, study tools and study modes. A "Progress and practice" section opens Progress and Answer practice as sheets.
- Review: one-card-at-a-time review with grade buttons, undo and offline queuing. A strip above the card shows the remaining New, Learning and Due counts for today and drops as you grade (undo raises it again). Grades made offline are queued and sent later.
- Inbox: a picker between Pending items and Placement suggestions. The tab badge shows the number of pending items. Pending items show a summary ("N cards are waiting for your decision", with writing progress while cards are still being made) and a Start triage button that opens focus triage.
- Add: add knowledge by typing, dictating or pasting text, or by pasting a single link. Pick a subject (or "No subject"); inside a course the course's subject is used and the picker is hidden. A refused input shows a plain sentence (page could not be opened, no readable text, subject missing, already added, text over 50,000 characters). "Already added" offers Add anyway, which resends the same input with force. After extraction finishes, "Review new items" opens focus triage when cards are pending.
- Courses: all courses, decks and sub-decks.

## Focus triage

On iPhone, Start triage opens a full-screen, one-card-at-a-time view: subject, all variations, example, fact, a "Where this came from" disclosure, an optional note, and sticky Reject and Approve buttons. Undo steps back through decisions made in the session. Finish takes optional feedback and shows counts and style notes. Cards that are still being written appear as they become ready. The Mac keeps its keep/drop triage with the layout picker and reject banner. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Sign-in

The apps authenticate with a device access token. Email and password sign-in, which returns a session token kept in the Keychain, is planned and not built. The API already accepts that token; see [docs/architecture/web-auth/web-auth.md](../../docs/architecture/web-auth/web-auth.md).

## Status

The iPhone app has five tabs (Home, Review, Inbox, Add, Courses). The Mac app has the full sidebar below.

## Build

Requires the full Xcode.app (not just the Command Line Tools) — install it from the App Store first.

The `.xcodeproj` is generated from `project.yml` via [XcodeGen](https://github.com/yonaskolb/XcodeGen)
— it's gitignored, so regenerate it after pulling or after editing `project.yml`:

```sh
brew install xcodegen   # once
xcodegen generate
open PostAnkiIOS.xcodeproj
```

Or build from the command line, unsigned, against the simulator:

```sh
xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiIOS \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Code signing reads `Local.xcconfig` (gitignored, copy `Local.xcconfig.example`) — set
`DEVELOPMENT_TEAM` there to your Apple Developer Team ID before building for a device. Set it
there, not in Xcode's Signing & Capabilities tab — anything set there is overwritten the next
time `xcodegen generate` runs.

## Test the iPhone against the Mac's local API

The phone and the Mac must be on the same Wi-Fi.

1. Start the local stack from the repo root with `/dev-local` (or `npm run dev`): dev Postgres `post-anki-dev-db` on 5562, API on 5560. The API listens on all interfaces. Check `curl http://<lan-ip>:5560/_healthz` returns 200 (`ipconfig getifaddr en0` prints the address).
2. Install the Dev app over Wi-Fi: `VARIANT=dev apps/ios/scripts/install-iphone.sh <UDID>`. It builds the `PostAnkiIOSDev` scheme (Debug, bundle id `com.ikushlianski.postankiios.dev`, orange tint) and bakes the Mac's current `en0` address into the build as `POSTANKI_DEV_API_URL` (`http://<lan-ip>:5560`, port from `LOCAL_API_PORT`). `Local.xcconfig` needs `DEVELOPMENT_TEAM`.
3. On first launch iOS asks for local network access; tap Allow.
4. A server address saved on the phone wins over the build default. If one is saved, tap Profile > "Use default address".
5. Sign in under Profile > Sign in with the owner email. The dev database has its own owner password: put it in `ILYA_USER_PASSWORD` in `apps/api/.env.local` and run `npm run db:set-owner-password -w @post-anki/api` (creates the owner user if missing).

Skipping sign-in: the Dev app saves `POSTANKI_LOCAL_DEV_API_TOKEN` from `Local.xcconfig` as its token on launch when none is saved. Debug builds only; the Release config and the prod target never carry it.
Mint one for the local dev DB from `apps/api`: `OWNER_EMAIL=<owner email> npm run db:create-web-key -- ios-dev-local` (refuses non-local hosts, creates the owner user without a password), then put the printed `pat_...` into `Local.xcconfig` and reinstall.
If the phone already holds a stale token, tap Profile > Sign out and relaunch the app to pick up the seeded one.

The baked address is the one at install time. When the Mac's LAN address changes (new network, DHCP lease), rerun the install command or enter the new address on the phone.

To go back to production, install the production app with `apps/ios/scripts/install-iphone.sh <UDID>` (Release, no `VARIANT`), which ignores `POSTANKI_DEV_API_URL`. The Dev and production apps are separate installs and can sit side by side.

## Previews

Xcode previews for the Review, Triage (swipe card and inbox list), Add and Knowledge screens use sample data and need no API. They live in `Sources/PostAnkiIOS/previews/` (Debug only); open a file there and show the canvas (Option-Cmd-Return) to restyle a screen. The sample data is in `preview-sample-data.swift`.

## Develop the Mac app

Scheme `PostAnkiMac` (macOS 14+, bundle id `com.ikushlianski.postankimac`) shares `Sources/Shared` with the iOS app. It is sandboxed with outgoing network access only.

### Prerequisites

- Full Xcode.app (not just the Command Line Tools).
- XcodeGen: `brew install xcodegen`.

### Set up

1. Copy `Local.xcconfig.example` to `Local.xcconfig` in the repo root (gitignored).
2. Set `DEVELOPMENT_TEAM` to your Apple Developer Team ID for a stable signature.
3. Set `POSTANKI_DEV_API_URL` to the post-anki server address Debug builds use, for example `http://localhost:5560` (the local post-anki API default). Release builds ignore it. Leave it empty to use the built-in default address. A server address saved in Settings takes precedence.
4. Run `xcodegen generate`. Regenerate after pulling or after editing `project.yml`.
5. Open `PostAnkiIOS.xcodeproj`, pick the `PostAnkiMac` scheme and press Run. Cmd-U runs the smoke tests and the sidebar registry tests.

### Run script

`scripts/run-mac.sh` generates the project, builds the Debug app into `build/` and opens it.

```sh
scripts/run-mac.sh          # generate, build, open
scripts/run-mac.sh --test   # PostAnkiMac smoke tests, then swift test for Packages/PostAnkiAPI
```

### Run post-anki locally and point the app at it

Source: the sibling repo `../post-anki` (`package.json`, `docker-compose.yml`, `scripts/dev.sh`, `apps/api`).

1. In `../post-anki` run `npm run dev`. It runs `scripts/dev.sh`: starts the dev Postgres container (`post-anki-dev-db`, host port 5562) and Electric via `docker compose up -d`, applies migrations, then starts the API and the web app. Ctrl+C stops it and brings the containers down (the data volume is kept). Docker must be running.
2. The API listens on port 5560 unless `PORT` is set in `apps/api/.env.local` (default in `apps/api/src/shared/env.ts`). The web app uses 5540 by default. So the Mac app address is `http://localhost:5560`.
3. Point the app at it: in `Local.xcconfig` set `POSTANKI_DEV_API_URL = http:/$()/localhost:5560` (the `$()` keeps xcconfig from reading `//` as a comment), then run `xcodegen generate` and rebuild. Or enter `http://localhost:5560` in the Settings address; a saved address wins. Plain `http://` is accepted for `localhost` and `127.0.0.1`, and in Debug builds also for private LAN addresses and `.local` hosts.
4. Create an access token: `apps/api/scripts/create-api-token.ts` takes a label argument, needs `DATABASE_URL` and prints a `pat_...` token once. For the dev database the URL is `postgres://postanki:postanki@localhost:5562/postanki_dev` (from the comment in `.env.example` and `docker-compose.yml`). Unverified: the exact command line; the script's own usage text says `tsx scripts/create-api-token.ts <label>`, run from `apps/api` with `DATABASE_URL` set, and there is no npm script for it. Paste the printed token into Settings (Cmd-comma).
5. Unverified: that an API started by `npm run dev` also needs the other `.env` values (for example `OPENROUTER_API_KEY`) to boot; `apps/api/.env` and `.env.local` are not documented here.

### Sign in

Open Settings (Cmd-comma) and enter the access token. The token is stored in the Mac login keychain (service `com.ikushlianski.postankiios.api`). The app shows a launch banner when it is signed out or cannot reach the server.

Builds signed with "Sign to Run Locally" change signature each build, so macOS may prompt for keychain access or refuse an earlier item; set `DEVELOPMENT_TEAM` in `Local.xcconfig` for a stable signature.

### Sidebar

- Study: Home, Review, Quick practice, Study sessions, Gaps coming back, Daily push, Language practice, Progress
- Library: Courses, Knowledge, Knowledge Inbox (pending items and placement suggestions), Sources, Content inbox, Tags, Search, Notes, Add knowledge, Notion import
- Learn: Learning list, Learning paths, Challenge my thinking, Ask your cards, Open questions
- Manage: Subjects, Knowledge maps, Course builds, Refocus suggestions, Duplicates
- Admin: Admin scans

The sidebar is built from the feature registry in `Sources/PostAnkiMac/Navigation`; each feature is declared in `Sources/PostAnkiMac/Features`. Every Cmd-U run checks the registry (target `PostAnkiMacRegistryTests`, hosted on the Mac app): unique ids, unique and non-reserved shortcuts (Cmd-K is reserved for the palette), no empty group, and the home fallback.

### Shortcuts

- Cmd-comma: Settings
- Cmd-K: command palette (type to filter sidebar entries and groups, Up/Down, Return to jump, Escape to close)
- Help > Keyboard Shortcuts: window listing all shortcuts
- Cmd-N: New Knowledge Item (opens Add knowledge)
- Cmd-1 to Cmd-6: Home, Courses, Review, Knowledge, Progress, Add knowledge (Go menu)
- Cmd-Shift-L: Learning list
- Cmd-Shift-F: Search
- Cmd-R: reload on a screen
- Cmd-F: focus the search field on Knowledge, Sources, Tags, Notes, Phrase bank and Search
- Cmd-Shift-M: move selected knowledge items
- Cmd-Option-S: toggle sidebar

### Command line

```sh
xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiMac \
  -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build
```

Both schemes must build before changing anything in `Sources/Shared`.

The shared API package has decoding tests against sample server responses (`Packages/PostAnkiAPI/Tests`): run `swift test --package-path Packages/PostAnkiAPI`.

## Origin

This project was moved here from a standalone repository whose history was not imported. The old per-task plans are in docs/ios-planning-history.
