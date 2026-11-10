import PostAnkiAPI
import SwiftUI

struct DueReviewEmptyView: View {
    let model: DueReviewModel
    @Environment(\.dismiss) private var dismiss

    private var message: String {
        if model.dailyLimit != nil { return "Done for today." }

        if let iso = model.nextDueAt {
            if let relative = DueReviewModel.nextDueText(iso) {
                return "Done for today. Next card due \(relative)."
            }

            return "Done for today."
        }

        if model.noCardsYet {
            return "No cards to review yet. Approve suggested questions or add knowledge."
        }

        return "No more cards are scheduled."
    }

    var body: some View {
        ZoomVStack(spacing: 12) {
            if model.isServingPack {
                Text(DueReviewModel.packFinishedMessage)
                    .multilineTextAlignment(.center)
            } else if model.isOffline {
                Text("Couldn't connect to the server. Your grades are saved and will send when it's reachable.")
                    .multilineTextAlignment(.center)
            } else {
                Text(message)
                    .multilineTextAlignment(.center)
            }

            if let limit = model.dailyLimit {
                dailyLimitControls(limit)
            }

            if let notice = model.notice {
                Text(notice)
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let error = model.gradeError {
                Text(error)
                    .zoomFont(.footnote)
                    .foregroundStyle(.red)
            }

            if model.reviewedCount > 0 {
                Text("\(model.reviewedCount) reviewed this session")
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
            }

        }
        .zoomPadding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func dailyLimitControls(_ limit: DailyReviewLimit) -> some View {
        ZoomVStack(spacing: 8) {
            Text(limit.message)
                .zoomFont(.footnote)
                .foregroundStyle(.secondary)

            Text("Review ahead")
                .zoomFont(.footnote)

            HStack {
                ForEach(DailyReviewLimit.aheadChoices, id: \.self) { days in
                    Button(DailyReviewLimit.aheadTitle(days)) { Task { await model.reviewAhead(days: days) } }
                        .buttonStyle(.bordered)
                }
            }

            Button("Back to subjects") { dismiss() }
                .buttonStyle(.borderedProminent)
        }
    }
}

struct DueReviewMessageView: View {
    let message: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        ZoomVStack(spacing: 12) {
            Text(message)
                .multilineTextAlignment(.center)

            Button(actionTitle, action: action)
                .buttonStyle(.borderedProminent)
        }
        .zoomPadding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
