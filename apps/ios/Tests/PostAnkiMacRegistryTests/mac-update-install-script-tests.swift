import Testing
@testable import PostAnkiMac

struct MacUpdateInstallScriptTests {
    @Test func shouldKeepPathsWithSpacesAndQuotesAsSingleArguments() {
        #expect(MacUpdateInstallScript.quote("/Apps/Post Anki.app") == "'/Apps/Post Anki.app'")
        #expect(MacUpdateInstallScript.quote("/a/it's.app") == #"'/a/it'\''s.app'"#)
    }

    @Test func shouldWaitForTheRunningAppToExitBeforeSwapping() {
        let script = MacUpdateInstallScript.render(pid: 123, newApp: "/t/New.app", installedApp: "/Apps/Post Anki.app")

        #expect(script.contains("kill -0 123"))
        #expect(script.contains("mv '/Apps/Post Anki.app' '/Apps/Post Anki.app.old'"))
    }

    @Test func shouldPutTheOldAppBackWhenCopyingTheNewOneFails() {
        let script = MacUpdateInstallScript.render(pid: 1, newApp: "/t/New.app", installedApp: "/Apps/Post Anki.app")

        #expect(script.contains("mv '/Apps/Post Anki.app.old' '/Apps/Post Anki.app'"))
        #expect(script.contains("open '/Apps/Post Anki.app'"))
    }
}
