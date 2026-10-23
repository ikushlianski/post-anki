import Foundation
import PostAnkiAPI

struct PendingAnswer: Codable, Sendable, Equatable {
    let variantId: String
    let userAnswer: String
    let createdAt: Date
    var serverURL: String?
    var failedAttempts: Int?
}

actor PendingAnswerQueue {
    static let shared = PendingAnswerQueue()

    static let maxFailedAttempts = 5

    private var isFlushing = false

    private let fileURLOverride: URL?

    init(fileURL: URL? = nil) {
        fileURLOverride = fileURL
    }

    private var fileURL: URL? {
        if let fileURLOverride { return fileURLOverride }

        return try? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("pending-answers.json")
    }

    @discardableResult
    func enqueue(variantId: String, userAnswer: String) -> Bool {
        var answers = load().filter { $0.variantId != variantId }
        answers.append(
            PendingAnswer(
                variantId: variantId,
                userAnswer: userAnswer,
                createdAt: Date(),
                serverURL: ServerScope.current,
                failedAttempts: nil
            )
        )

        return save(answers)
    }

    func flush() async {
        guard !isFlushing else {
            return
        }

        isFlushing = true
        defer { isFlushing = false }

        for answer in load() where ServerScope.matches(answer.serverURL) {
            do {
                _ = try await APIClient.gradeAnswer(
                    variantId: answer.variantId,
                    userAnswer: answer.userAnswer
                )

                remove(answer)
            } catch {
                guard PendingGradeQueue.shouldKeep(error) else {
                    remove(answer)
                    continue
                }

                guard case APIError.badStatus(let status, _) = error, status >= 500 else {
                    return
                }

                recordFailure(answer)
            }
        }
    }

    func count() -> Int {
        load().filter { ServerScope.matches($0.serverURL) }.count
    }

    private func recordFailure(_ answer: PendingAnswer) {
        let attempts = (answer.failedAttempts ?? 0) + 1

        guard attempts < Self.maxFailedAttempts else {
            remove(answer)

            return
        }

        var updated = answer
        updated.failedAttempts = attempts

        save(load().map { $0.variantId == answer.variantId ? updated : $0 })
    }

    private func load() -> [PendingAnswer] {
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else {
            return []
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        guard let answers = try? decoder.decode([PendingAnswer].self, from: data) else {
            quarantine(fileURL)

            return []
        }

        return answers
    }

    private func quarantine(_ fileURL: URL) {
        let name = "\(fileURL.deletingPathExtension().lastPathComponent).unreadable-\(Int(Date().timeIntervalSince1970)).json"

        try? FileManager.default.moveItem(at: fileURL, to: fileURL.deletingLastPathComponent().appendingPathComponent(name))
    }

    private func remove(_ answer: PendingAnswer) {
        save(load().filter { $0.variantId != answer.variantId })
    }

    @discardableResult
    private func save(_ answers: [PendingAnswer]) -> Bool {
        guard let fileURL else {
            return false
        }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        guard let data = try? encoder.encode(answers) else {
            return false
        }

        return (try? data.write(to: fileURL, options: .atomic)) != nil
    }
}
