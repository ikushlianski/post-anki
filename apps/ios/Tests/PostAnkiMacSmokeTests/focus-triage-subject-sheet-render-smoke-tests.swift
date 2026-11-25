import AppKit
import Foundation
import SwiftUI
import Testing

extension SmokeTests {
    @MainActor
    @Suite("Triage subject sheet loads the subject list the owner can pick from")
    struct FocusTriageSubjectSheetRenderSmokeTests {
        private static let subjects = #"[{"id":"s_a","name":"Physics","description":null,"parentId":null},{"id":"s_b","name":"Optics","description":null,"parentId":"s_a"},{"id":"s_c","name":"Chemistry","description":null,"parentId":null}]"#

        @Test("should load subjects into the tree once the sheet is shown")
        func loadsSubjectsWhenShown() async throws {
            let session = FakeServerSession(["/subjects": .json(200, Self.subjects)])
            defer { session.end() }
            let model = FocusTriageSubjectChangeModel(bitId: "kb_1")
            let host = NSHostingView(rootView: FocusTriageSubjectSheet(model: model, currentId: "s_c", onPicked: { _, _ in }))
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 520), styleMask: [.titled], backing: .buffered, defer: false)
            window.contentView = host
            window.orderFront(nil)

            for _ in 0..<30 where model.loadState != .loaded {
                try await Task.sleep(nanoseconds: 100_000_000)
            }

            window.orderOut(nil)

            #expect(model.loadState == .loaded)
            #expect(model.tree.map(\.entry.name) == ["Chemistry", "Physics"])
        }
    }
}
