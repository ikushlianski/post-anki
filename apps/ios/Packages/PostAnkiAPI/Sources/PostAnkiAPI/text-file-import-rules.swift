import Foundation

public enum TextFileImportRules {
    public static let maxBytes = 900_000

    public static func problem(fileName: String, byteCount: Int) -> String? {
        if !fileName.lowercased().hasSuffix(".txt") { return "Only .txt files can be imported." }

        if byteCount == 0 { return "The file is empty." }

        if byteCount > maxBytes { return "The file is too large (limit 900 KB)." }

        return nil
    }

    public static func message(for error: Error) -> String {
        guard case APIError.badStatus(_, let code?) = error, let known = refusals[code] else {
            return AddSendFailure.message(for: error)
        }

        return known
    }

    public static func startedText(_ result: TextFileImportResult) -> String {
        switch result {
        case .anki(_, let parsed, _, _): "Found \(parsed) notes. Import started."
        case .source(let created): created ? "File added. Suggestions will appear in review." : "This file was already added."
        }
    }

    private static let refusals: [String: String] = [
        "empty_file": "The file is empty.",
        "not_text": "This does not look like a plain text file.",
        "file_too_large": "The file is too large to upload.",
        "text_too_long": "The text is too long to add as one source. Split it into smaller files.",
        "no_notes": "No notes were found in this Anki export.",
        "too_many_notes": "This Anki export has too many notes for one import.",
        "unmapped_deck": "Some notes belong to decks the import does not know yet.",
        "invalid_notes": "Some notes in this Anki export are too long or malformed.",
        "subject_required": "Choose a subject for this file.",
        "import_not_started": "The notes were saved but the import could not start. Upload the file again to retry.",
    ]
}
