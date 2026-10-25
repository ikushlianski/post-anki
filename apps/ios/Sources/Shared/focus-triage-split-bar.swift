import SwiftUI

struct FocusTriageBarAction {
    let title: String
    var isLoading = false
    var isProminent = false
    let isDisabled: Bool
    let action: () -> Void
}

struct FocusTriageSplitBar: View {
    let leading: FocusTriageBarAction
    let trailing: FocusTriageBarAction

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            HStack(spacing: 0) {
                tile(leading)
                Divider()
                tile(trailing)
            }
            .frame(height: 56)
        }
        .background(.bar)
    }

    private func tile(_ item: FocusTriageBarAction) -> some View {
        Button(action: item.action) {
            HStack(spacing: 6) {
                if item.isLoading { ProgressView() }

                Text(item.title)
                    .zoomFont(.headline)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .foregroundStyle(item.isProminent ? Color.accentColor : Color.primary)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(item.isDisabled)
        .opacity(item.isDisabled ? 0.4 : 1)
        .accessibilityLabel(item.title)
    }
}
