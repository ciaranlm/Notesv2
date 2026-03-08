# Blank Page Notes

A blank.page-inspired minimalist writing app with optional Supabase authentication (Google OAuth + email magic link). Open it and start typing on an instant blank canvas with local-first note storage.

## Features
- Daily pages that reset each day automatically.
- Calendar activity view with a GitHub-style heatmap for daily writing.
- Instant blank canvas on first paint.
- Multiple notes (freeform notes + daily pages) with autosave (debounced 400ms).
- Command palette for all actions (Cmd/Ctrl + K or P).
- Search across titles and full note content.
- Dark/light mode toggle with system default.
- Offline-first after first load.
- Installable as a Progressive Web App (PWA) in Chrome/Edge on Windows and macOS.

## Keyboard shortcuts
| Action | Shortcut |
| --- | --- |
| Open command palette | Cmd/Ctrl + K, Cmd/Ctrl + P |
| New note | Cmd/Ctrl + N |
| Manual save | Cmd/Ctrl + S |
| Delete current note (confirm required) | Cmd/Ctrl + Shift + Backspace |
| Close palette | Esc |

## Privacy
Blank Page Notes stores notes locally in your browser. The auth screen can call Supabase for sign-in and emits auth analytics events (`auth_screen_viewed`, `google_click`, `google_success`, `google_error`, `fallback_email_click`).

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


## Supabase auth setup
1. Create a Supabase project.
2. In **Authentication > Providers**, enable **Google** and **Email**.
3. Set these environment variables in your deployment and local `.env` file:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Add your callback URLs in Supabase (for local dev use `http://localhost:5173/app`).
5. Start the app and use **Continue with Google** or **Continue with email** (magic link).

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
