import SwiftUI
import UIKit

struct TriageKeyCommands: UIViewControllerRepresentable {
    let isActive: Bool
    let onIntent: (FocusTriageKeyIntent) -> Void

    func makeUIViewController(context: Context) -> TriageKeyCommandController {
        TriageKeyCommandController()
    }

    func updateUIViewController(_ controller: TriageKeyCommandController, context: Context) {
        controller.isActive = isActive
        controller.onIntent = onIntent
        controller.claimKeyboardIfPossible()
    }
}

final class TriageKeyCommandController: UIViewController {
    var isActive = false
    var onIntent: (FocusTriageKeyIntent) -> Void = { _ in }

    override var canBecomeFirstResponder: Bool { true }

    override var keyCommands: [UIKeyCommand]? {
        FocusTriageKeyRouting.commandInputs.map { input in
            let command = UIKeyCommand(input: input, modifierFlags: [], action: #selector(handle(_:)))
            command.wantsPriorityOverSystemBehavior = false

            return command
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.isUserInteractionEnabled = false

        for name in [UITextField.textDidEndEditingNotification, UITextView.textDidEndEditingNotification] {
            NotificationCenter.default.addObserver(self, selector: #selector(textEditingEnded), name: name, object: nil)
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        claimKeyboardIfPossible()
    }

    @objc private func textEditingEnded() {
        DispatchQueue.main.async { [weak self] in self?.claimKeyboardIfPossible() }
    }

    func claimKeyboardIfPossible() {
        guard isActive, view.window != nil, !isFirstResponder, !Self.isTextInputActive(in: view.window) else { return }

        becomeFirstResponder()
    }

    @objc private func handle(_ command: UIKeyCommand) {
        guard isActive,
              !Self.isTextInputActive(in: view.window),
              let input = command.input,
              let intent = FocusTriageKeyRouting.intent(forKeyboardInput: input)
        else { return }

        onIntent(intent)
    }

    private static func isTextInputActive(in window: UIWindow?) -> Bool {
        guard let window else { return false }

        return firstResponder(in: window) is UITextInput
    }

    private static func firstResponder(in view: UIView) -> UIResponder? {
        if view.isFirstResponder { return view }

        for subview in view.subviews {
            if let found = firstResponder(in: subview) { return found }
        }

        return nil
    }
}
