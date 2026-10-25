import PostAnkiAPI
import SwiftUI

struct PendingReviewInboxSummary: View {
    let sources: [PendingReviewSource]
    @Binding var subjectId: String?
    let resumed: FocusTriageStoredSession?
    var isStarting = false
    var startError: String?

    private var shownSubject: String? {
        if let resumed { return resumed.subjectId }

        return Self.validSubject(subjectId, in: sources)
    }

    static func validSubject(_ subjectId: String?, in sources: [PendingReviewSource]) -> String? {
        FocusTriageSubject.options(sources).contains { $0.id == subjectId } ? subjectId : nil
    }

    var body: some View {
        let queue = FocusTriageQueue.build(sources: sources, pinnedBitId: nil, subjectId: shownSubject)
        let options = FocusTriageSubject.options(sources)

        ZoomVStack(alignment: .leading, spacing: 8) {
            if options.count > 2 || resumed != nil || subjectId != nil {
                Picker("Subject", selection: Binding(get: { shownSubject }, set: { subjectId = $0 })) {
                    ForEach(options, id: \.id) { option in
                        Text("\(option.name) (\(option.readyCount))").tag(option.id)
                    }
                }
                .disabled(resumed != nil || isStarting)
            }

            Text("\(queue.readyCount) \(queue.readyCount == 1 ? "card is" : "cards are") waiting for your decision")
                .zoomFont(.headline)

            if queue.waitingCount > 0 {
                Text("Writing cards… \(queue.readyCount) of \(queue.readyCount + queue.waitingCount) ready")
                    .zoomFont(.callout)
                    .foregroundStyle(.secondary)
            }

            if let startError {
                Text(startError)
                    .zoomFont(.callout)
                    .foregroundStyle(.red)
            }
        }
        .zoomPadding(.vertical, 4)
        .onChange(of: shownSubject, initial: true) { _, shown in
            if resumed == nil, subjectId != shown { subjectId = shown }
        }
    }
}
