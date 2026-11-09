import PostAnkiAPI
import SwiftUI
import UniformTypeIdentifiers

struct AddKnowledgeFileImport: View {
    let model: TextFileImportModel
    let subjectId: String?

    @State private var isPickerShown = false
    @State private var isDropTargeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                isPickerShown = true
            } label: {
                Label(model.isUploading ? "Uploading…" : "Import a .txt file", systemImage: "doc.text")
            }
            .disabled(model.isUploading)

            #if os(macOS)
            Text("or drop it here. Anki exports and plain text both work.")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
            #else
            Text("Anki exports and plain text both work.")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
            #endif

            if let message = model.message {
                Text(message).zoomFont(.caption)
            }

            if let status = model.status {
                Text(status.summaryText).zoomFont(.caption).foregroundStyle(.secondary)
            }

            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .zoomFont(.caption)
                    .foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                .foregroundStyle(isDropTargeted ? Color.accentColor : Color.secondary.opacity(0.4))
        )
        .fileImporter(isPresented: $isPickerShown, allowedContentTypes: [.plainText]) { result in
            if case .success(let url) = result { start(url) }
        }
        #if os(macOS)
        .dropDestination(for: URL.self) { urls, _ in
            guard let url = urls.first, !model.isUploading else { return false }

            start(url)

            return true
        } isTargeted: { isDropTargeted = $0 }
        #endif
        .onDisappear { model.stopWatching() }
    }

    private func start(_ url: URL) {
        Task { await model.importFile(at: url, subjectId: subjectId) }
    }
}
