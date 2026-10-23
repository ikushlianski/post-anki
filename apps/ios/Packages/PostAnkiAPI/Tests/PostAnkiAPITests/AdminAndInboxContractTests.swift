import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Admin and inbox server contract")
struct AdminAndInboxContractTests {
    @Test("should decode the per-model feedback totals the admin endpoint returns")
    func decodesFeedbackByModel() throws {
        let json = #"{"models":[{"modelId":"m1","approved":4,"rejected":2,"topReasons":[{"reasonCode":"meta_wording","count":2}]}]}"#
        let result = try JSONDecoder().decode(AdminFeedbackByModel.self, from: Data(json.utf8))

        #expect(result.models.first?.rejected == 2)
        #expect(result.models.first?.topReasons.first?.reasonCode == "meta_wording")
    }

    @Test("should decode a content inbox row as stored by the server")
    func decodesContentInboxRow() throws {
        let json = #"{"id":"i1","body":"text","sourceRef":"ref","suggestedPlacement":"Finance","createdAt":"2026-10-23T08:00:00.000Z"}"#
        let item = try JSONDecoder().decode(ContentInboxItem.self, from: Data(json.utf8))

        #expect(item.suggestedPlacement == "Finance")
    }

    @Test("should decode a domain map node with nested children")
    func decodesDomainMapNode() throws {
        let child = #"{"id":"d2","subjectId":"s","parentId":"d1","name":"B","description":null,"order":0,"percent":10,"targetDepth":null,"priorityDistance":null,"curricula":[],"children":[],"supersededAt":null,"supersededReason":null,"source":"ai_generated","kind":"area"}"#
        let json = #"[{"id":"d1","subjectId":"s","parentId":null,"name":"A","description":null,"order":0,"percent":50,"targetDepth":"deep","priorityDistance":1,"curricula":[{"id":"c","name":"C"}],"children":["# + child + #"],"supersededAt":null,"supersededReason":null,"source":"static_taxonomy","kind":null}]"#
        let nodes = try JSONDecoder().decode([DomainNodeItem].self, from: Data(json.utf8))

        #expect(nodes.first?.children.first?.parentId == "d1")
        #expect(nodes.first?.targetDepth == "deep")
    }
}
