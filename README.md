# Blank Page Notes

A blank.page-inspired minimalist writing app. Open it and start typing on an instant blank canvas—no accounts, no tracking, and no distractions. Everything stays local-first in your browser storage.

## Features
- Daily pages that reset each day automatically.
- Calendar activity view with a GitHub-style heatmap for daily writing.
- Instant blank canvas on first paint.
- Multiple notes (freeform notes + daily pages) with autosave (debounced 400ms).
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
  - `lastOpenNoteId`: remember the last open freeform note
  - `lastOpenMode`: `daily` or `note`
  - `lastOpenDateKey`: remember the last open daily page
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
  type?: 'daily' | 'note'
  dateKey?: string
  stats?: {
    wordCount?: number
    lastEditedAt?: number
    editCount?: number
  }
}
```

## Daily Pages
- Each day gets its own note keyed by `YYYY-MM-DD` in local time.
- Daily pages are stored alongside freeform notes and appear in the calendar activity view.

## Calendar view
- Open **Calendar** from the menu to see activity for the past year.
- Click a day to jump to that daily page.
