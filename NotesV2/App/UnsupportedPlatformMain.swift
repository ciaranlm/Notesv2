#if !canImport(AppKit)
@main
struct UnsupportedPlatformMain {
    static func main() {
        print("NotesV2 is a macOS app and requires AppKit to run.")
    }
}
#endif
