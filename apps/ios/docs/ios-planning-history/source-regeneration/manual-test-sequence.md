No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Set the server address and access token in Settings, with sample data on the server.

## Steps
1. Review tab: tap Regenerate items on a source; read the confirm with the item count; confirm.
2. See Regenerating... replaced N items; wait for New items are ready and the refreshed list.
3. Tap it again while running on another device: it should just show progress.
4. Open a knowledge item from All items: tap Generate more question variants; the note appears and the button is disabled.
5. Later check Review for new variants.
