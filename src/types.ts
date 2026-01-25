export type Note = {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
  trashedAt: number | null
}

export type ThemeMode = 'light' | 'dark'
