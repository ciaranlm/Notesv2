import Foundation
import AppKit

@MainActor
final class NoteCaptureViewModel: ObservableObject {
    @Published var text = ""
    @Published var state: CaptureState = .ready
    @Published var errorMessage: String?

    private let notesService: NotesCreating

    init(notesService: NotesCreating) {
        self.notesService = notesService
    }

    func submit() {
        let draft = text
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        state = .sending
        errorMessage = nil

        Task {
            do {
                try await notesService.createNote(body: draft)
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
