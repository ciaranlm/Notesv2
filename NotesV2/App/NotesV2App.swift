#if canImport(AppKit)
import SwiftUI

@main
struct NotesV2App: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Note") { appDelegate.showCaptureWindow() }
                    .keyboardShortcut("n", modifiers: .command)
            }
            CommandGroup(replacing: .windowArrangement) {
                Button("Close") { appDelegate.closeCaptureWindow() }
                    .keyboardShortcut("w", modifiers: .command)
            }
        }
    }
}

#endif
