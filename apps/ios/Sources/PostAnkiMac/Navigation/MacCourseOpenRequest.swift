import Observation
import PostAnkiAPI

@MainActor
@Observable
final class MacCourseOpenRequest {
    static let shared = MacCourseOpenRequest()

    var curriculum: Curriculum?

    func take() -> Curriculum? {
        defer { curriculum = nil }

        return curriculum
    }
}
