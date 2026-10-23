#if DEBUG
import SwiftUI

struct PowerSyncSpikeView: View {
    @State private var store = PowerSyncSpikeStore()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PowerSync spike: subjects (\(store.subjects.count) rows from local SQLite)")
                .font(.headline)
            Text("Sync status: \(store.status)")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let errorText = store.errorText {
                Text(errorText)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            List(store.subjects) { subject in
                HStack {
                    Text(subject.name)
                    Spacer()
                    Text(subject.parentId == nil ? subject.kind : "sub-subject")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text("topics (\(store.topics.count) rows from local SQLite)")
                .font(.headline)

            List(store.topics) { topic in
                HStack {
                    Text(topic.title)
                    Spacer()
                    Text(topic.included ? "included" : "excluded")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        #if os(macOS)
        .frame(minWidth: 520, minHeight: 560)
        #endif
        .task { store.start() }
    }
}
#endif
