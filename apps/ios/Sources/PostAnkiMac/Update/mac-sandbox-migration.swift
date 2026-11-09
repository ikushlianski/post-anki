import Foundation

enum MacSandboxMigration {
    static let doneKey = "mac.sandboxMigrationDone"
    static let containerID = "com.ikushlianski.postankimac"
    static let queueFiles = ["pending-grades.json", "pending-triage-decisions.json", "pending-answers.json"]

    static func filesToCopy(containerHas: Set<String>, currentHas: Set<String>) -> [String] {
        queueFiles.filter { containerHas.contains($0) && !currentHas.contains($0) }
    }

    static func keysToImport(container: [String: Any], existing: Set<String>) -> [String] {
        container.keys
            .filter { !$0.hasPrefix("Apple") && !existing.contains($0) }
            .sorted()
    }

    static func runIfNeeded(
        defaults: UserDefaults = .standard,
        fileManager: FileManager = .default,
        home: URL = FileManager.default.homeDirectoryForCurrentUser,
        isSandboxed: Bool = ProcessInfo.processInfo.environment["APP_SANDBOX_CONTAINER_ID"] != nil
    ) {
        guard !isSandboxed, !defaults.bool(forKey: doneKey) else { return }

        let data = home.appendingPathComponent("Library/Containers/\(containerID)/Data/Library")

        copyQueues(
            from: data.appendingPathComponent("Application Support"),
            to: home.appendingPathComponent("Library/Application Support"),
            fileManager: fileManager
        )
        importDefaults(
            from: data.appendingPathComponent("Preferences/\(containerID).plist"),
            into: defaults
        )

        defaults.set(true, forKey: doneKey)
    }

    private static func copyQueues(from source: URL, to target: URL, fileManager: FileManager) {
        func names(in folder: URL) -> Set<String> {
            Set((try? fileManager.contentsOfDirectory(atPath: folder.path)) ?? [])
        }

        let copy = filesToCopy(containerHas: names(in: source), currentHas: names(in: target))

        guard !copy.isEmpty else { return }

        try? fileManager.createDirectory(at: target, withIntermediateDirectories: true)

        for name in copy {
            try? fileManager.copyItem(at: source.appendingPathComponent(name), to: target.appendingPathComponent(name))
        }
    }

    private static func importDefaults(from plist: URL, into defaults: UserDefaults) {
        guard let container = NSDictionary(contentsOf: plist) as? [String: Any] else { return }

        let domain = Bundle.main.bundleIdentifier ?? containerID
        let existing = Set(defaults.persistentDomain(forName: domain)?.keys.map { $0 } ?? [])

        for key in keysToImport(container: container, existing: existing) {
            defaults.set(container[key], forKey: key)
        }
    }
}
