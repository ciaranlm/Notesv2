import type { Note, ThemeMode } from '../types'
import { extractTags } from './tagging'

const NOTES_KEY = 'notesv2.notes'
const ACTIVE_KEY = 'notesv2.active'
const THEME_KEY = 'notesv2.theme'

export const loadNotes = (): Note[] => {
  const raw = localStorage.getItem(NOTES_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Note[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((note) => ({
      ...note,
      tags: extractTags(`${note.title ?? ''} ${note.content ?? ''}`),
    }))
  } catch {
    return []
  }
}

export const saveNotes = (notes: Note[]) => {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
}

export const loadActiveId = (): string | null => {
  return localStorage.getItem(ACTIVE_KEY)
}

export const saveActiveId = (id: string | null) => {
  if (!id) {
    localStorage.removeItem(ACTIVE_KEY)
    return
  }
  localStorage.setItem(ACTIVE_KEY, id)
}

export const loadTheme = (): ThemeMode => {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'dark' ? 'dark' : 'light'
}

export const saveTheme = (mode: ThemeMode) => {
  localStorage.setItem(THEME_KEY, mode)
}
