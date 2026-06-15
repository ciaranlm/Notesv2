import Foundation

struct CapturedNote: Equatable {
    var body: String
    var createdAt: Date = Date()

    var trimmedBody: String {
        body.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var isEmpty: Bool {
        trimmedBody.isEmpty
    }

    var title: String {
        let firstLine = trimmedBody
            .split(whereSeparator: \.isNewline)
            .first
            .map(String.init) ?? "Untitled note"

        return firstLine.count > 64 ? String(firstLine.prefix(61)) + "…" : firstLine
    }

    var bodyLineCount: Int {
        guard !trimmedBody.isEmpty else { return 0 }
        return trimmedBody.split(whereSeparator: \.isNewline, omittingEmptySubsequences: false).count
    }
}
