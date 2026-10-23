import PostAnkiAPI
import SwiftUI

enum PendingReviewLayout: String, CaseIterable, Identifiable {
    case triage = "Triage"
    case list = "List"

    static let defaultLayout = PendingReviewLayout.triage

    var id: String { rawValue }
}

struct PendingReviewSheets: ViewModifier {
    let model: PendingReviewListModel
    @Binding var editingBit: PendingReviewBit?
    let isEnabled: Bool

    func body(content: Content) -> some View {
        content
            .sheet(item: Binding(get: { isEnabled ? editingBit : nil }, set: { editingBit = $0 })) { bit in
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
            .sheet(item: Binding(
                get: { isEnabled ? model.pendingFeedback : nil },
                set: { if $0 == nil, isEnabled { model.skipFeedback() } }
            )) { feedback in
                RejectReasonSheet(
                    feedback: feedback,
                    onSend: { reason, note in await model.sendFeedback(feedback, reason: reason, note: note) },
                    onSkip: { model.skipFeedback() }
                )
                .macSheetMinSize()
            }
    }
}

extension View {
    func pendingReviewSheets(model: PendingReviewListModel, editingBit: Binding<PendingReviewBit?>, isEnabled: Bool = true) -> some View {
        modifier(PendingReviewSheets(model: model, editingBit: editingBit, isEnabled: isEnabled))
    }
}
