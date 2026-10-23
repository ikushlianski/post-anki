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
        }
        .padding()
        .frame(minWidth: 520, minHeight: 420)
        .task { store.start() }
    }
}
#endif
