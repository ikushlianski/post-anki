#if DEBUG
import Foundation
import PostAnkiAPI

enum PreviewSampleData {
    static let subjects: [Subject] = decode("""
    [
      {"id": "s-swift", "name": "Swift", "description": null, "parentId": null},
      {"id": "s-bio", "name": "Biology", "description": null, "parentId": null}
    ]
    """)

    static let treeSubjects: [Subject] = decode("""
    [
      {"id": "s-swift", "name": "Swift", "description": null, "parentId": null},
      {"id": "s-conc", "name": "Concurrency", "description": null, "parentId": "s-swift"},
      {"id": "s-actors", "name": "Actors", "description": null, "parentId": "s-conc"},
      {"id": "s-bio", "name": "Biology", "description": null, "parentId": null}
    ]
    """)

    static let pendingSources: [PendingReviewSource] = [
        PendingReviewSource(
            knowledgeSourceId: "src-1",
            sourceText: "Swift concurrency uses actors to protect mutable state. An actor processes one message at a time.",
            subjectName: "Swift",
            bits: [pendingBit(id: "bit-1"), pendingBit(id: "bit-2", body: "Mitochondria produce most of a cell's ATP.")],
            subjectId: "s-swift"
        )
    ]

    static var pendingBit: PendingReviewBit { pendingSources[0].bits[0] }

    static let reviewCard = ReviewCard(
        variantId: "v-1",
        knowledgeBitId: "bit-1",
        kind: "wh_question",
        prompt: "What does an actor guarantee about access to its mutable state?",
        answer: "Only one task touches the state at a time.",
        background: "Actors serialize access through their executor.",
        phase: "review",
        leech: false,
        intervalPreview: decode(#"{"again": 1, "hard": 2, "good": 4, "easy": 7}"#)
    )

    static let knowledgeItems: [KnowledgeOverviewItem] = [
        KnowledgeOverviewItem(
            knowledgeBitId: "k-1",
            question: "What does an actor guarantee about its mutable state?",
            answer: "Only one task touches it at a time.",
            subjectId: "s-swift",
            state: "review",
            dueAt: nil,
            lapses: 0
        ),
        KnowledgeOverviewItem(
            knowledgeBitId: "k-2",
            question: "Which organelle produces most of a cell's ATP?",
            answer: "The mitochondrion.",
            subjectId: "s-bio",
            state: "learning",
            dueAt: nil,
            lapses: 2
        )
    ]

    static func pendingBit(id: String, body: String = "An actor processes one message at a time.") -> PendingReviewBit {
        decode("""
        {
          "id": "\(id)",
          "body": "\(body)",
          "background": "Short context that explains where the fact fits.",
          "origin": "pasted text",
          "variants": [
            {"id": "\(id)-v1", "kind": "wh_question", "prompt": "How many messages does an actor process at once?", "answer": "One."},
            {"id": "\(id)-v2", "kind": "fill_in_the_blank", "prompt": "An actor processes ___ message at a time.", "answer": "one"}
          ]
        }
        """)
    }

    private static func decode<T: Decodable>(_ json: String) -> T {
        do {
            return try JSONDecoder().decode(T.self, from: Data(json.utf8))
        } catch {
            preconditionFailure("Invalid preview sample: \(error)")
        }
    }
}
#endif
