export type Note = {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  trashedAt: number | null
}

export type ThemeMode = 'light' | 'dark'
