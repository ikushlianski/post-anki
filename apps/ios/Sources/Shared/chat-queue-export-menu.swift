import SwiftUI

struct ChatQueueExportMenu: View {
    let subjects: [ChatQueueExportSubject]
    let model: ChatQueueExportModel

    var body: some View {
        if model.isExporting {
            ProgressView()
                .accessibilityLabel("Preparing Markdown file")
                .accessibilityIdentifier("chat-queue-export-progress")
        } else {
            Menu {
                if subjects.isEmpty {
                    Text("No cards with a subject")
                } else {
                    ForEach(subjects) { subject in
                        Button(subject.name) { Task { await model.export(subject) } }
                            .accessibilityLabel("Share \(subject.name) as Markdown")
                    }
                }
            } label: {
                Label("Share as Markdown", systemImage: "square.and.arrow.up")
            }
            .accessibilityLabel("Share as Markdown")
            .accessibilityHint("Choose a subject to export its Chat conversations")
            .accessibilityIdentifier("chat-queue-export-menu")
        }
    }
}

struct ChatQueueExportSheet: View {
    let file: ChatQueueExportFile
    let onDone: () -> Void

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "doc.text")
                    .font(.largeTitle)
                    .accessibilityHidden(true)

                Text("\(file.subjectName) conversations are ready")
                    .multilineTextAlignment(.center)

                ShareLink(item: file.url) {
                    Label("Share \(file.url.lastPathComponent)", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("chat-queue-export-share")
            }
            .padding()
            .navigationTitle("Markdown export")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done", action: onDone) }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium])
        #else
        .frame(minWidth: 360, minHeight: 240)
        #endif
    }
}
