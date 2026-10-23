import Foundation
import PostAnkiAPI

enum VariantCache {
    static func load(topicId: String, in directory: URL? = nil) -> [NextQuestionVariant] {
        guard let url = fileURL(topicId: topicId, in: directory),
              let data = try? Data(contentsOf: url),
              let variants = try? JSONDecoder().decode([NextQuestionVariant].self, from: data)
        else {
            return []
        }

        return variants
    }

    static func save(_ variants: [NextQuestionVariant], topicId: String, in directory: URL? = nil) {
        guard let url = fileURL(topicId: topicId, in: directory),
              let data = try? JSONEncoder().encode(variants)
        else {
            return
        }

        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try? data.write(to: url, options: .atomic)
    }

    private static func fileURL(topicId: String, in directory: URL?) -> URL? {
        let safeName = topicId.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""

        let serverName = ServerScope.current.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""

        guard !safeName.isEmpty, !serverName.isEmpty,
              let base = directory ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        else {
            return nil
        }

        return base
            .appendingPathComponent("VariantCache", isDirectory: true)
            .appendingPathComponent(serverName, isDirectory: true)
            .appendingPathComponent("\(safeName).json")
    }
}
