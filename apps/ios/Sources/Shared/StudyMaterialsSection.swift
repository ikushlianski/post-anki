import PostAnkiAPI
import SwiftUI

struct StudyMaterialsSection: View {
    let model: StudyMaterialsModel

    var body: some View {
        Section("Examples") {
            Button("Request a worked example") { Task { await model.request(kind: "worked_example") } }
                .disabled(model.isRequesting)
            Button("Request an analogy") { Task { await model.request(kind: "analogy") } }
                .disabled(model.isRequesting)

            if let message = model.errorMessage {
                Text(message).foregroundStyle(.red)
            }

            if model.items.isEmpty {
                Text("No examples yet.").foregroundStyle(.secondary)
            }

            ForEach(model.items) { item in
                row(item)
            }
        }
    }

    private func row(_ item: StudyMaterial) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.kind == "analogy" ? "Analogy" : "Worked example")
                .font(.caption)
                .foregroundStyle(.secondary)

            switch item.status {
            case "generating":
                HStack {
                    ProgressView()
                    Text("Generating...")
                }
            case "failed":
                Text(item.failureReason ?? "Couldn't generate this one.")
                    .foregroundStyle(.red)
            default:
                if let body = item.body {
                    Text(LectureMarkdown.text(body)).textSelection(.enabled)
                }

                ForEach(item.citations, id: \.url) { citation in
                    if let url = WebLink.url(from: citation.url) {
                        Link(citation.title, destination: url).font(.caption)
                    } else {
                        Text(citation.title).font(.caption)
                    }
                }
            }
        }
    }
}
