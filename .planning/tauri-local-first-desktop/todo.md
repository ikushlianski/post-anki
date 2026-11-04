# Tauri local-first desktop

## quick-desktop-mvp

### Scope
- Quick hack of a real desktop app with its own icon: sign in, subjects list, add knowledge, review, cram. No planning or review rounds.
- Out of scope: Updater, CI release, offline sync, polish.

### Goal
- A Mac app I can double-click, sign in to, and use to see subjects, add knowledge, review and cram.

### Criteria
- [ ] The app opens from its own icon and shows its own screens, not the website.
- [ ] I can sign in and the login survives a restart.
- [ ] The subjects list shows after sign-in.
- [ ] I can add knowledge and review cards, and cram a subject.

### Coding tasks
- [x] Replace the website-loading page in the desktop app with a small local React page, tighten the content policy, and make the app build as a Mac app bundle with the existing icon.
- [x] Add a native sign-in command that calls the production API, keeps the login token in the macOS Keychain, and lets the page ask whether a login exists.
- [x] Add a native command that fetches the subjects list from the production API with the stored token and caches it in the local database so it also shows offline.
- [x] Build the login form and the subjects list screen in the local page.
- [x] Build the Mac app bundle, launch it, and report what works.
- [x] Add the add-knowledge screen, which sends new knowledge to the production API.
- [x] Add the review screen, which shows due cards and sends the grade to the production API.
- [x] Add cram mode for a subject, which shows all its cards regardless of due date and does not change the schedule.
- [x] Give the desktop app the layout and habits of a standard Mac app: a left sidebar with Subjects, Add knowledge, Review and Cram, the system font, light and dark mode, a native menu bar with keyboard shortcuts such as Command-1 to 4 and Command-N, and large readable controls.

### Notes


## desktop-core-flows

### Scope
- The minimum the desktop app must do: show the subjects list, ingest knowledge, review cards and cram cards.
- Out of scope: Every other web or iOS screen, and offline sync.

### Goal
- In the desktop app I can see my subjects, add knowledge, review due cards and cram a subject.

### Criteria
- [ ] The desktop app lists my subjects.
- [ ] Knowledge added in the desktop app appears in the same account on the web.
- [ ] Reviewing a card in the desktop app updates its schedule.
- [ ] Cram mode lets me go through a subject's cards regardless of due date.

### Coding tasks
- [ ] [blocked: user] Sign in once in the running dev desktop app and try the subjects list, add knowledge and review against the live API, then report anything that fails.
  - Why: Only the owner has the account login, and the flows have never been run against the live API.
  - Decision: Sign in and try the flows, or hand over a test account.
  - Default: Sign in yourself and report failures; fixes follow.
- [x] Build and run the existing desktop shell on this Mac and check whether the subjects list, add knowledge and review work in its window; record what fails.

### Notes
- Depends on release-pipeline-and-updater's dependency approval only for the local-first version; the website-in-a-window version needs no new dependency.


## release-pipeline-and-updater

### Scope
- Build, sign, notarize and publish the Mac desktop app from a tagged release, and let the app offer updates.
- Out of scope: Windows and Linux builds, and the local-first data layer.

### Goal
- Pushing a version tag produces a signed, notarized Mac build on a free release page, and the running app tells me a newer version exists and updates itself when I click Update.

### Criteria
- [ ] A tagged release builds, signs and notarizes the Mac app in CI with no manual step.
- [ ] The release publishes the app and the update manifest to free hosting.
- [ ] The app shows an Update button only when a newer signed version exists, and installing it keeps local data.
- [ ] No signing key or Apple credential is stored in the repo; they live only in CI secrets.

### Coding tasks
- [x] Give the development build of the desktop app its own icon with a visible DEV label, and keep the release build's icon as the plain Post Anki logo with no label. This lets the owner tell the two apps apart in the Dock and app switcher when both are installed.
- [ ] [blocked: user] Approve the new updater and PowerSync dependencies before any of the release pipeline or the local-first app is built.
  - Why: The owner's rule is to propose dependencies before adding them; the list is in plan.md and the release plan.
  - Decision: Approve the listed packages or change them.
  - Default: Approve.
