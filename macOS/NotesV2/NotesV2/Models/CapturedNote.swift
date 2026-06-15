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
}
