---
name: reinstall-postanki
description: Reinstall the Post Anki (prod) and Post Anki Dev iPhone apps over Wi-Fi with a fresh signing profile. Trigger on /reinstall-postanki, "reinstall the iPhone apps", "app unavailable on my phone", "refresh the 7-day signing".
---

# reinstall-postanki

Reinstalls both iPhone apps over Wi-Fi so the free Apple ID's 7-day signing restarts.

1. Ask nothing. The phone must be unlocked and on the same Wi-Fi as the Mac; if the install reports it cannot reach the phone, say so and stop.
2. Run from the repo root, prod first, then dev (each takes a few minutes; use a 10-minute timeout):

```
cd apps/ios && VARIANT=prod scripts/install-iphone.sh 00008110-000C79610A13801E
cd apps/ios && VARIANT=dev scripts/install-iphone.sh 00008110-000C79610A13801E
```

3. Report per app: installed or failed, with the failing line.
4. If the output says "profile has not been explicitly trusted", tell the user to open Settings, General, VPN & Device Management, tap the Apple ID and tap Trust, then open the apps.
5. Optionally confirm the new profile expiry: `security cms -D -i apps/ios/build/Build/Products/Release-iphoneos/PostAnkiIOS.app/embedded.mobileprovision | plutil -extract ExpirationDate raw -`.

The Mac also runs this automatically on Sundays and Wednesdays at 23:50 (`apps/ios/scripts/schedule-iphone-install.sh`).
