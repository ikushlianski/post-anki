import PostAnkiAPI

struct FocusTriageQueue {
    let current: PendingReviewBit?
    let currentSource: PendingReviewSource?
    let readyCount: Int
    let waitingCount: Int

    static func build(sources: [PendingReviewSource], pinnedBitId: String?, subjectId: String? = nil) -> FocusTriageQueue {
        let sources = FocusTriageSubject.filter(sources, subjectId: subjectId)
        let ready = sources.flatMap { source in
            source.bits.filter { !$0.variants.isEmpty }.map { (source, $0) }
        }
        let waiting = sources.reduce(0) { $0 + $1.bits.filter { $0.variants.isEmpty }.count }
        let pinned = pinnedBitId.flatMap { id in ready.first { $0.1.id == id } }
        let chosen = pinned ?? ready.first

        return FocusTriageQueue(
            current: chosen?.1,
            currentSource: chosen?.0,
            readyCount: ready.count,
            waitingCount: waiting
        )
    }
}
