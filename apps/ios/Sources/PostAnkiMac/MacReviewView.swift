import SwiftUI

struct MacReviewView: View {
    private enum Mode: String, CaseIterable {
        case due = "Due today"
        case pending = "Pending items"
    }

    @State private var mode = Mode.due

    var body: some View {
        VStack(spacing: 0) {
            Picker("Review", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(maxWidth: 320)
            .padding()

            switch mode {
            case .due:
                MacDueReviewView()
            case .pending:
                PendingReviewScreen()
            }
        }
        .navigationTitle("Review")
        .task { await PendingReviewCountStore.shared.refresh() }
    }
}
