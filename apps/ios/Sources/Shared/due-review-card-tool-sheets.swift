import PostAnkiAPI
import SwiftUI

extension View {
    func dueReviewCardToolSheets(model: DueReviewModel) -> some View {
        sheet(item: Bindable(model).makeCardCard) { card in
            ReviewMakeCardSheet(
                bitId: card.knowledgeBitId,
                question: card.face.front,
                answer: card.filledSentence ?? card.answer,
                canReachServer: model.canReachServer
            ) {
                model.notice = ReviewMakeCard.createdMessage
                model.makeCardCard = nil
            }
        }
        .sheet(item: Bindable(model).noteCard) { card in
            NavigationStack {
                ReviewCardUserNote(
                    bitId: card.knowledgeBitId,
                    note: model.savedNotes[card.knowledgeBitId] ?? card.userNote,
                    startsEditing: true
                ) { saved in
                    model.savedNotes[card.knowledgeBitId] = saved ?? ""
                }
                .padding()
                .navigationTitle("Note")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { model.noteCard = nil }
                    }
                }
            }
            #if os(macOS)
            .frame(minWidth: 420, minHeight: 280)
            #endif
        }
    }
}