- [ ] Get the Apple Developer account and Developer ID certificate in place, since notarization cannot run without them.
  - Why: Notarization needs a paid Apple membership that only the owner can create.
  - Decision: Enroll in the Apple Developer Program now, or ship ad-hoc signed builds first.
  - Default: Enroll now; the cost is 99 USD per year.
- [ ] Generate the updater signing key pair and document which CI secrets the owner must create, without committing any key.
- [ ] Add the Tauri updater to the desktop app so it checks for a newer signed version on start and shows an Update button that downloads, installs and restarts.
- [ ] Add a GitHub Actions workflow that builds, signs, notarizes and uploads the Mac app and its update manifest when a version tag is pushed.

### Notes


## webview-local-store

### Scope
- Find out whether the local database can run inside the macOS Tauri webview.
- Out of scope: Building the feature; this is investigation only.

### Goal
- We know whether PowerSync's web SDK or Tauri's SQL plugin should be the local store.

### Criteria
- [x] The official docs say whether the web SDK works in the macOS webview (storage and background workers).
- [x] A small test shows it works or fails on this Mac, or the gap is stated.

### Coding tasks
- [x] Read the PowerSync web SDK and Tauri SQL plugin docs, then run a small test that stores and reads the subjects table inside the Tauri window and reports the result.

### Notes

## token-storage

### Scope
- Decide where the desktop app keeps the API login token.
- Out of scope: Building the feature; this is investigation only.

### Goal
- We know the safest free place to keep the login token on macOS.

### Criteria
- [x] The docs for the macOS Keychain, Stronghold and other options are compared with sources.
- [x] One option is recommended with its cost and setup effort.

### Coding tasks
- [x] Compare Keychain through a Rust command, the Stronghold plugin and any other maintained Tauri option for storing a login token, and recommend one.

### Notes

## shared-react-ui

### Scope
- Find how the desktop app can reuse the web app's React screens.
- Out of scope: Building the feature; this is investigation only.

### Goal
- We know how to share the web app's screens without its server rendering.

### Criteria
- [x] The way to build the web routes without server rendering is documented with sources.
- [x] The 53 server calls in the web app are grouped by what replaces them.

### Coding tasks
- [x] Study how TanStack Start can build as a static single-page app, and list which server calls need a replacement for the desktop build.

### Notes

## signing-and-release

### Scope
- Find the real cost and steps to sign, notarize and update the Mac app.
- Out of scope: Building the feature; this is investigation only.

### Goal
- We know the exact yearly cost and the steps to ship signed updates.

### Criteria
- [ ] Apple's own page confirms the membership price and that notarization has no extra fee.
- [x] Steps for signing, notarizing and publishing updates on free hosting are documented.

### Coding tasks
- [x] Read Apple's membership and notarization pages and Tauri's macOS signing and updater docs, then write the steps and the total yearly cost.

### Notes

## powersync-hosting

### Scope
- Find where a free production sync service can run.
- Out of scope: Building the feature; this is investigation only.

### Goal
- We know a free way to host PowerSync for one user in production.

### Criteria
- [x] PowerSync's self-hosting docs list what the service needs to run.
- [x] At least one free or already-owned place to run it is named with its limits.

### Coding tasks
- [x] Read the PowerSync self-hosting docs and our existing cloud setup, and name a free place to run the service for one user, with its limits.

### Notes

## security-hardening

### Scope
- Find a strict security setup for the desktop window.
- Out of scope: Building the feature; this is investigation only.

### Goal
- We know the strictest content policy and permission list the app can run with.

### Criteria
- [x] The official docs give a content policy and permission list that fit our app.
- [x] Any feature that needs a looser rule is named with the reason.

### Coding tasks
- [x] Read Tauri's content policy, permissions and capabilities docs and draft the strictest settings that still let the app reach our API and local database.

### Notes

