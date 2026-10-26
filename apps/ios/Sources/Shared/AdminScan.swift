import Foundation

struct AdminScan: Hashable, Identifiable {
    let title: String
    let path: String
    let explanation: String
    var changesData = false

    var id: String { path }

    static let all: [AdminScan] = [
        AdminScan(title: "Detect knowledge items", path: "/knowledge-sources/detect-bits", explanation: "Extracts items from new sources."),
        AdminScan(title: "Item embeddings", path: "/knowledge-bits/embedding-scan", explanation: "Embeds knowledge items."),
        AdminScan(title: "Tagging", path: "/knowledge-bits/tagging-scan", explanation: "Assigns tags to items automatically.", changesData: true),
        AdminScan(title: "Question generation", path: "/knowledge-bits/question-generation-scan", explanation: "Writes question variants."),
        AdminScan(title: "Fill-in-the-blank cards", path: "/knowledge-bits/fill-blank-generation-scan", explanation: "Writes fill-in-the-blank cards."),
        AdminScan(title: "Basic cards", path: "/knowledge-bits/basic-card-generation-scan", explanation: "Writes basic cards."),
        AdminScan(title: "Variant embeddings", path: "/knowledge-bits/question-variants/embedding-scan", explanation: "Embeds question variants."),
        AdminScan(title: "Card embeddings", path: "/cards/embedding-scan", explanation: "Embeds cards."),
        AdminScan(title: "Business-education distill", path: "/biz-education-distills", explanation: "Writes distilled facts and content-inbox rows.", changesData: true),
        AdminScan(title: "Document scan, all subjects", path: "/doc-scans", explanation: "Creates map suggestions for you to triage."),
    ]
}
