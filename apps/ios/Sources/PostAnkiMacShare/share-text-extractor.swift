import Foundation
import UniformTypeIdentifiers

@MainActor
enum ShareTextExtractor {
    static func text(from items: [NSExtensionItem]) async -> String {
        var parts: [String] = []

        for item in items {
            if let attributed = item.attributedContentText?.string,
               !attributed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                parts.append(attributed)
                continue
            }

            for provider in item.attachments ?? [] {
                if let value = await loadText(from: provider) {
                    parts.append(value)
                }
            }
        }

        return parts.joined(separator: "\n\n")
    }

    private static func loadText(from provider: NSItemProvider) async -> String? {
        let type = UTType.plainText.identifier

        guard provider.hasItemConformingToTypeIdentifier(type) else { return nil }

        let loaded = try? await provider.loadItem(forTypeIdentifier: type)

        if let string = loaded as? String { return string }

        if let data = loaded as? Data { return String(data: data, encoding: .utf8) }

        if let url = loaded as? URL { return try? String(contentsOf: url, encoding: .utf8) }

        return nil
    }
}
