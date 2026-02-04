export type NoteType = 'daily' | 'note'

export type NoteStats = {
  wordCount?: number
  lastEditedAt?: number
  editCount?: number
}

export type Note = {
  id: string
  titleOverride?: string
  content: string
  createdAt: number
  updatedAt: number
  type?: NoteType
  dateKey?: string
  stats?: NoteStats
}

export type ThemePreference = 'system' | 'light' | 'dark'

export type MetaKey = 'lastOpenNoteId' | 'lastOpenMode' | 'lastOpenDateKey' | 'theme'

export type DailyNoteSummary = {
  dateKey: string
  wordCount: number
}
