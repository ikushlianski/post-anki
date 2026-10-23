import Foundation
import Testing
@testable import PostAnkiAPI

@Suite("Courses and knowledge")
struct CoursesDecodingTests {
    @Test("should decode subjects with and without a description")
    func decodesSubjects() throws {
        let subjects = try Fixture.decode([Subject].self, "subjects")

        #expect(subjects.map(\.name) == ["System design", "Spanish"])
        #expect(subjects[0].description == "Distributed systems")
        #expect(subjects[1].description == nil)
    }

    @Test("should decode courses and ignore server fields the app does not use")
    func decodesCurricula() throws {
        let curricula = try Fixture.decode([Curriculum].self, "curricula")

        #expect(curricula.map(\.id) == ["cur_01", "cur_02"])
        #expect(curricula[0].status == "ready")
        #expect(curricula[1].description == nil)
    }

    @Test("should decode a course detail with its modules and topics in order")
    func decodesCurriculumDetail() throws {
        let detail = try Fixture.decode(CurriculumDetail.self, "curriculum-detail")
        let module = try #require(detail.modules.first)

        #expect(detail.curriculum.name == "Distributed systems")
        #expect(module.title == "Resilience")
        #expect(module.topics.map(\.title) == ["Circuit breakers", "Retries and backoff"])
        #expect(module.topics.allSatisfy { $0.moduleId == module.id })
    }

    @Test("should decode a knowledge page with its state, due date and more-pages flag")
    func decodesKnowledgeOverview() throws {
        let page = try Fixture.decode(KnowledgeOverviewPage.self, "knowledge-overview")

        #expect(page.hasMore)
        #expect(page.items.map(\.stateLabel) == ["Review", "Suspended"])
        #expect(page.items[0].dueAt == "2026-10-25T07:00:00.000Z")
        #expect(page.items[1].dueAt == nil)
        #expect(page.items[1].subjectId == nil)
        #expect(page.items[1].lapses == 8)
    }
}
