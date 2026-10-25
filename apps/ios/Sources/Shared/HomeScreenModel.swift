import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class HomeScreenModel {
    var curriculumName: String?
    var detail: CurriculumDetail?
    var isLoading = false
    var errorMessage: String?

    var topics: [Topic] {
        detail?.modules.flatMap { $0.topics } ?? []
    }

    func load() async {
        guard let curriculumId = LastStudied.curriculumId else {
            curriculumName = nil
            detail = nil
            return
        }

        curriculumName = LastStudied.curriculumName
        isLoading = true
        errorMessage = nil

        do {
            detail = try await APIClient.getCurriculumDetail(curriculumId)
        } catch {
            errorMessage = "Couldn't load your last subject."
        }

        isLoading = false
    }
}
