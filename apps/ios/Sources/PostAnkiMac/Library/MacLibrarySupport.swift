import SwiftUI

func runConcurrently<Item: Sendable>(
    _ items: [Item],
    limit: Int = 4,
    _ operation: @escaping @MainActor @Sendable (Item) async -> Void
) async {
    await withTaskGroup(of: Void.self) { group in
        var iterator = items.makeIterator()

        for _ in 0..<max(1, limit) {
            guard let item = iterator.next() else { break }

            group.addTask { await operation(item) }
        }

        while await group.next() != nil {
            guard let item = iterator.next() else { continue }

            group.addTask { await operation(item) }
        }
    }
}

struct MacLibraryErrorBanner: View {
    let message: String?

    var body: some View {
        if let message {
            Text(message)
                .font(.caption)
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(.bar)
        }
    }
}

struct MacReloadButton: View {
    let isDisabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Reload", systemImage: "arrow.clockwise")
        }
        .keyboardShortcut("r", modifiers: .command)
        .disabled(isDisabled)
    }
}
