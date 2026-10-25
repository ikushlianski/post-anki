import SwiftUI

struct BottomActionBarButton: View {
    let title: String
    var role: ButtonRole?
    var isLoading = false
    var isDisabled = false
    let action: () -> Void

    var body: some View {
        Button(role: role, action: action) {
            ZStack {
                Text(title).opacity(isLoading ? 0 : 1)

                if isLoading { ProgressView() }
            }
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 56)
        }
        .buttonStyle(.borderedProminent)
        .disabled(isDisabled || isLoading)
    }
}

extension View {
    func bottomActionBar<Bar: View>(@ViewBuilder _ bar: @escaping () -> Bar) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            HStack(spacing: 12) { bar() }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(.bar)
        }
    }
}
