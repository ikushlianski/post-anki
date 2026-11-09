import Testing
@testable import PostAnkiMac

struct MacSandboxMigrationTests {
    @Test func shouldCopyQueuedWorkThatOnlyExistsInTheOldContainer() {
        let copy = MacSandboxMigration.filesToCopy(
            containerHas: ["pending-grades.json", "pending-answers.json", "other.db"],
            currentHas: []
        )

        #expect(copy == ["pending-grades.json", "pending-answers.json"])
    }

    @Test func shouldNeverOverwriteQueuedWorkAlreadyInTheNewLocation() {
        let copy = MacSandboxMigration.filesToCopy(
            containerHas: ["pending-grades.json", "pending-triage-decisions.json"],
            currentHas: ["pending-grades.json"]
        )

        #expect(copy == ["pending-triage-decisions.json"])
    }

    @Test func shouldCopyNothingWhenThereIsNoOldContainerData() {
        #expect(MacSandboxMigration.filesToCopy(containerHas: [], currentHas: ["pending-grades.json"]).isEmpty)
    }

    @Test func shouldImportOnlySettingsTheUserHasNotAlreadySetAgain() {
        let keys = MacSandboxMigration.keysToImport(
            container: ["mac.zoomScale": 1.25, "mac.menuBarEnabled": false, "NSWindow Frame": "x", "AppleLanguages": ["en"]],
            existing: ["mac.menuBarEnabled"]
        )

        #expect(keys == ["NSWindow Frame", "mac.zoomScale"])
    }
}
