# Blank Page Notes

**A distraction-free writing space that respects your focus and privacy.**

Open Blank Page Notes and you're greeted with a completely blank canvas. No cluttered menus, no sign-up forms, no tracking. Just you and your words. It's a minimalist writing app inspired by blank.page—designed to get out of your way so you can write. Everything you create stays local to your browser, forever.

Write daily pages that automatically refresh each day, or create freeform notes anytime. Your notes auto-save silently in the background, and you can search across everything you've written. The interface is intentionally simple: a calm top bar with calendar access, today's date, and light formatting controls when you need them.

## Features
- Daily pages that reset each day automatically.
- Calendar activity view with a GitHub-style heatmap for daily writing.
- Instant blank canvas on first paint.
- Multiple notes (freeform notes + daily pages) with autosave (debounced 400ms).
- Command palette for searching and opening notes (Cmd/Ctrl + K or P).
- Search across titles and full note content.
- Rich text formatting (bold, italic, strikethrough, underline, links, headings, lists).
- Writing statistics (word count and estimated reading time).
- Dark/light mode toggle with system default.
- Offline-first after first load.
- Installable as a Progressive Web App (PWA) in Chrome/Edge on Windows and macOS.

## Keyboard shortcuts
| Action | Shortcut |
| --- | --- |
| Open command palette | Cmd/Ctrl + K, Cmd/Ctrl + P |
| Manual save | Cmd/Ctrl + S |
| Toggle formatting panel | Click Aa button in top bar |
| Close palette | Esc |

## Privacy
Blank Page Notes is local-only. No analytics, no network calls, and no accounts. Your notes stay in your browser storage.

## Export
- **Export current note**: Downloads a `.txt` file of the current note.
- **Export all notes**: Downloads a `.json` backup.

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


## Install as an app (Windows/macOS)
1. Open the deployed site in **Chrome** or **Microsoft Edge**.
2. Open the calendar drawer (☰). If your browser supports installation, an **Install app** button appears.
3. Click **Install app** and confirm.
4. Launch it later from your OS app launcher (Start Menu on Windows, Applications/Launchpad on macOS).

You can also install from the browser address bar when the install icon is shown.

## PWA + Cloudflare Pages notes
- `manifest.webmanifest` is served from `public/` at the site root.
- Add your own app icons under `public/icons/` and then update `manifest.webmanifest` `icons` entries (192x192, 512x512, and maskable variants if desired).
- `sw.js` is served from the site root and registered on page load.
- On deploy updates, the service worker uses cache versioning (e.g. `app-shell-v1`, `runtime-v1`) so old caches can be cleaned during activation.

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
