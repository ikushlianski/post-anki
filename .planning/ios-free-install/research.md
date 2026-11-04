# Running PostAnkiIOS on your own iPhone for free

Researched 2026-10-24. Every claim is labelled **Fact** (with a source) or **Assumption**. Third-party sideloading tools change often, so check their status again before you rely on them.

## Short answer

You can't use TestFlight without paying. The free route is Xcode's "Personal Team": you install the app straight from your Mac, by cable or over Wi-Fi, and then reinstall it every 7 days. For the phone to reach the API, the simplest free option is Tailscale on the Mac and the iPhone, with `tailscale serve` giving the Mac an `https://…ts.net` address. A plain `http://<Mac LAN IP>:5560` address will not work without a code change, because the app itself refuses it (see the gotchas).

## 1. TestFlight

- **Fact:** TestFlight, App Store Connect and Certificates, Identifiers & Profiles all come only with the paid Apple Developer Program, which costs 99 USD a year. A free "Apple Developer" account "can't distribute apps". Sources: https://developer.apple.com/support/compare-memberships/, https://developer.apple.com/help/account/reference/supported-capabilities-ios
- **Fact:** A free account also can't publish to TestFlight or the App Store. Source: https://learn.microsoft.com/th-th/previous-versions/xamarin/ios/get-started/installation/device-provisioning/free-provisioning
- **Assumption:** The EU, Japan and Brazil alternative marketplaces (AltStore PAL and others) don't help either. Listing your own app there goes through Apple's notarization, which needs a paid membership. The AltStore FAQ confirms PAL is a marketplace for those regions only (https://faq.altstore.io/release-notes/altstore-pal), but I did not find an Apple page that says outright that notarization requires the paid program.

## 2. Free provisioning with a free Apple ID

**Limits.** All Fact, quoted from https://developer.apple.com/support/compare-memberships/:

- Up to 10 App IDs, which expire after 7 days.
- Up to 3 devices, which expire after 7 days.
- Up to 3 apps installed per device.
- Provisioning profiles expire 7 days after they are issued. You then rebuild and reinstall.

**Renewing.** Plug in the phone, or use Wi-Fi pairing, and press Run in Xcode again within 7 days.
- **Assumption:** Installing over the old copy, even an expired one, keeps the app's data and Keychain items, as long as the bundle id and the team stay the same. Deleting the app first is what loses the data.
- **Fact:** You can reuse one bundle id to stay under the App ID cap. This is advice from Apple DTS: https://developer.apple.com/forums/thread/724896

**Developer Mode.** Turn it on under Settings > Privacy & Security > Developer Mode. The phone restarts, and then you confirm.
- **Fact:** The option only shows up after the phone has been connected to Xcode. Source: https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device

**Trusting the profile.** On first launch, go to Settings > General > VPN & Device Management, choose your Apple ID under "Developer App", and tap Trust.
- **Fact:** On iOS 18 and later the button is called "Allow & Restart". Source: https://support.apple.com/en-us/HT204460, which describes enterprise apps; the free-account flow uses the same screen.

**Wireless install.**
- **Fact:** Pair the phone once over a cable: Window > Devices and Simulators, select the phone, tick "Connect via network". After that it shows up as a run destination while it is on the same Wi-Fi as the Mac. Source: https://help.apple.com/xcode/mac/current/en.lproj/devbc48d1bad.html

**Tools that re-sign the app for you each week:**

- **SideStore** (free, open source):
  - **Fact:** It re-signs apps with your personal certificate and refreshes them on the phone through an on-device VPN. Source: https://github.com/Spidy123222/SideStore/blob/develop/README.md
  - **Fact:** 2026 guides report it working on iOS 26.x with LocalDevVPN. Sources: https://iphonesoft.fr/2026/03/11/guide-ios-26-installer-sidestore-livecontainer-sideloader-apps-jailbreak, https://gigazine.net/gsc_news/en/20260628-sidestore-sideloading-ios/
  - **Fact:** It breaks from time to time. Refresh failed on iOS 26.4 until an update, and the "anisette" servers it depends on sometimes go down. Source: https://ptkd.com/journal/how-to-fix-the-app-is-not-properly-signed-in-sidestore
- **AltStore Classic plus AltServer:**
  - **Fact:** AltServer has to run on the Mac on the same Wi-Fi, apps expire every 7 days, and there is a 3-app limit. Source: https://faq.altstore.io/llms-full.txt
- **Sideloadly:**
  - **Fact (third-party):** It refreshes apps automatically while the phone can reach the Mac over USB or Wi-Fi. Source: https://hamradio.my/sideloadly-the-ultimate-ios-sideloading-tool-without-jailbreak/
  - It is closed source.

**Risks of these tools.**
- **Assumption:** You give your Apple ID password to software that isn't Apple's, and they rely on unofficial anisette servers.
- **Fact:** I found no Apple announcement in 2025–2026 that blocks free provisioning. The 7-day and 3-app limits haven't changed. Sources: the compare-memberships page above and the 2026 guides.

**My take (Assumption):** you build the app yourself and the Mac has to be on anyway to run the API. So these tools add little. Reinstalling from Xcode each week, or a small `launchd` job that runs the commands in section 5, does the same job without handing your Apple ID to a third party.

## 3. Capabilities on a free account

**Fact:** Apple's iOS capability table shows what the free "Apple Developer" column includes (source: https://developer.apple.com/help/account/reference/supported-capabilities-ios):
- Available: App Groups, Keychain Sharing, Background Modes, Data Protection, HealthKit, HomeKit, Maps.
- Not available: Push Notifications, Associated Domains, iCloud/CloudKit, Sign in with Apple, Network Extensions, App Attest.

What that means for this app:
- **Keychain:** Storing the token needs no entitlement at all, so it works.
- **Push notifications:** Not available on a free account.
- **App Groups:** Available.
- **Fact (repo):** The iOS target declares no entitlements file and no `aps-environment`. Source: `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/ios/project.yml`. So the app should sign as it is.
- **Fact (Apple):** On iOS 17 and later, App Transport Security (Apple's rule that apps use secure connections) blocks raw IP addresses by default. `NSAllowsLocalNetworking` re-allows IP addresses, `.local` names and unqualified names. Source: https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking
- **Fact (repo):** The iOS Info.plist already sets that key: `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/ios/Config/PostAnkiIOS-Info.plist:21`.
- **Fact:** Any app that connects to hosts on the local network should declare `NSLocalNetworkUsageDescription`. Source: https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription
- **Fact (repo):** The iOS plist does not declare it yet.

## 4. Letting the phone reach the API for free

**Fact (repo):** The app accepts plain `http://` only for `localhost` and `127.0.0.1`. On the phone, those addresses mean the phone itself, not the Mac. It also sends the access token only to `https` addresses or those two loopback hosts. Sources:
- `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/ios/Sources/Shared/SettingsScreen.swift:29`
- `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient.swift:78`

So you need an HTTPS address that points at the Mac. The alternative is a code change that allows private LAN addresses.

**Options for reaching the Mac:**

- **Tailscale. This is the recommendation.**
  - **Fact:** The free Personal plan has unlimited devices and up to 6 users, for non-commercial use. Source: https://tailscale.com/pricing/
  - **Fact:** Turn on MagicDNS and HTTPS Certificates in the admin console. Then `tailscale serve` proxies the local port at `https://<mac-name>.<tailnet>.ts.net`. Source: https://tailscale.com/kb/1153/enabling-https/
  - **Fact:** Turning on HTTPS publishes your machine names to the public certificate logs. Source: same page.
  - This works from anywhere, with no code change. It is reachable only by devices signed in to your tailnet.
- **Same Wi-Fi to the Mac's LAN IP or `.local` name.**
  - **Fact:** The API calls `server.listen(env.PORT)` without a host, so Node listens on every network interface (`/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/server.ts:10`).
  - Using it needs the code change above, and ideally a usage text for the local-network prompt.
  - The token would also travel unencrypted over Wi-Fi.
- **Cloudflare Quick Tunnel.**
  - **Fact:** `cloudflared tunnel --url http://localhost:5560` gives a random `trycloudflare.com` HTTPS address with no account needed. Source: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
  - **Fact:** The address changes every run, there is a 200 concurrent-request cap, no Server-Sent Events, and no uptime guarantee. Source: same page.
  - **Fact:** A named tunnel with a fixed address needs a domain on Cloudflare. Source: https://flaviocopes.com/cloudflare-tunnel/
  - Either way the API is exposed to the public internet, protected only by the token.

**Free hosting, listed only. These are options, not recommendations to spend money:**

- **Neon Free** (Postgres):
  - **Fact:** Includes pgvector, 0.5 GB storage, 100 CU-hours a month, and the database sleeps after 5 minutes idle. Source: https://neon.com/faqs/free-plan-limits-and-quotas
- **Supabase Free** (Postgres with pgvector):
  - **Fact:** Projects with low activity over a 7-day period are paused. Source: https://supabase.com/docs/guides/platform/free-project-pausing.md
  - **Fact (third-party, conflicting figures):** About 500 MB of database storage. Source: https://automationatlas.io/answers/supabase-free-tier-limits-2026/
- **Render Free** web service, for the Node API:
  - **Fact:** It spins down after 15 minutes without traffic and takes about a minute to wake. Source: https://render.com/docs/free
  - **Fact:** Render's free Postgres expires after 30 days. Source: same page.
- **Oracle Cloud Always Free** Arm VM (could run Docker Compose with Postgres and pgvector):
  - **Fact (InfoQ, July 2026):** The allowance was halved to 2 OCPU and 12 GB on 2026-06-15. Source: https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/
  - **Fact:** Oracle's own page may still show the old figures: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm

**Assumption:** Hosting the API also means running Electric, the background jobs and the LLM keys that `npm run dev` provides locally. That is more than a free tier comfortably holds.

## 5. Recommended steps for this repo

1. **Sign in with your Apple ID.** In Xcode > Settings > Accounts, add your Apple ID. A "(Personal Team)" appears.
   - To find its Team ID, open any project's Signing & Capabilities tab.
   - Or, after the first signing, run this; the `OU=` value is the Team ID:
     ```sh
     security find-certificate -c "Apple Development" -p | openssl x509 -noout -subject
     ```
2. **Fill in `Local.xcconfig`.** In `apps/ios/Local.xcconfig`, which you edit yourself, set:
   - `DEVELOPMENT_TEAM` to that Team ID
   - `CODE_SIGN_STYLE = Automatic`
   - `POSTANKI_DEV_API_URL = https:/$()/<mac>.<tailnet>.ts.net`
   - Template: `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/ios/Local.xcconfig.example`
   - **Fact:** The bundle id `com.ikushlianski.postankiios` is hard-coded in `project.yml`.
   - **Assumption:** If Xcode reports it as taken, change it in `project.yml`. A value in `Local.xcconfig` would be overridden by the target setting.
3. **Generate the project.** Run `cd apps/ios && xcodegen generate`.
4. **Prepare the phone.** Connect it by cable, tap "Trust This Computer", and turn on Developer Mode.
   - In Xcode, choose scheme `PostAnkiIOS` and select your iPhone as the run destination.
   - Press Run. On the phone, trust the developer under VPN & Device Management.
   - Optionally, tick "Connect via network" so later installs work over Wi-Fi.
5. **Expose the API.**
   - Start the API on the Mac with `npm run dev` in the repo root. It listens on port 5560 (README).
   - Install Tailscale on the Mac and the iPhone and sign both into the same account.
   - Turn on MagicDNS and HTTPS.
   - Run `tailscale serve --bg 5560`. **Assumption:** that is the current CLI syntax; check with `tailscale serve --help`.
   - Check it from Safari on the phone.
6. **Add the access token.**
   - Create one with `tsx scripts/create-api-token.ts <label>`, run from `apps/api` with `DATABASE_URL` set (README; marked unverified there).
   - Paste it into the app's Settings. The app stores it in the Keychain.
7. **Weekly renewal from the command line.**
   - **Assumption:** this works with a Personal Team once the GUI has signed the app once. Run it from `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/ios`:
     ```sh
     xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiIOS -configuration Debug \
       -destination 'generic/platform=iOS' -derivedDataPath build -allowProvisioningUpdates build
     xcrun devicectl list devices
     xcrun devicectl device install app --device <UDID> build/Build/Products/Debug-iphoneos/PostAnkiIOS.app
     ```
   - **Fact:** `devicectl` is the install tool for iOS 17 and later; `ios-deploy` no longer works there. Source: https://lilting.ch/en/articles/xcode-cli-claude-code-ios-automation
   - You can wrap these commands in a `launchd` job that runs every 6 days.

## Main gotchas

- **The 7-day expiry.** The app simply stops opening. Reinstall to fix it. Set a 6-day reminder or a `launchd` job.
- **Plain `http://` to the Mac is rejected by the app's own code**, and the token isn't sent. Use the Tailscale HTTPS address, or change `isAddressAllowed` and `canSendToken`.
- **The Mac must be awake and the API running.** The phone has no server of its own. Use `caffeinate -s` or the Energy settings to keep the Mac awake.
- **Changing team or bundle id creates a new app.** The Keychain token and local data won't carry over.
- **Two of the 3 free app slots remain.** Any other free-signed app counts toward the limit, and so do SideStore and AltStore themselves.
- **Debug builds are slower and include the `-interposable` linker flag** (`project.yml`). They are fine for personal use.
- **Release build (Assumption).** A Release build would ignore `POSTANKI_DEV_API_URL` (README) and default to `https://api.postanki.ilya.online` (`APIClient.swift:12`), unless an address is saved in Settings.

END-OF-REPORT
