import PostAnkiAPI
import SwiftUI

struct DecideHistoryScreen: View {
    @State private var model = DecideHistoryModel()

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
                Button("Try again") { Task { await model.load() } }
            } else if model.isLoading && !model.hasLoaded {
                ProgressView()
            } else if model.hasLoaded && model.sessions.isEmpty {
                Text("No decisions yet.").foregroundStyle(.secondary)
            }

            ForEach(model.sessions) { session in
                NavigationLink {
                    DecideSessionDetailScreen(session: session)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(session.decision).lineLimit(2)

                        if let date = DueReviewModel.nextDueText(session.createdAt) {
                            Text(date).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("History")
        .inlineNavigationTitle()
        .refreshable { await model.load() }
        .task { await model.load() }
    }
}

struct DecideSessionDetailScreen: View {
    @State private var model = DecideModel()
    let session: DecideSession

    var body: some View {
        List {
            Section("Decision") { Text(session.decision) }

            Section("Where you leaned") { Text(session.opinion) }

            DecideSessionView(
                session: model.session ?? session,
                resolving: model.resolving,
                message: model.spotMessage
            ) { id, accepted in
                Task { await model.resolve(spotId: id, accepted: accepted) }
            }
        }
        .navigationTitle("Decision")
        .inlineNavigationTitle()
        .onAppear { if model.session == nil { model.session = session } }
    }
}
