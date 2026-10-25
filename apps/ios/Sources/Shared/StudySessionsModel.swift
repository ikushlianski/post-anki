import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class StudySessionsModel {
    var sessions: [StudySessionListItem] = []
    var consistency: StudySessionConsistency?
    var courseNames: [String: String] = [:]
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failureKind: ProgressLoadError?

    var upcoming: [StudySessionListItem] {
        sessions.filter { $0.status == "planned" && !$0.missed }.sorted {
            (StudySessionDates.parse($0.scheduledFor) ?? .distantFuture)
                < (StudySessionDates.parse($1.scheduledFor) ?? .distantFuture)
        }
    }

    var inProgress: [StudySessionListItem] {
        sessions.filter { $0.status == "in_progress" }
    }

    var missed: [StudySessionListItem] {
        sessions.filter { $0.status == "planned" && $0.missed }
    }

    var done: [StudySessionListItem] {
        sessions.filter { $0.status == "completed" || $0.status == "abandoned" }
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        failureKind = nil

        do {
            async let list = APIClient.studySessions()
            async let rate = APIClient.studySessionConsistency()
            async let courses = APIClient.listCurricula()
            sessions = try await list
            consistency = try await rate
            courseNames = Dictionary(
                (try await courses).map { ($0.id, $0.name) },
                uniquingKeysWith: { first, _ in first }
            )
            hasLoaded = true
        } catch where ProgressLoadError.from(error) == nil {
            isLoading = false

            return
        } catch {
            errorMessage = StudyToolsError.message(for: error)
            failureKind = ProgressLoadError.from(error) ?? .other
        }

        isLoading = false
    }

    func targetLabel(type: String?, id: String?) -> String {
        switch type {
        case nil: "Anything"
        case "curriculum"?: id.flatMap { courseNames[$0] } ?? "Subject"
        case "learning_path"?: "Learning path"
        default: "Area"
        }
    }
}
