import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class CoursesScreenModel {
    var subjects: [Subject] = []
    var curricula: [Curriculum] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?
    var failure: ProgressLoadError?

    func load() async {
        isLoading = true
        errorMessage = nil
        failure = nil

        do {
            async let subjectsTask = APIClient.listSubjects()
            async let curriculaTask = APIClient.listCurricula()
            subjects = try await subjectsTask
            curricula = try await curriculaTask
            hasLoaded = true
        } catch {
            errorMessage = "Couldn't load your subjects."
            failure = ProgressLoadError.from(error)
        }

        isLoading = false
    }

    var topLevelSubjects: [Subject] {
        subjects.filter { $0.parentId == nil }
    }

    func children(of subjectId: String) -> [Subject] {
        subjects.filter { $0.parentId == subjectId }
    }

    func curricula(for subjectId: String) -> [Curriculum] {
        curricula.filter { $0.subjectId == subjectId }
    }
}

@Observable
@MainActor
final class CurriculumDetailScreenModel {
    var detail: CurriculumDetail?
    var isLoading = false
    var errorMessage: String?
    var failure: ProgressLoadError?

    func load(curriculumId: String) async {
        isLoading = true
        errorMessage = nil
        failure = nil

        do {
            detail = try await APIClient.getCurriculumDetail(curriculumId)
        } catch {
            errorMessage = "Couldn't load this subject."
            failure = ProgressLoadError.from(error)
        }

        isLoading = false
    }
}
