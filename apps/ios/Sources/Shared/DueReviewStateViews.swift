import PostAnkiAPI
import SwiftUI

struct DueReviewEmptyView: View {
    let model: DueReviewModel

    private var message: String {
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
        VStack(spacing: 12) {
            if model.isOffline {
                Text("You're offline. Your grades are saved and will send when you're back online.")
                    .multilineTextAlignment(.center)
            } else {
                Text(message)
                    .multilineTextAlignment(.center)
            }

            if let notice = model.notice {
                Text(notice)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let error = model.gradeError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            if model.reviewedCount > 0 {
                Text("\(model.reviewedCount) reviewed this session")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            DueReviewPendingCaption(count: model.pendingCount)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct DueReviewPendingCaption: View {
    let count: Int

    var body: some View {
        if count > 0 {
            Text(count == 1 ? "1 grade waiting to send" : "\(count) grades waiting to send")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

struct DueReviewMessageView: View {
    let message: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text(message)
                .multilineTextAlignment(.center)

            Button(actionTitle, action: action)
                .buttonStyle(.borderedProminent)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
