#if canImport(AppKit)
import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var windowController: SpotlightWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        showCaptureWindow()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showCaptureWindow()
        return true
    }

    func showCaptureWindow() {
        if windowController == nil {
            windowController = SpotlightWindowController()
        }
        NSApp.activate(ignoringOtherApps: true)
        windowController?.showAndFocus()
    }

    func closeCaptureWindow() {
        windowController?.fadeOutAndOrderOut()
    }
}

#endif
