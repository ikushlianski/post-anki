import PostAnkiAPI
import SwiftUI

struct PendingReviewTriageView: View {
    @Bindable var model: PendingReviewTriageModel
    @Binding var editingBit: PendingReviewBit?
    var onBackToSubjects: (() -> Void)?
    @State private var chatPromptOpen = false
    @State var comment = ""
    @FocusState var isFocused: Bool
    @FocusState var commentFocused: Bool
    #if os(macOS)
    @State var commentMonitor = TriageCommentKeyMonitor()
    #endif

    var body: some View {
        Group {
            if let bit = model.current {
                piece(bit)
            } else {
                emptyState
            }
        }
        .focusable()
        .focusEffectDisabled()
        .focused($isFocused)
        .onKeyPress(phases: .down) { press in handle(press) }
        .onAppear { isFocused = true }
        .onChange(of: model.current?.id) {
            guard !commentFocused else { return }

            comment = ""
            isFocused = true
        }
        .onChange(of: editingBit == nil) { isFocused = true }
        .onChange(of: chatPromptOpen) { isFocused = true }
        .sheet(isPresented: $chatPromptOpen) {
            ChatFirstPromptSheet { prompt in
                Task { await model.sendToChat(prompt: prompt) }
            }
        }
    }

    private func piece(_ bit: PendingReviewBit) -> some View {
        ZoomVStack(alignment: .leading, spacing: 12) {
            header

            ScrollView {
                ZoomVStack(alignment: .leading, spacing: 12) {
                    ModelBadges(modelIds: bit.modelIds)

                    cards(for: bit)

                    if let background = bit.background?.trimmingCharacters(in: .whitespacesAndNewlines), !background.isEmpty {
                        TriageExampleBlock(text: background, isAI: bit.exampleAiGeneratedAt != nil)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
                .zoomPadding(20)
                .background(FocusTriageCardStyle.fill, in: RoundedRectangle(cornerRadius: FocusTriageCardStyle.cornerRadius, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: FocusTriageCardStyle.cornerRadius, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.12), lineWidth: 1)
                }
            }

            bottomBar(for: bit)
        }
        .zoomPadding()
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
        #if os(iOS)
        .gesture(
            DragGesture(minimumDistance: 40).onEnded { value in
                if value.translation.width < -120, abs(value.translation.height) < 80 { run(.drop) }
            }
        )
        #endif
    }

    private var header: some View {
        let source = model.currentSource
        let text = (source?.sourceText ?? "").split(whereSeparator: \.isWhitespace).joined(separator: " ")

        return ZoomVStack(alignment: .leading, spacing: 2) {
            if let onBackToSubjects {
                Button(action: onBackToSubjects) {
                    Label("Subjects", systemImage: "chevron.left")
                }
                .buttonStyle(.borderless)
            }

            Text(source?.subjectName ?? "No subject")
                .zoomFont(.caption.weight(.semibold))

            if !text.isEmpty {
                Text(text)
                    .zoomFont(.caption)
                    .lineLimit(1)
            }
        }
        .foregroundStyle(.secondary)
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func cards(for bit: PendingReviewBit) -> some View {
        let selection = model.selection

        if selection.pickOne {
            PendingReviewTriageOptions(selection: selection, phrase: bit.body, onSelect: { run(.toggle($0)) })
        } else {
            variantCards(for: bit, selection: selection)
        }
    }

    @ViewBuilder
    private func variantCards(for bit: PendingReviewBit, selection: PendingReviewTriageSelection) -> some View {
        if bit.variants.isEmpty {
            Text("No questions yet. Edit the piece to add some, or drop it.")
                .zoomFont(.callout)
                .foregroundStyle(.secondary)
        }

        ForEach(Array(selection.shown.enumerated()), id: \.element.id) { index, variant in
            PendingReviewTriageCard(
                number: index + 1,
                label: selection.label(at: index),
                variant: variant,
                isSelected: selection.isSelected(variant.id),
                onTap: { run(.toggle(index)) }
            )
        }

        if selection.hiddenCount > 0 {
            Text("+ \(selection.hiddenCount) more not shown")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func bottomBar(for bit: PendingReviewBit) -> some View {
        ZoomVStack(alignment: .leading, spacing: 8) {
            if let text = model.message ?? model.hint {
                Text(text)
                    .zoomFont(.callout)
                    .foregroundStyle(model.message == nil ? Color.orange : .red)
                    .textSelection(.enabled)
            }

            ZoomHStack(spacing: 12) {
                Text("\(model.remaining) left")
                    .zoomFont(.headline.monospacedDigit())

                Spacer()

                Button("Drop") { run(.drop) }
                    .tint(.red)
                Button("Edit") { editingBit = bit }
                Button("Chat") { run(.chat) }
                    .accessibilityIdentifier("triage-chat")
                Button("Skip") { run(.skip) }

                Button { run(.keep) } label: {
                    Text(model.selection.keepIds.count > 1 ? "Keep 2" : "Keep")
                        .zoomFont(.headline)
                        .zoomPadding(.horizontal, 16)
                        .zoomPadding(.vertical, 4)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!model.selection.canKeep)
            }
            .buttonStyle(.bordered)
            .disabled(model.isBusy)

            #if os(macOS)
            commentField

            Text(model.selection.pickOne
                ? "Up/Down choose, Return approves, X rejects, Z undoes, S skips, E edits, C sends to Chat, N comments"
                : "Left rejects, Right approves, Up sends to Chat, N comments (then Cmd+arrow decides, Esc leaves), 1-9 toggle, Z undoes, S skips, E edits")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
            #endif
        }
    }

    private var emptyState: some View {
        ZoomVStack(spacing: 12) {
            Text("Nothing left to triage")
                .zoomFont(.title3)
                .foregroundStyle(.secondary)

            if let onBackToSubjects {
                Button("Back to subjects", action: onBackToSubjects)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    func run(_ action: PendingReviewTriageAction) {
        if action == .edit {
            editingBit = model.current

            return
        }

        if action == .chat {
            if let prompt = FocusTriageNote.trimmed(comment) {
                Task { await model.sendToChat(prompt: prompt) }
            } else {
                chatPromptOpen = model.current != nil
            }

            return
        }

        let note = FocusTriageNote.trimmed(comment)

        Task { await model.perform(action, note: note) }
    }
}
