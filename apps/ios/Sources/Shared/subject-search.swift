import SwiftUI

enum SubjectSearch {
    static func filter(_ options: [SubjectPathOption], query: String) -> [SubjectPathOption] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !needle.isEmpty else { return options }

        return options.filter { leafName(of: $0).localizedCaseInsensitiveContains(needle) }
    }

    static func onlyMatch(_ options: [SubjectPathOption], query: String) -> SubjectPathOption? {
        let matches = filter(options, query: query)

        return matches.count == 1 ? matches.first : nil
    }

    static func displayLabel(_ option: SubjectPathOption) -> String {
        option.label.replacingOccurrences(of: SubjectTreePath.separator, with: " › ")
    }

    private static func leafName(of option: SubjectPathOption) -> String {
        option.label.components(separatedBy: SubjectTreePath.separator).last ?? option.label
    }
}

struct SubjectSearchField: View {
    @Binding var text: String
    let onSubmit: () -> Void
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("Search subjects", text: $text)
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .focused($isFocused)
                .onSubmit(onSubmit)
                .accessibilityIdentifier("subject-search-field")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .padding(.horizontal)
        .padding(.vertical, 6)
        .task {
            try? await Task.sleep(for: .milliseconds(350))
            isFocused = true
        }
    }
}
