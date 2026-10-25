import Foundation
import PostAnkiAPI

enum DueReviewScope: Equatable, Hashable, Sendable {
    case subject(id: String, name: String)
    case tag(id: String, name: String)
    case topic(id: String, title: String)
    case card(knowledgeBitId: String, title: String)

    init(subject: Subject) {
        self = .subject(id: subject.id, name: subject.name)
    }

    init(tag: Tag) {
        self = .tag(id: tag.id, name: tag.name)
    }

    init(topic: Topic) {
        self = .topic(id: topic.id, title: topic.title)
    }

    var title: String {
        switch self {
        case .subject(_, let name), .tag(_, let name): name
        case .topic(_, let title), .card(_, let title): title
        }
    }

    var subjectId: String? {
        if case .subject(let id, _) = self { id } else { nil }
    }

    var tagId: String? {
        if case .tag(let id, _) = self { id } else { nil }
    }

    var topicId: String? {
        if case .topic(let id, _) = self { id } else { nil }
    }

    var knowledgeBitId: String? {
        if case .card(let id, _) = self { id } else { nil }
    }
}
