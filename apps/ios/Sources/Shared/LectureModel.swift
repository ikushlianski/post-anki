import PostAnkiAPI
import SwiftUI

@Observable
@MainActor
final class LectureModel {
    static let pollInterval: Duration = .seconds(2)
    static let pollLimit = 150

    let topicId: String
    var lecture: Lecture?
    var sources: [LectureSourceCandidate] = []
    var needsSources = false
    var isLoading = false
    var isCompiling = false
    var isFindingSources = false
    var hasLoaded = false
    var findReturnedNothing = false
    var timedOut = false
    var errorMessage: String?
    var sourceError: String?

    init(topicId: String) {
        self.topicId = topicId
    }

    var isGenerating: Bool {
        isCompiling || lecture?.status == "generating"
    }

    var hasApprovedSource: Bool {
        sources.contains { $0.reviewStatus == "approved" }
    }

    func load() async {
        isLoading = true
        errorMessage = nil

        do {
            lecture = try await APIClient.lecture(topicId: topicId)
        } catch {
            if LectureError.isNotFound(error) {
                lecture = nil
            } else {
                errorMessage = LectureError.message(for: error)
            }
        }

        if errorMessage == nil, lecture == nil || lecture?.status == "failed" || needsSources {
            await loadSources()
        }

        hasLoaded = true
        isLoading = false

        if lecture?.status == "generating" {
            await poll()
        }
    }

    private func loadSources() async {
        if let fetched = try? await APIClient.lectureSources(topicId: topicId) {
            sources = fetched
        }
    }

    func compile() async {
        guard !isGenerating else { return }

        isCompiling = true
        errorMessage = nil
        timedOut = false

        do {
            lecture = try await APIClient.compileLecture(topicId: topicId)
            needsSources = false
            isCompiling = false
            await poll()
        } catch {
            if LectureError.isNoSources(error) {
                needsSources = true
                await loadSources()
            } else {
                errorMessage = LectureError.message(for: error)
            }

            isCompiling = false
        }
    }

    private func poll() async {
        var attempts = 0

        while lecture?.status == "generating", attempts < Self.pollLimit {
            try? await Task.sleep(for: Self.pollInterval)

            if Task.isCancelled { return }

            attempts += 1

            if let fresh = try? await APIClient.lecture(topicId: topicId) {
                lecture = fresh
            }
        }

        timedOut = lecture?.status == "generating"
    }

    func findSources() async {
        guard !isFindingSources else { return }

        isFindingSources = true
        sourceError = nil
        findReturnedNothing = false

        do {
            sources = try await APIClient.findLectureSources(topicId: topicId)
            findReturnedNothing = sources.isEmpty
        } catch {
            sourceError = LectureError.message(for: error)
        }

        isFindingSources = false
    }

    func review(_ source: LectureSourceCandidate, approve: Bool) async {
        sourceError = nil

        do {
            let updated = try await APIClient.reviewLectureSource(
                id: source.id,
                status: approve ? "approved" : "rejected"
            )

            if let index = sources.firstIndex(where: { $0.id == updated.id }) {
                sources[index] = updated
            }
        } catch {
            sourceError = LectureError.message(for: error)
        }
    }
}
