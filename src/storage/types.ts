export type Note = {
  id: string
  titleOverride?: string
  content: string
  createdAt: number
  updatedAt: number
}

export type ThemePreference = 'system' | 'light' | 'dark'

export type MetaKey = 'lastOpenNoteId' | 'theme'
