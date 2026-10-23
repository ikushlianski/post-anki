import PostAnkiAPI
import SwiftUI

struct PendingReviewTriageView: View {
    @Bindable var model: PendingReviewTriageModel
    @Binding var editingBit: PendingReviewBit?
    @FocusState private var isFocused: Bool

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
        .onChange(of: model.current?.id) { isFocused = true }
        .onChange(of: editingBit == nil) { isFocused = true }
    }

    private func piece(_ bit: PendingReviewBit) -> some View {
        ZoomVStack(alignment: .leading, spacing: 12) {
            header

            ScrollView {
                ZoomVStack(alignment: .leading, spacing: 12) {
                    Text(bit.body)
                        .zoomFont(.title2.weight(.semibold))

                    if let background = bit.background, !background.isEmpty {
                        Text(background)
                            .zoomFont(.callout)
                            .foregroundStyle(.secondary)
                    }

                    cards(for: bit)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
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
            Text(source?.subjectName ?? "No subject")
                .zoomFont(.caption.weight(.semibold))

            if !text.isEmpty {
                Text(text)
                    .zoomFont(.caption)
                    .lineLimit(1)
            }
        }
        .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private func cards(for bit: PendingReviewBit) -> some View {
        let selection = model.selection

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
            }

            ZoomHStack(spacing: 12) {
                Text("\(model.remaining) left")
                    .zoomFont(.headline.monospacedDigit())

                Spacer()

                Button("Drop") { run(.drop) }
                    .tint(.red)
                Button("Edit") { editingBit = bit }
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
            Text("1-9 toggle, Return keeps, X drops, Z undoes the last keep or drop, S skips, E edits, arrows move")
                .zoomFont(.caption)
                .foregroundStyle(.secondary)
            #endif
        }
    }

    private var emptyState: some View {
        Text("Nothing left to triage")
            .zoomFont(.title3)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func handle(_ press: KeyPress) -> KeyPress.Result {
        guard let input = Self.input(from: press),
              let action = PendingReviewTriageKeyMap.action(for: input, command: press.modifiers.contains(.command))
        else { return .ignored }

        run(action)

        return .handled
    }

    private func run(_ action: PendingReviewTriageAction) {
        if action == .edit {
            editingBit = model.current

            return
        }

        Task { await model.perform(action) }
    }

    private static func input(from press: KeyPress) -> PendingReviewTriageKeyInput? {
        switch press.key {
        case .return: return .returnKey
        case .space: return .space
        case .delete, .deleteForward: return .delete
        case .leftArrow: return .left
        case .rightArrow: return .right
        default: return press.characters.first.map { .character($0) }
        }
    }
}
