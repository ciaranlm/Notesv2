import SwiftUI

struct NoteCaptureView: View {
    @StateObject var viewModel: NoteCaptureViewModel
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            VisualEffectView(material: .hudWindow, blendingMode: .behindWindow)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: statusIcon)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(statusColor)
                        .contentTransition(.symbolEffect(.replace))

                    Text(statusText)
                        .font(.system(.subheadline, design: .default, weight: .medium))
                        .foregroundStyle(.secondary)

                    Spacer()

                    Text("↩ Send  ·  ⎋ Close")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(.tertiary)
                }

                TextEditor(text: $viewModel.text)
                    .font(.system(size: 24, weight: .regular, design: .default))
                    .scrollContentBackground(.hidden)
                    .focused($focused)
                    .frame(minHeight: 84)
                    .padding(.horizontal, -5)
                    .onSubmit { viewModel.submit() }
                    .overlay(alignment: .topLeading) {
                        if viewModel.text.isEmpty {
                            Text("Capture a thought for Apple Notes…")
                                .font(.system(size: 24))
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8)
                                .allowsHitTesting(false)
                        }
                    }

                if let errorMessage = viewModel.errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 20)
        }
        .frame(width: 680, height: 188)
        .onAppear { focused = true }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in focused = true }
        .animation(.easeInOut(duration: 0.16), value: viewModel.state)
        .onKeyPress(.return) {
            viewModel.submit()
            return .handled
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
        case .ready: "Send to Apple Notes"
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
