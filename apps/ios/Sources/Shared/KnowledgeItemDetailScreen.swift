import PostAnkiAPI
import SwiftUI

struct KnowledgeItemDetailScreen: View {
    let item: KnowledgeOverviewItem
    let subjectName: String?
    let onStateChange: (String) -> Void

    @State private var state: String
    @State private var isBusy = false
    @State private var message: String?

    init(item: KnowledgeOverviewItem, subjectName: String?, onStateChange: @escaping (String) -> Void) {
        self.item = item
        self.subjectName = subjectName
        self.onStateChange = onStateChange
        _state = State(initialValue: item.state)
    }

    private var isSuspended: Bool { state == "suspended" }
    private var isBuried: Bool { state == "buried" }

    private var actionTitle: String {
        if isSuspended { return "Unsuspend" }

        return isBuried ? "Bring back today" : "Suspend"
    }

    var body: some View {
        List {
            Section("Question") { Text(item.question) }
            Section("Answer") { Text(item.answer) }

            Section {
                LabeledContent("Status", value: KnowledgeOverviewItem.label(for: state))

                if let subjectName { LabeledContent("Subject", value: subjectName) }

                if let due = item.dueAt.flatMap({ DueReviewModel.nextDueText($0) }) {
                    LabeledContent("Due", value: due)
                }

                if item.lapses > 0 { LabeledContent("Lapses", value: String(item.lapses)) }
            }

            Section {
                Button(actionTitle) { Task { await toggle() } }
                    .disabled(isBusy)

                if let message {
                    Text(message).font(.caption).foregroundStyle(.red)
                }
            } footer: {
                Text("To change the wording, edit it while reviewing it.")
            }

            MoreVariantsSection(bitId: item.id)
        }
        .navigationTitle("Item")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func toggle() async {
        guard !isBusy else { return }

        isBusy = true
        message = nil
        defer { isBusy = false }

        do {
            let result: ScheduleControlResult

            if isSuspended {
                result = try await APIClient.setSchedule(id: item.id, suspended: false, buried: nil)
            } else if isBuried {
                result = try await APIClient.setSchedule(id: item.id, suspended: nil, buried: false)
            } else {
                result = try await APIClient.setSchedule(id: item.id, suspended: true, buried: nil)
            }

            if result.suspended {
                state = "suspended"
            } else if result.buriedUntil != nil {
                state = "buried"
            } else {
                state = item.state == "suspended" || item.state == "buried" ? "active" : item.state
            }

            onStateChange(state)
        } catch {
            message = KnowledgeManageError.message(for: error, action: "update this item")
        }
    }
}

extension KnowledgeOverviewItem {
    static func label(for state: String) -> String {
        KnowledgeOverviewItem(
            knowledgeBitId: "", question: "", answer: "", subjectId: nil, state: state, dueAt: nil, lapses: 0
        ).stateLabel
    }
}
