import Foundation
import UniformTypeIdentifiers

@MainActor
enum ShareTextExtractor {
    static func text(from items: [NSExtensionItem], includeURLs: Bool = false) async -> String {
        var parts: [String] = []

        for item in items {
            let attributed = item.attributedContentText?.string
            let hasAttributed = attributed.map { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? false

            if hasAttributed, let attributed {
                parts.append(attributed)
            }

            for provider in item.attachments ?? [] {
                if includeURLs, let link = await loadWebURL(from: provider), !parts.contains(link) {
                    parts.append(link)
                    continue
                }

                if !hasAttributed, let value = await loadText(from: provider) {
                    parts.append(value)
                }
            }
        }

        return parts.joined(separator: "\n\n")
    }

    private static func loadWebURL(from provider: NSItemProvider) async -> String? {
        let type = UTType.url.identifier

        guard provider.hasItemConformingToTypeIdentifier(type) else { return nil }

        let loaded = try? await provider.loadItem(forTypeIdentifier: type)
        let url = (loaded as? URL) ?? (loaded as? String).flatMap(URL.init(string:))

        guard let url, !url.isFileURL else { return nil }

        return url.absoluteString
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
