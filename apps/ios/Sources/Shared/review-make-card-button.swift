import PostAnkiAPI
import SwiftUI

struct ReviewMakeCardButton: View {
    let bitId: String
    let question: String
    let answer: String
    let canReachServer: Bool
    @State private var showsSheet = false
    @State private var createdNotice: String?

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 6) {
            Button {
                createdNotice = nil
                showsSheet = true
            } label: {
                Label("Make card from selection", systemImage: "text.badge.plus")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityIdentifier("review-make-card")

            if let createdNotice {
                Text(createdNotice)
                    .zoomFont(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("review-make-card-created")
            }
        }
        .sheet(isPresented: $showsSheet) {
            ReviewMakeCardSheet(bitId: bitId, question: question, answer: answer, canReachServer: canReachServer) {
                createdNotice = ReviewMakeCard.createdMessage
                showsSheet = false
            }
        }
    }
}

struct ReviewMakeCardSheet: View {
    let bitId: String
    let question: String
    let answer: String
    let canReachServer: Bool
    let onCreated: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var source: String
    @State private var selection = NSRange(location: 0, length: 0)
    @State private var front = ""
    @State private var back = ""
    @State private var isSaving = false
    @State private var message: String?

    init(bitId: String, question: String, answer: String, canReachServer: Bool, onCreated: @escaping () -> Void) {
        self.bitId = bitId
        self.question = question
        self.answer = answer
        self.canReachServer = canReachServer
        self.onCreated = onCreated
        _source = State(initialValue: answer)
    }

    private var highlighted: String { ReviewMakeCard.selectedText(in: source, range: selection) }

    var body: some View {
        ZoomVStack(alignment: .leading, spacing: 12) {
            Text("Highlight part of the answer")
                .zoomFont(.headline)

            HighlightableTextEditor(text: $source, selection: $selection, highlights: [])
                .frame(minHeight: 110, maxHeight: 180)
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.primary.opacity(0.2)))

            Button("Use highlighted text as the answer") { back = highlighted }
                .buttonStyle(.bordered)
                .disabled(highlighted.isEmpty)
                .accessibilityIdentifier("review-make-card-use-selection")

            TextField(question, text: $front, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...3)
                .accessibilityIdentifier("review-make-card-front")

            TextField("Answer", text: $back, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...4)
                .accessibilityIdentifier("review-make-card-back")

            if !canReachServer {
                Text(ReviewMakeCard.offlineMessage)
                    .zoomFont(.footnote)
                    .foregroundStyle(.red)
            } else if let message {
                Text(message)
                    .zoomFont(.footnote)
                    .foregroundStyle(.red)
            }

            ZoomHStack(spacing: 12) {
                Button("Create card") { Task { await create() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(isSaving || !canReachServer || !ReviewMakeCard.canCreate(front: front, back: back))
                    .accessibilityIdentifier("review-make-card-create")

                Button("Cancel") { dismiss() }
                    .disabled(isSaving)
            }
        }
        .zoomPadding(20)
        .frame(minWidth: 320, minHeight: 360)
    }

    private func create() async {
        isSaving = true
        message = nil
        defer { isSaving = false }

        switch await ReviewMakeCard.submit(bitId: bitId, front: front, back: back, canReachServer: canReachServer) {
        case .created: onCreated()
        case .offline: message = ReviewMakeCard.offlineMessage
        case .failed(let text): message = text
        }
    }
}
