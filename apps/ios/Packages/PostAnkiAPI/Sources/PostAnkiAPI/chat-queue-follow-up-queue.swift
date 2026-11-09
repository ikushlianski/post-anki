import Foundation

public enum ChatQueueFollowUpState: Sendable, Equatable {
    case queued
    case sending
    case failed
}

public struct ChatQueueFollowUp: Sendable, Equatable, Identifiable {
    public let id: String
    public let text: String
    public var state: ChatQueueFollowUpState
}

public struct ChatQueueFollowUpQueue: Sendable, Equatable {
    public static let capacity = 3

    public private(set) var items: [ChatQueueFollowUp] = []

    public init() {}

    public var isFull: Bool { items.count >= Self.capacity }
    public var isEmpty: Bool { items.isEmpty }
    public var isSending: Bool { items.contains { $0.state == .sending } }
    public var waiting: [ChatQueueFollowUp] { items.filter { $0.state != .sending } }

    @discardableResult
    public mutating func enqueue(_ text: String, id: String = UUID().uuidString) -> ChatQueueFollowUp? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmed.isEmpty, !isFull else { return nil }

        let item = ChatQueueFollowUp(id: id, text: trimmed, state: .queued)

        items.append(item)

        return item
    }

    public mutating func beginNext() -> ChatQueueFollowUp? {
        guard !isSending, let index = items.firstIndex(where: { $0.state == .queued }) else { return nil }

        items[index].state = .sending

        return items[index]
    }

    public mutating func retryFailed(id: String) -> Bool {
        guard !isSending, let index = items.firstIndex(where: { $0.id == id && $0.state == .failed }) else { return false }

        items[index].state = .queued

        return true
    }

    public mutating func complete(id: String) {
        items.removeAll { $0.id == id && $0.state == .sending }
    }

    public mutating func fail(id: String) {
        guard let index = items.firstIndex(where: { $0.id == id && $0.state == .sending }) else { return }

        items[index].state = .failed
    }

    public mutating func cancel(id: String) {
        items.removeAll { $0.id == id && $0.state != .sending }
    }

    public mutating func drainTexts() -> [String] {
        let texts = items.map(\.text)

        items.removeAll()

        return texts
    }
}
