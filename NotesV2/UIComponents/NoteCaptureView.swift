#if canImport(AppKit)
import SwiftUI

struct NoteCaptureView: View {
    @StateObject var viewModel: NoteCaptureViewModel
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            VisualEffectView(material: .hudWindow, blendingMode: .behindWindow)
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))

            VStack(alignment: .leading, spacing: 16) {
                header
                editor
                footer
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 22)
        }
        .frame(width: 720, height: 292)
        .onAppear { focused = true }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in focused = true }
        .animation(.easeInOut(duration: 0.16), value: viewModel.state)
        .onKeyPress(.return) { press in
            if press.modifiers.contains(.command) || !press.modifiers.contains(.shift) {
                viewModel.submit()
                return .handled
            }
            return .ignored
        }
        .onKeyPress(.escape) {
            NSApp.keyWindow?.cancelOperation(nil)
            return .handled
        }
        .onKeyPress("n", phases: .down) { press in
            if press.modifiers.contains(.command) {
                viewModel.resetForNewNote()
                return .handled
            }
            return .ignored
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                Circle()
                    .fill(statusColor.opacity(0.14))
                Image(systemName: statusIcon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(statusColor)
                    .contentTransition(.symbolEffect(.replace))
            }
            .frame(width: 38, height: 38)

            VStack(alignment: .leading, spacing: 2) {
                Text(viewModel.previewTitle)
                    .font(.system(.title3, design: .default, weight: .semibold))
                    .lineLimit(1)
                Text(statusText)
                    .font(.system(.subheadline, design: .default, weight: .medium))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text("Apple Notes")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text(viewModel.draftSummary)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private var editor: some View {
        TextEditor(text: $viewModel.text)
            .font(.system(size: 22, weight: .regular, design: .default))
            .scrollContentBackground(.hidden)
            .focused($focused)
            .frame(minHeight: 126)
            .padding(14)
            .background(.black.opacity(0.08), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(alignment: .topLeading) {
                if viewModel.text.isEmpty {
                    Text("Capture a thought, meeting note, link, or follow-up…")
                        .font(.system(size: 22))
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 19)
                        .padding(.vertical, 22)
                        .allowsHitTesting(false)
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(.white.opacity(0.16))
            }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            HStack(spacing: 12) {
                Toggle("Open Notes after saving", isOn: $viewModel.shouldOpenNotesAfterSave)
                    .toggleStyle(.checkbox)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Text("⇧↩ New line · ⌘N Clear · ⎋ Close")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(.tertiary)

                Button(action: viewModel.submit) {
                    Label(submitTitle, systemImage: "arrow.up.circle.fill")
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.return, modifiers: [])
                .disabled(!viewModel.canSubmit)
            }
        }
    }

    private var submitTitle: String {
        viewModel.state == .sending ? "Saving…" : "Send"
    }

    private var statusIcon: String {
        switch viewModel.state {
        case .ready: "note.text"
        case .sending: "arrow.up.circle"
        case .sent: "checkmark.circle.fill"
        case .failed: "exclamationmark.triangle.fill"
        }
    }

    private var statusText: String {
        switch viewModel.state {
        case .ready: "Native quick capture, no browser context required"
        case .sending: "Creating note…"
        case .sent: "Saved in Notes"
        case .failed: "Couldn’t save note"
        }
    }

    private var statusColor: Color {
        switch viewModel.state {
        case .ready, .sending: .secondary
        case .sent: .green
        case .failed: .red
        }
    }
}

#endif
