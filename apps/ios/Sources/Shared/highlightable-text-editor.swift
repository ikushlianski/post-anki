import PostAnkiAPI
import SwiftUI

#if os(iOS)
import UIKit

struct HighlightableTextEditor: UIViewRepresentable {
    @Binding var text: String
    @Binding var selection: NSRange
    var highlights: [KnowledgeHighlight]
    var fontSize: CGFloat = 16

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.delegate = context.coordinator
        view.font = .systemFont(ofSize: fontSize)
        view.backgroundColor = .clear
        view.alwaysBounceVertical = true
        view.accessibilityIdentifier = "add-knowledge-editor"

        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self

        if view.markedTextRange == nil, view.text != text { view.text = text }

        let storage = view.textStorage
        let whole = NSRange(location: 0, length: storage.length)

        storage.beginEditing()
        storage.removeAttribute(.backgroundColor, range: whole)

        for range in highlights {
            let clipped = NSIntersectionRange(NSRange(location: range.start, length: range.end - range.start), whole)

            if clipped.length > 0 {
                storage.addAttribute(.backgroundColor, value: UIColor.systemYellow.withAlphaComponent(0.4), range: clipped)
            }
        }

        storage.endEditing()
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: HighlightableTextEditor

        init(_ parent: HighlightableTextEditor) { self.parent = parent }

        func textViewDidChange(_ textView: UITextView) {
            guard textView.markedTextRange == nil else { return }

            parent.text = textView.text
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            let range = textView.selectedRange

            DispatchQueue.main.async { [parent] in
                if parent.selection != range { parent.selection = range }
            }
        }
    }
}
#else
import AppKit

struct HighlightableTextEditor: NSViewRepresentable {
    @Binding var text: String
    @Binding var selection: NSRange
    var highlights: [KnowledgeHighlight]
    var fontSize: CGFloat = 16

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSTextView.scrollableTextView()
        let view = scroll.documentView as? NSTextView

        view?.delegate = context.coordinator
        view?.font = .systemFont(ofSize: fontSize)
        view?.drawsBackground = false
        view?.isRichText = false
        view?.allowsUndo = true
        view?.textContainerInset = NSSize(width: 0, height: 8)
        view?.setAccessibilityIdentifier("add-knowledge-editor")
        scroll.drawsBackground = false

        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.parent = self

        guard let view = scroll.documentView as? NSTextView, let layout = view.layoutManager else { return }

        if !view.hasMarkedText(), view.string != text { view.string = text }

        let whole = NSRange(location: 0, length: (view.string as NSString).length)

        layout.removeTemporaryAttribute(.backgroundColor, forCharacterRange: whole)

        for range in highlights {
            let clipped = NSIntersectionRange(NSRange(location: range.start, length: range.end - range.start), whole)

            if clipped.length > 0 {
                layout.addTemporaryAttribute(.backgroundColor, value: NSColor.systemYellow.withAlphaComponent(0.4), forCharacterRange: clipped)
            }
        }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: HighlightableTextEditor

        init(_ parent: HighlightableTextEditor) { self.parent = parent }

        func textDidChange(_ notification: Notification) {
            guard let view = notification.object as? NSTextView, !view.hasMarkedText() else { return }

            parent.text = view.string
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard let view = notification.object as? NSTextView else { return }

            let range = view.selectedRange()

            DispatchQueue.main.async { [parent] in
                if parent.selection != range { parent.selection = range }
            }
        }
    }
}
#endif
