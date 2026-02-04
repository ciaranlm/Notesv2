# Blank Page Notes

A blank.page-inspired minimalist writing app. Open it and start typing on an instant blank canvas—no accounts, no tracking, and no distractions. Everything stays local-first in your browser storage.

## Features
- Instant blank canvas on first paint.
- Single current note with autosave (debounced 400ms).
- Command palette for all actions (Cmd/Ctrl + K or P).
- Search across titles and full note content.
- Dark/light mode toggle with system default.
- Offline-first after first load.

## Keyboard shortcuts
| Action | Shortcut |
| --- | --- |
| Open command palette | Cmd/Ctrl + K, Cmd/Ctrl + P |
| New note | Cmd/Ctrl + N |
| Manual save | Cmd/Ctrl + S |
| Delete current note (confirm required) | Cmd/Ctrl + Shift + Backspace |
| Close palette | Esc |

## Privacy
Blank Page Notes is local-only. No analytics, no network calls, and no accounts. Your notes stay in your browser storage.

## Export & Import
- **Export current note**: Downloads a `.txt` file of the current note.
- **Export all notes**: Downloads a `.json` backup.
- **Import notes**: Use the command palette to import a `.json` backup. You can merge or replace all notes (replace requires confirmation).

## Storage details
- **IndexedDB**
  - Database name: `notes_db`
  - Stores: `notes` (keyPath `id`), `meta` (keyPath `key`)
- **Meta keys**
  - `lastOpenNoteId`: remember the last open note
  - `theme`: `system`, `light`, or `dark`
- **Fallback**: If IndexedDB is unavailable, the app falls back to localStorage. If both fail, it keeps notes in memory for the session.

## Development
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Data model
```ts
Note = {
  id: string
  titleOverride?: string
  content: string
  createdAt: number
  updatedAt: number
}
```
