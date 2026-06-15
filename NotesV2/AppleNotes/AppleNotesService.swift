import Foundation
#if canImport(AppKit)
import AppKit
#endif

protocol NotesCreating {
    func createNote(body: String, openNotes: Bool) async throws
}

enum AppleNotesError: LocalizedError {
    case emptyNote
    case scriptFailed(String)
    case missingAppleScriptRuntime

    var errorDescription: String? {
        switch self {
        case .emptyNote:
            return "Type something before sending it to Notes."
        case .scriptFailed(let message):
            return message
        case .missingAppleScriptRuntime:
            return "AppleScript is unavailable on this Mac."
        }
    }

    var recoverySuggestion: String? {
        "macOS may ask for permission to control Notes. Allow NotesV2 in System Settings → Privacy & Security → Automation."
    }
}

#if canImport(AppKit)
final class AppleNotesService: NotesCreating {
    func createNote(body: String, openNotes: Bool = false) async throws {
        let note = CapturedNote(body: body)
        guard !note.isEmpty else { throw AppleNotesError.emptyNote }

        try await Task.detached(priority: .userInitiated) {
            let escapedBody = Self.appleScriptString(note.trimmedBody)
            let activationLine = openNotes ? "activate" : ""
            let script = """
            tell application "Notes"
                \(activationLine)
                set createdNote to make new note at folder "Notes" with properties {body:\(escapedBody)}
                id of createdNote
            end tell
            """

            guard let appleScript = NSAppleScript(source: script) else {
                throw AppleNotesError.missingAppleScriptRuntime
            }

            var errorInfo: NSDictionary?
            _ = appleScript.executeAndReturnError(&errorInfo)
            if let errorInfo {
                let message = (errorInfo[NSAppleScript.errorMessage] as? String) ?? "Notes could not create the note."
                throw AppleNotesError.scriptFailed(message)
            }
        }.value
    }

    private static func appleScriptString(_ value: String) -> String {
        "\"" + value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\r", with: "")
            .replacingOccurrences(of: "\n", with: "\\n") + "\""
    }
}
#endif
