import Foundation

public enum ChatQueueRetryDraft {
    public static func restoring(question: String, over draft: String) -> String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? question : "\(question)\n\n\(draft)"
    }
}
