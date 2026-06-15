#if canImport(AppKit)
import Foundation
import AppKit

@MainActor
final class NoteCaptureViewModel: ObservableObject {
    @Published var text = ""
    @Published var state: CaptureState = .ready
    @Published var errorMessage: String?
    @Published var shouldOpenNotesAfterSave = false

    private let notesService: NotesCreating

    init(notesService: NotesCreating) {
        self.notesService = notesService
    }

    var draft: CapturedNote {
        CapturedNote(body: text)
    }

    var canSubmit: Bool {
        !draft.isEmpty && state != .sending
    }

    var previewTitle: String {
        draft.isEmpty ? "Quick Capture" : draft.title
    }

    var draftSummary: String {
        guard !draft.isEmpty else { return "Ready for a new Apple Notes entry" }

        let wordCount = draft.trimmedBody
            .split { $0.isWhitespace || $0.isNewline }
            .count
        let lineLabel = draft.bodyLineCount == 1 ? "line" : "lines"
        let wordLabel = wordCount == 1 ? "word" : "words"
        return "\(draft.bodyLineCount) \(lineLabel) · \(wordCount) \(wordLabel)"
    }

    func submit() {
        let draftText = text
        guard !draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, state != .sending else { return }
        state = .sending
        errorMessage = nil

        Task {
            do {
                try await notesService.createNote(body: draftText, openNotes: shouldOpenNotesAfterSave)
                text = ""
                state = .sent
                NSSound(named: "Tink")?.play()
                try? await Task.sleep(for: .milliseconds(850))
                if state == .sent { state = .ready }
            } catch {
                state = .failed
                errorMessage = error.localizedDescription
            }
        }
    }

    func resetForNewNote() {
        text = ""
        state = .ready
        errorMessage = nil
    }
}

enum CaptureState: Equatable {
    case ready
    case sending
    case sent
    case failed
}

#endif
