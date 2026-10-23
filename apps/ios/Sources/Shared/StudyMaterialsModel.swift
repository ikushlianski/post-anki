import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class StudyMaterialsModel {
    let topicId: String
    var items: [StudyMaterial] = []
    var isRequesting = false
    var errorMessage: String?

    init(topicId: String) {
        self.topicId = topicId
    }

    var hasGenerating: Bool {
        items.contains { $0.status == "generating" }
    }

    func load() async {
        do {
            items = try await APIClient.studyMaterials(topicId: topicId)
        } catch {
            errorMessage = LectureError.message(for: error)
        }

        await poll()
    }

    func request(kind: String) async {
        guard !isRequesting else { return }

        isRequesting = true
        errorMessage = nil

        do {
            let created = try await APIClient.requestStudyMaterial(topicId: topicId, kind: kind)
            items.insert(created, at: 0)
        } catch {
            errorMessage = LectureError.message(for: error)
        }

        isRequesting = false
        await poll()
    }

    private func poll() async {
        var attempts = 0

        while hasGenerating, attempts < LectureModel.pollLimit {
            try? await Task.sleep(for: LectureModel.pollInterval)

            if Task.isCancelled { return }

            attempts += 1

            if let fresh = try? await APIClient.studyMaterials(topicId: topicId) {
                items = fresh
            }
        }
    }
}
