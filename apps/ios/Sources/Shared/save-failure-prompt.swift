import SwiftUI

struct SaveFailurePrompt: View {
    let failure: SaveFailure
    let onRetry: () -> Void
    let onSkip: () -> Void

    var body: some View {
        ZoomVStack(spacing: 16) {
            Text("This didn't save")
                .zoomFont(.title3.weight(.semibold))

            if let title = failure.title, !title.isEmpty {
                Text(title)
                    .zoomFont(.headline)
                    .multilineTextAlignment(.center)
                    .lineLimit(4)
            }

            Text(failure.message)
                .zoomFont(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            ZoomHStack(spacing: 12) {
                Button("Skip", role: .destructive, action: onSkip)
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("save-failure-skip")

                Button("Retry", action: onRetry)
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("save-failure-retry")
            }
            .controlSize(.large)
        }
        .zoomPadding()
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }
}

extension View {
    func saveFailurePrompt(_ failure: SaveFailure?, onRetry: @escaping () -> Void, onSkip: @escaping () -> Void) -> some View {
        overlay {
            if let failure {
                SaveFailurePrompt(failure: failure, onRetry: onRetry, onSkip: onSkip)
            }
        }
    }
}
