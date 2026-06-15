# NotesV2 for macOS

NotesV2 is a native macOS capture utility for quickly sending text into Apple Notes. It is intentionally not a wrapper around the web app: it uses SwiftUI, AppKit window management, and AppleScript automation so the interaction feels closer to Spotlight or Raycast than a browser-based editor.

## Overview

NotesV2 is now a Swift-only macOS app. The legacy React, Vite, PWA, and browser storage implementation has been removed so the repository contains only the native Swift Package and app sources.

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

1. Open `Package.swift` in Xcode.
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
