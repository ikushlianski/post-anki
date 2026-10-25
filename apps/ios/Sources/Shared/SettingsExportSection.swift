import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class CardExportModel {
    var isExporting = false
    var exportURL: URL?
    var failed = false

    func export() async {
        failed = false
        exportURL = nil
        isExporting = true
        defer { isExporting = false }

        do {
            let data = try await APIClient.exportKnowledgeBits()
            let name = "post-anki-cards-\(Date.now.formatted(.iso8601.year().month().day())).csv"
            let url = FileManager.default.temporaryDirectory.appending(path: name)

            try data.write(to: url, options: .atomic)
            exportURL = url
        } catch {
            failed = true
        }
    }
}

struct SettingsExportSection: View {
    let isSignedIn: Bool

    @State private var model = CardExportModel()

    var body: some View {
        Section("Export") {
            Button("Export cards") { Task { await model.export() } }
                .disabled(model.isExporting || !isSignedIn)

            if model.isExporting {
                ProgressView()
            }

            if model.failed {
                Text("Couldn't export").foregroundStyle(.red)
            }

            #if os(iOS)
            if let url = model.exportURL {
                ShareLink(item: url)
            }
            #endif
        }
    }
}
