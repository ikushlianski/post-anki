import SwiftUI
import UIKit

final class ShareViewController: UIViewController {
    private let model = SharePanelModel()

    override func viewDidLoad() {
        super.viewDidLoad()

        let host = UIHostingController(
            rootView: SharePanelView(
                model: model,
                onCancel: { [weak self] in self?.cancel() },
                onSave: { [weak self] in self?.save() }
            )
        )

        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)

        Task { @MainActor in
            let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
            model.text = await ShareTextExtractor.text(from: items, includeURLs: true)
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
