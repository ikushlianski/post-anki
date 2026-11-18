#if os(macOS)
import AppKit
import SwiftUI

struct ChatQueueSelectableText: NSViewRepresentable {
    let text: String
    let pointSize: CGFloat
    let onMakeCards: (String) -> Void
    var onCopyReply: (() -> Void)?

    func makeNSView(context: Context) -> ChatQueueTextView {
        let view = ChatQueueTextView()

        view.isEditable = false
        view.isSelectable = true
        view.drawsBackground = false
        view.textContainerInset = .zero
        view.textContainer?.lineFragmentPadding = 0
        view.textContainer?.widthTracksTextView = true
        view.isVerticallyResizable = false
        view.isHorizontallyResizable = false
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)

        return view
    }

    func updateNSView(_ view: ChatQueueTextView, context: Context) {
        view.onMakeCards = onMakeCards
        view.onCopyReply = onCopyReply

        let font = NSFont.systemFont(ofSize: pointSize)

        if view.string != text || view.font != font {
            view.textStorage?.setAttributedString(NSAttributedString(
                string: text,
                attributes: [.font: font, .foregroundColor: NSColor.labelColor]
            ))
            view.invalidateIntrinsicContentSize()
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView view: ChatQueueTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 10_000

        guard let container = view.textContainer, let layout = view.layoutManager else { return nil }

        container.containerSize = NSSize(width: width, height: .greatestFiniteMagnitude)
        layout.ensureLayout(for: container)

        let used = layout.usedRect(for: container)

        return CGSize(width: min(width, ceil(used.width)), height: ceil(used.height))
    }
}

final class ChatQueueTextView: NSTextView {
    var onMakeCards: ((String) -> Void)?
    var onCopyReply: (() -> Void)?

    override func menu(for event: NSEvent) -> NSMenu? {
        let menu = super.menu(for: event) ?? NSMenu()

        if selectedText != nil {
            let item = NSMenuItem(title: "Make cards", action: #selector(makeCards), keyEquivalent: "")

            item.target = self
            item.setAccessibilityIdentifier("chat-queue-make-cards-menu")
            menu.insertItem(item, at: 0)
            menu.insertItem(.separator(), at: 1)
        }

        if onCopyReply != nil {
            let copy = NSMenuItem(title: "Copy reply", action: #selector(copyReply), keyEquivalent: "")

            copy.target = self
            copy.setAccessibilityIdentifier("chat-queue-copy-reply-menu")
            menu.addItem(.separator())
            menu.addItem(copy)
        }

        return menu
    }

    private var selectedText: String? {
        let range = selectedRange()

        guard range.length > 0, let text = Range(range, in: string).map({ String(string[$0]) }),
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }

        return text
    }

    @objc private func copyReply() {
        onCopyReply?()
    }

    @objc private func makeCards() {
        if let selectedText { onMakeCards?(selectedText) }
    }
}
#endif
