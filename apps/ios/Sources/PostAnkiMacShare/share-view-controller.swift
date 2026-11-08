import AppKit
import SwiftUI

final class ShareViewController: NSViewController {
    private let model = SharePanelModel()

    override func loadView() {
        let host = NSHostingView(
            rootView: SharePanelView(
                model: model,
                onCancel: { [weak self] in self?.cancel() },
                onSave: { [weak self] in self?.save() }
            )
        )
        host.frame = NSRect(x: 0, y: 0, width: 420, height: 320)
        view = host
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        Task { @MainActor in
            let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
            model.text = await ShareTextExtractor.text(from: items)
            await model.loadSubjects()
        }
    }

    private func save() {
        Task { @MainActor in
            guard await model.save() else { return }

            try? await Task.sleep(for: .seconds(1))
            extensionContext?.completeRequest(returningItems: nil)
        }
    }

    private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
    }
}
