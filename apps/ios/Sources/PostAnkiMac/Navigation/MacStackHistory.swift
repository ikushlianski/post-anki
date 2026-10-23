import SwiftUI

@MainActor
protocol MacHistoryControls: AnyObject {
    var canGoBack: Bool { get }
    var canGoForward: Bool { get }
    func goBack()
    func goForward()
    func clear()
}

@MainActor
@Observable
final class MacStackHistory<Element: Hashable>: MacHistoryControls {
    private(set) var path: [Element] = []
    private(set) var forward: [Element] = []

    var canGoBack: Bool { !path.isEmpty }
    var canGoForward: Bool { !forward.isEmpty }

    var pathBinding: Binding<[Element]> {
        Binding(get: { self.path }, set: { self.setPath($0) })
    }

    func setPath(_ newPath: [Element]) {
        if newPath.count < path.count, newPath == Array(path.prefix(newPath.count)) {
            forward.append(contentsOf: path.suffix(from: newPath.count).reversed())
        } else {
            forward.removeAll()
        }

        path = newPath
    }

    func open(_ element: Element) {
        setPath([element])
    }

    func push(_ element: Element) {
        setPath(path + [element])
    }

    func goBack() {
        guard let last = path.last else { return }

        path.removeLast()
        forward.append(last)
    }

    func clear() {
        path = []
        forward = []
    }

    func goForward() {
        guard let next = forward.popLast() else { return }

        path.append(next)
    }
}

@MainActor
@Observable
final class MacHistoryCenter {
    static let shared = MacHistoryCenter()

    private(set) var revision = 0

    @ObservationIgnored private var stacks: [String: any MacHistoryControls] = [:]

    func stack<Element: Hashable>(for entryID: String, of type: Element.Type) -> MacStackHistory<Element> {
        if let existing = stacks[entryID] as? MacStackHistory<Element> {
            return existing
        }

        let created = MacStackHistory<Element>()
        stacks[entryID] = created
        Task { @MainActor in self.revision += 1 }

        return created
    }

    func reset() {
        for stack in stacks.values {
            stack.clear()
        }

        revision += 1
    }

    func controls(for entryID: String) -> (any MacHistoryControls)? {
        _ = revision

        return stacks[entryID]
    }
}
