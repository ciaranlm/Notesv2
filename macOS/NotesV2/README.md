# NotesV2 for macOS

NotesV2 is a native macOS capture utility for quickly sending text into Apple Notes. It is intentionally not a wrapper around the web app: it uses SwiftUI, AppKit window management, and AppleScript automation so the interaction feels closer to Spotlight or Raycast than a browser-based editor.

## Analysis of the existing web app

The existing deployed app and React codebase are a local-first writing environment called **Blank Page Notes**. It provides daily pages, freeform browser notes, IndexedDB/localStorage persistence, autosave, command-palette search, rich-text controls, calendar activity, export, PWA installation, and theme support.

For the native macOS product, the functionality to preserve is the fast blank-entry writing experience and keyboard-first focus. The broader browser notebook features should not be copied directly because this product goal is different: capture a thought and send it to Apple Notes immediately.

Native macOS improvements in this implementation:

- Replaces browser storage with direct Apple Notes creation.
- Replaces the full-page editor with a centered floating command window.
- Uses native blur/materials, shadows, text editing, keyboard shortcuts, and focus behavior.
- Keeps interruptions minimal: type, press Enter, get confirmation, continue working.
- Provides clear Automation permission guidance if Apple Notes rejects the request.

## Project structure

```text
NotesV2/
├── App/                    # SwiftUI app entry point and application delegate
├── AppleNotes/             # Apple Notes automation service
├── Models/                 # Capture data models
├── UIComponents/           # SwiftUI capture interface and view model
├── Utilities/              # AppKit/SwiftUI utility bridges
└── WindowManagement/       # Spotlight-style NSPanel controller
```

## Requirements

- macOS 14 or later
- Xcode 15 or later
- Apple Notes installed and available

## Build and run in Xcode

1. Open `macOS/NotesV2/Package.swift` in Xcode.
2. Select the `NotesV2` scheme.
3. Choose **My Mac** as the run destination.
4. Press **Command + R**.
5. On first send, macOS may ask whether NotesV2 can control Notes. Choose **Allow**.

If permission is denied, enable it later in **System Settings → Privacy & Security → Automation**.

## Keyboard shortcuts

- **Enter**: send the current note to Apple Notes
- **Escape**: close the capture window
- **Command + N**: clear the field for a new note
- **Command + W**: close the capture window

## Implementation notes

Apple Notes does not expose a modern public Swift framework for note creation. The most reliable native integration available for this standalone utility is AppleScript automation through `NSAppleScript`, with the required `NSAppleEventsUsageDescription` included for the macOS permission prompt.
