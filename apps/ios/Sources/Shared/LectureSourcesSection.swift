import PostAnkiAPI
import SwiftUI

struct LectureSourcesSection: View {
    let model: LectureModel

    var body: some View {
        Section("Lecture sources") {
            if model.needsSources {
                Text("This course has no sources yet. Find and approve some, then compile.")
                    .foregroundStyle(.secondary)
            }

            if model.isFindingSources {
                HStack {
                    ProgressView()
                    Text("Finding sources...")
                }
            } else {
                Button("Find lecture sources") { Task { await model.findSources() } }
            }

            if model.findReturnedNothing {
                Text("No sources found. Try again later.")
                    .foregroundStyle(.secondary)
            }

            if let message = model.sourceError {
                Text(message).foregroundStyle(.red)
            }

            ForEach(model.sources) { source in
                row(source)
            }
        }
    }

    private func row(_ source: LectureSourceCandidate) -> some View {
        ZoomVStack(alignment: .leading, spacing: 4) {
            if let url = WebLink.url(from: source.url) {
                Link(source.title, destination: url)
            } else {
                Text(source.title)
            }

            Text(source.whySelected)
                .zoomFont(.caption)
                .foregroundStyle(.secondary)

            if source.reviewStatus == "pending" {
                HStack {
                    Button("Approve") { Task { await model.review(source, approve: true) } }
                    Button("Reject", role: .destructive) { Task { await model.review(source, approve: false) } }
                }
                .buttonStyle(.bordered)
            } else {
                Text(source.reviewStatus.capitalized)
                    .zoomFont(.caption)
            }
        }
    }
}
