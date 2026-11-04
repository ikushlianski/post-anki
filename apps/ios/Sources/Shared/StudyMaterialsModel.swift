import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class StudyMaterialsModel {
    static let pollFailureLimit = 3

    let topicId: String
    var items: [StudyMaterial] = []
    var isRequesting = false
    var errorMessage: String?
    var timedOut = false

    private let pollInterval: Duration
    private let pollLimit: Int

    init(topicId: String, pollInterval: Duration = LectureModel.pollInterval, pollLimit: Int = LectureModel.pollLimit) {
        self.topicId = topicId
        self.pollInterval = pollInterval
        self.pollLimit = pollLimit
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
        var failures = 0
        timedOut = false

        while hasGenerating, attempts < pollLimit {
            try? await Task.sleep(for: pollInterval)

            if Task.isCancelled { return }

            attempts += 1

            do {
                items = try await APIClient.studyMaterials(topicId: topicId)
                failures = 0
            } catch {
                failures += 1

                if failures >= Self.pollFailureLimit {
                    errorMessage = LectureError.message(for: error)

                    return
                }
            }
        }

        timedOut = hasGenerating
    }
}
