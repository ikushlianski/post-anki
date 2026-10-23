import SwiftUI

struct ContentInboxScreen: View {
    @State private var model = ContentInboxModel()
    @State private var expanded: Set<String> = []

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.items.isEmpty {
                Text("Nothing in the inbox.").foregroundStyle(.secondary)
            }

            ForEach(model.items) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.body).lineLimit(expanded.contains(item.id) ? nil : 4)

                    if let placement = item.suggestedPlacement, !placement.isEmpty {
                        Text("Suggested: \(placement)").font(.subheadline)
                    }

                    if let sourceRef = item.sourceRef, !sourceRef.isEmpty {
                        Text(sourceRef).font(.caption).foregroundStyle(.secondary)
                    }

                    Text(item.createdAt.prefix(10)).font(.caption).foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    if expanded.contains(item.id) { expanded.remove(item.id) } else { expanded.insert(item.id) }
                }
            }
        }
        .navigationTitle("Content inbox")
        .inlineNavigationTitle()
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}
