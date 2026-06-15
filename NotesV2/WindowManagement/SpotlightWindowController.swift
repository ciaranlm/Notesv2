import AppKit
import SwiftUI

final class SpotlightWindowController: NSWindowController {
    convenience init() {
        let model = NoteCaptureViewModel(notesService: AppleNotesService())
        let content = NoteCaptureView(viewModel: model)
        let hostingView = NSHostingView(rootView: content)
        let window = SpotlightPanel(contentRect: NSRect(x: 0, y: 0, width: 720, height: 292))
        hostingView.wantsLayer = true
        window.contentView = hostingView
        self.init(window: window)
    }

    override init(window: NSWindow?) {
        super.init(window: window)
        (window as? SpotlightPanel)?.closeHandler = { [weak self] in self?.fadeOutAndOrderOut() }
    }

    required init?(coder: NSCoder) { nil }

    func showAndFocus() {
        guard let window else { return }
        window.center()
        window.alphaValue = 0
        window.setFrame(NSRect(x: window.frame.origin.x, y: window.frame.origin.y, width: 684, height: 272), display: false)
        window.makeKeyAndOrderFront(nil)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.18
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            window.animator().alphaValue = 1
            window.animator().setFrame(NSRect(x: window.frame.origin.x - 18, y: window.frame.origin.y - 10, width: 720, height: 292), display: true)
        }
    }

    func fadeOutAndOrderOut() {
        guard let window, window.isVisible else { return }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.14
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            window.animator().alphaValue = 0
        } completionHandler: {
            window.orderOut(nil)
            window.alphaValue = 1
        }
    }
}
