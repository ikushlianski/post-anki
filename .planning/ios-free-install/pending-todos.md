# Pending todos for native-apple-apps (not yet in .planning/TODO.md)

Move these into the `native-apple-apps` direction with the todo tool when it can run again.

- Install the iPhone app on the owner's phone from Xcode with a free Apple ID, without TestFlight or the paid developer program. Script the build and install so the weekly 7-day reinstall is one command from the Mac.
- Run the iPhone install script automatically on the owner's Mac every few days (a scheduled launchd job), so the free-account 7-day expiry never bites. It needs the phone paired over Wi-Fi and the Mac awake, and should tell the owner when the phone was not reachable.
- The installed iPhone app says it is offline. The live API address the app uses (api.postanki.ilya.online) does not answer over https from outside, so find the working public API address or fix the domain mapping, then confirm the app loads data.
- The iPhone app shows far more screens than the web app. Cut the app's visible screens down to the web app's set (add knowledge, knowledge browser, subjects, triage, review, profile) while keeping all the network and data code underneath.
- LOWEST PRIORITY, move to the backlog (not this task): make the iPhone app work well with Wispr Flow dictation so the owner can dictate knowledge on the go. Check that dictated and pasted text lands in the Add screen and is submitted for triage, and fix anything that gets in the way.
- The iPhone app keeps signing in with a pasted access token for now, and no new sign-in flow is built for it. The web login work must never block requests that carry a valid access token.
- Link every access token to a user, starting with the owner's email kushliansky@gmail.com, so the iPhone app and the web login resolve to the same person. This keeps the app ready for more than one user.
