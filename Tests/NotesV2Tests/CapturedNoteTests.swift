import XCTest
@testable import NotesV2

final class CapturedNoteTests: XCTestCase {
    func testTrimmedBodyAndEmptyState() {
        let blank = CapturedNote(body: "  \n\t  ")
        XCTAssertTrue(blank.isEmpty)
        XCTAssertEqual(blank.trimmedBody, "")

        let note = CapturedNote(body: "  Remember milk  \n")
        XCTAssertFalse(note.isEmpty)
        XCTAssertEqual(note.trimmedBody, "Remember milk")
    }

    func testTitleFallsBackAndTruncatesLongFirstLine() {
        XCTAssertEqual(CapturedNote(body: "\n\n").title, "Untitled note")

        let longTitle = String(repeating: "A", count: 70)
        let note = CapturedNote(body: longTitle + "\nDetails")
        XCTAssertEqual(note.title.count, 62)
        XCTAssertTrue(note.title.hasSuffix("…"))
    }

    func testBodyLineCountIncludesBlankLinesInsideTrimmedBody() {
        let note = CapturedNote(body: "First line\n\nThird line\n")
        XCTAssertEqual(note.bodyLineCount, 3)
    }
}
