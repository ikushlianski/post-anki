import PostAnkiAPI
import SwiftUI

enum PendingReviewLayout: String, CaseIterable, Identifiable {
    case triage = "Triage"
    case list = "List"

    #if os(iOS)
    static let defaultLayout = PendingReviewLayout.list
    #else
    static let defaultLayout = PendingReviewLayout.triage
    #endif

    var id: String { rawValue }
}

struct PendingReviewSheets: ViewModifier {
    let model: PendingReviewListModel
    @Binding var editingBit: PendingReviewBit?
    let isEnabled: Bool

    func body(content: Content) -> some View {
        content
            .sheet(item: Binding(get: { isEnabled ? editingBit : nil }, set: { editingBit = $0 })) { bit in
                if let variant = bit.variants.first(where: { $0.noteKind != nil }), let kind = variant.noteKind, let note = variant.sentence {
                    NoteEditSheet(
                        kind: kind,
                        text: note,
                        onSave: { text in
                            let outcome = await model.saveNoteEdit(bitId: bit.id, variantId: variant.id, kind: kind, text: text)

                            switch outcome {
                            case .saved: return nil
                            case .gone: return "This item was changed elsewhere."
                            case .failed(let message): return message
                            }
                        },
                        onClose: {
                            editingBit = nil
                            Task { await model.load() }
                        }
                    )
                    .macSheetMinSize(width: 480, height: 460)
                } else {
                    PendingReviewEditSheet(
                        bit: bit,
                        onSave: { body, background, backgroundChanged, variants in
                            await model.saveEdit(
                                bitId: bit.id,
                                body: body,
                                background: background,
                                backgroundChanged: backgroundChanged,
                                currentBody: bit.body,
                                variants: variants
                            )
                        },
                        onClose: { outcome in
                            editingBit = nil

                            guard let outcome else { return }

                            if case .gone = outcome { model.notice = "This item was changed elsewhere." }

                            Task { await model.load() }
                        }
                    )
                    .macSheetMinSize(width: 480, height: 460)
                }
            }
    }
}

extension View {
    func pendingReviewSheets(model: PendingReviewListModel, editingBit: Binding<PendingReviewBit?>, isEnabled: Bool = true) -> some View {
        modifier(PendingReviewSheets(model: model, editingBit: editingBit, isEnabled: isEnabled))
    }
}
