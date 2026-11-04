import Foundation

public struct ChatQueueExport: Sendable, Equatable {
    public let filename: String
    public let markdown: String

    public init(filename: String, markdown: String) {
        self.filename = filename
        self.markdown = markdown
    }
}

extension APIClient {
    static func chatQueueExportPath(subjectId: String) -> String {
        encodedPath("/knowledge-bits/chat-queue/export", query: [URLQueryItem(name: "subjectId", value: subjectId)])
    }

    static func exportFilename(header: String?, fallback: String) -> String {
        guard let header, let range = header.range(of: "filename=") else { return fallback }

        let raw = header[range.upperBound...]
            .prefix { $0 != ";" }
            .trimmingCharacters(in: CharacterSet(charactersIn: "\" "))
        let cleaned = raw.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: "\\", with: "-")

        return cleaned.isEmpty || cleaned.hasPrefix(".") ? fallback : cleaned
    }

    public static func exportChatQueueMarkdown(subjectId: String, fallbackName: String = "chat.md") async throws -> ChatQueueExport {
        let req = try makeRequest(chatQueueExportPath(subjectId: subjectId))
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: req)
        } catch {
            if !(error is CancellationError), (error as? URLError)?.code != .cancelled {
                FailureLog.shared.record(method: "GET", url: req.url, status: nil, error: error)
            }

            throw error
        }

        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0

        if status == 401 {
            FailureLog.shared.record(method: "GET", url: req.url, status: status, error: APIError.unauthorized)
            throw APIError.unauthorized
        }

        guard (200..<300).contains(status) else {
            let code = try? JSONDecoder().decode(APIErrorBody.self, from: data).error
            let failure = APIError.badStatus(status, code)
            FailureLog.shared.record(method: "GET", url: req.url, status: status, error: failure)
            throw failure
        }

        let filename = exportFilename(header: http?.value(forHTTPHeaderField: "Content-Disposition"), fallback: fallbackName)

        return ChatQueueExport(filename: filename, markdown: String(decoding: data, as: UTF8.self))
    }
}
