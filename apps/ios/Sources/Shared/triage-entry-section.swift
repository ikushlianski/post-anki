import PostAnkiAPI
import SwiftUI

#if os(iOS)
struct TriageEntrySection: View {
    let stored: FocusTriageStoredSession?
    let subjects: TriageSubjectsModel
    let sources: [PendingReviewSource]
    let isStarting: Bool
    let startError: String?
    let onResume: () -> Void
    let onPick: (String?) -> Void

    private var resumeTitle: String {
        TriageEntryChoice.resumeTitle(
            stored: stored,
            subjectName: TriageEntryChoice.subjectName(stored: stored, rows: subjects.rows, sources: sources)
        )
    }

    var body: some View {
        let primary = TriageEntryChoice.primary(stored: stored)

        Section {
            if primary == .resume {
                Button(resumeTitle, action: onResume)
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                    .disabled(isStarting)
            }

            triageAllButton(primary)
        }

        TriageSubjectsSection(
            model: subjects,
            isStarting: isStarting,
            startError: startError,
            showsTriageAll: false,
            onPick: { onPick($0) },
            onTriageAll: { onPick(nil) }
        )
    }

    @ViewBuilder
    private func triageAllButton(_ primary: TriageEntryChoice.Primary) -> some View {
        let button = Button(TriageSubjectsText.triageAll(subjects.totalPending)) { onPick(nil) }
            .frame(maxWidth: .infinity)
            .disabled(isStarting)

        if primary == .triageAll {
            button.buttonStyle(.borderedProminent)
        } else {
            button.buttonStyle(.bordered)
        }
    }
}
#endif
