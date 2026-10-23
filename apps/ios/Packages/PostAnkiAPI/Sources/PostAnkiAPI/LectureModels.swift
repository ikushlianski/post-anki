import Foundation

public struct LectureSection: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let order: Int
    public let heading: String
    public let body: String
}

public struct LectureCitation: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let url: String
}

public struct Lecture: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let status: String
    public let sections: [LectureSection]
    public let citations: [LectureCitation]
}

public struct LectureSourceCandidate: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let url: String
    public let whySelected: String
    public var reviewStatus: String
}

public struct ReviewLectureSourceInput: Encodable, Sendable {
    public let reviewStatus: String
}

public struct StudyMaterialCitation: Decodable, Sendable, Hashable {
    public let title: String
    public let url: String
}

public struct StudyMaterial: Decodable, Sendable, Hashable, Identifiable {
    public let id: String
    public let kind: String
    public let status: String
    public let body: String?
    public let citations: [StudyMaterialCitation]
    public let failureReason: String?
}

public struct RequestStudyMaterialInput: Encodable, Sendable {
    public let kind: String
}

public enum LectureError: Sendable {
    public static func isNotFound(_ error: Error) -> Bool {
        if case APIError.badStatus(404, _) = error { return true }

        return false
    }

    public static func isNoSources(_ error: Error) -> Bool {
        if case APIError.badStatus(400, let code) = error { return code == "no_approved_sources" }

        return false
    }

    public static func message(for error: Error) -> String {
        StudyToolsError.message(for: error, notFound: "This topic was removed.")
    }
}

public enum LectureMarkdown: Sendable {
    public static func text(_ source: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)

        guard var text = try? AttributedString(markdown: source, options: options) else {
            return AttributedString(source)
        }

        for run in text.runs {
            if let link = run.link, WebLink.url(from: link.absoluteString) == nil {
                text[run.range].link = nil
            }
        }

        return text
    }
}
