import AppKit
import Foundation

enum MacUpdateInstallError: LocalizedError {
    case badDownload
    case unpackFailed
    case badBundle
    case badSignature

    var errorDescription: String? {
        switch self {
        case .badDownload: "The download did not match the published file."
        case .unpackFailed: "The update could not be unpacked."
        case .badBundle: "The downloaded app is not a newer Post Anki."
        case .badSignature: "The downloaded app is damaged."
        }
    }
}

enum MacUpdateInstaller {
    @MainActor
    static func install(_ release: MacUpdateRelease, current: MacUpdateVersion) async throws -> String? {
        let work = FileManager.default.temporaryDirectory.appendingPathComponent("postanki-update-\(UUID().uuidString)")

        try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)

        let (file, _) = try await URLSession.shared.download(from: release.assetURL)
        let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? -1

        guard size == release.assetSize else { throw MacUpdateInstallError.badDownload }

        let zip = work.appendingPathComponent("update.zip")
        try FileManager.default.moveItem(at: file, to: zip)

        let unpacked = work.appendingPathComponent("unpacked")

        guard run("/usr/bin/ditto", ["-x", "-k", zip.path, unpacked.path]) == 0,
              let appName = try? FileManager.default.contentsOfDirectory(atPath: unpacked.path).first(where: { $0.hasSuffix(".app") })
        else { throw MacUpdateInstallError.unpackFailed }

        let newApp = unpacked.appendingPathComponent(appName)
        let info = Bundle(url: newApp)?.infoDictionary ?? [:]

        guard MacUpdateBundleCheck.validate(
            info: info,
            currentVersion: current,
            expectedTag: release.tag,
            bundleID: Bundle.main.bundleIdentifier ?? ""
        ) == nil else { throw MacUpdateInstallError.badBundle }

        guard run("/usr/bin/codesign", ["--verify", "--deep", "--strict", newApp.path]) == 0 else {
            throw MacUpdateInstallError.badSignature
        }

        let installed = Bundle.main.bundleURL

        guard FileManager.default.isWritableFile(atPath: installed.deletingLastPathComponent().path) else {
            NSWorkspace.shared.activateFileViewerSelecting([newApp])

            return "Post Anki can't replace itself in this folder. The new version is shown in Finder; drag it over the old one."
        }

        let script = work.appendingPathComponent("install.sh")
        let text = MacUpdateInstallScript.render(
            pid: ProcessInfo.processInfo.processIdentifier,
            newApp: newApp.path,
            installedApp: installed.path
        )

        try text.write(to: script, atomically: true, encoding: .utf8)

        let launcher = Process()
        launcher.executableURL = URL(fileURLWithPath: "/bin/sh")
        launcher.arguments = [script.path]
        launcher.standardOutput = FileHandle.nullDevice
        launcher.standardError = FileHandle.nullDevice
        try launcher.run()

        await flushQueues()
        NSApplication.shared.terminate(nil)

        return nil
    }

    private static func flushQueues() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await PendingQueueFlusher.flushAll() }
            group.addTask { try? await Task.sleep(for: .seconds(5)) }

            await group.next()
            group.cancelAll()
        }
    }

    private static func run(_ path: String, _ arguments: [String]) -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do { try process.run() } catch { return -1 }

        process.waitUntilExit()

        return process.terminationStatus
    }
}
