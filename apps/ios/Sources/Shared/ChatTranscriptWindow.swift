import PostAnkiAPI

extension Array where Element == ChatTranscriptEntry {
    static let recentTurnLimit = 12

    var recentTurns: [ChatTranscriptEntry] {
        Array(suffix(Self.recentTurnLimit))
    }
}
