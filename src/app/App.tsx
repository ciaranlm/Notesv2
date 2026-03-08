import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDrawer } from '../components/CalendarDrawer'
import { CommandPalette } from '../components/CommandPalette'
import { SaveIndicator } from '../components/SaveIndicator'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import { useHotkeys } from '../hooks/useHotkeys'
import { getStorage, sanitizeTheme } from '../storage/db'
import type { Note, NoteType, ThemePreference } from '../storage/types'
import { getPlainTextFromContent, getWordCountFromContent, getWritingStatsFromContent } from '../utils/content'
import { formatFullDate, getDailyNoteId, getTodayKey, parseDateKey } from '../utils/dates'
import { createId } from '../utils/id'
import { now } from '../utils/time'
import { assert } from '../utils/assertions'

const createEmptyNote = (): Note => {
  const timestamp = now()
  return {
    id: createId(),
    content: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    type: 'note',
  }
}

const createDailyNote = (dateKey: string): Note => {
  const timestamp = now()
  return {
    id: getDailyNoteId(dateKey),
    content: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    type: 'daily',
    dateKey,
    stats: { wordCount: 0, editCount: 0, lastEditedAt: timestamp },
  }
}

const normalizeContent = (content: string) => {
  const trimmed = content.trim()
  if (trimmed === '<br>' || trimmed === '<div><br></div>' || trimmed === '<div></div>') {
    return ''
  }
  return content
}

const normalizeNoteType = (note: Note): NoteType =>
  note.type ?? (note.id.startsWith('daily:') || note.id.startsWith('note:') || note.dateKey ? 'daily' : 'note')

const normalizeNote = (note: Note): Note => {
  const type = normalizeNoteType(note)
  const dateKey =
    note.dateKey ??
    (type === 'daily' && note.id.includes(':') ? note.id.slice(note.id.indexOf(':') + 1) : undefined)
  const id = type === 'daily' && dateKey ? getDailyNoteId(dateKey) : note.id
  return { ...note, id, type, dateKey }
}

const getDailyTitle = (dateKey: string) => formatFullDate(parseDateKey(dateKey))

const deriveTitle = (note: Note) => {
  if (normalizeNoteType(note) === 'daily' && note.dateKey) {
    return getDailyTitle(note.dateKey)
  }
  if (note.titleOverride?.trim()) return note.titleOverride.trim()
  const plainText = getPlainTextFromContent(note.content)
  const line = plainText.split('\n').find((value) => value.trim().length > 0)
  if (line) return line.trim()
  return 'Untitled'
}

const mergeNotes = (existing: Note[], imported: Note[]) => {
  const map = new Map(existing.map((note) => [note.id, note]))
  for (const note of imported) {
    const current = map.get(note.id)
    if (!current || note.updatedAt >= current.updatedAt) {
      map.set(note.id, note)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

type NoteDraft = { content: string; updatedAt: number }

const getDraftKey = (noteId: string) => `notes_draft_${noteId}`

const loadDraft = (noteId: string): NoteDraft | null => {
  try {
    const raw = window.localStorage.getItem(getDraftKey(noteId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as NoteDraft
    if (typeof parsed?.content !== 'string' || typeof parsed?.updatedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

const saveDraft = (noteId: string, draft: NoteDraft) => {
  try {
    window.localStorage.setItem(getDraftKey(noteId), JSON.stringify(draft))
  } catch {
    // ignore draft persistence failures
  }
}

const clearDraft = (noteId: string) => {
  try {
    window.localStorage.removeItem(getDraftKey(noteId))
  } catch {
    // ignore draft cleanup failures
  }
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>Something went wrong.</h1>
          <p>Your notes are still in this browser. Refresh to try again.</p>
        </div>
      )
    }
    return this.props.children
  }
}

export const App = () => {
  const [notes, setNotes] = useState<Note[]>([])
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const [currentMode, setCurrentMode] = useState<'daily' | 'note'>('daily')
  const [currentDateKey, setCurrentDateKey] = useState(() => getTodayKey())
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [paletteInitialMode, setPaletteInitialMode] = useState<'default' | 'confirm-delete'>('default')
  const [themePreference, setThemePreference] = useState<ThemePreference>('system')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [uiVisible, setUiVisible] = useState(false)
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  )
  const [isFormattingVisible, setIsFormattingVisible] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem('formattingVisible')
    if (stored === null) return true
    return stored === 'true'
  })

  const storageRef = useRef<Awaited<ReturnType<typeof getStorage>> | null>(null)
  const currentNoteRef = useRef<Note | null>(null)
  const notesRef = useRef<Note[]>([])
  const editorRef = useRef<HTMLDivElement>(null)
  const wordCountTimeout = useRef<number | null>(null)

  const currentNote = useMemo(
    () => notes.find((note) => note.id === currentNoteId) ?? null,
    [notes, currentNoteId],
  )

  useEffect(() => {
    currentNoteRef.current = currentNote
  }, [currentNote])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  const applyTheme = useCallback((theme: ThemePreference) => {
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', theme)
    }
  }, [])

  useEffect(() => {
    applyTheme(themePreference)
  }, [applyTheme, themePreference])

  useEffect(() => {
    window.localStorage.setItem('formattingVisible', String(isFormattingVisible))
  }, [isFormattingVisible])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPromptEvent(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPromptEvent(null)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      const storage = await getStorage()
      if (!isMounted) return
      storageRef.current = storage
      const [storedNotes, lastOpen, lastOpenMode, lastOpenDateKey, storedTheme] = await Promise.all([
        storage.getAllNotes(),
        storage.getMeta('lastOpenNoteId'),
        storage.getMeta('lastOpenMode'),
        storage.getMeta('lastOpenDateKey'),
        storage.getMeta('theme'),
      ])

      const theme = sanitizeTheme(storedTheme)
      setThemePreference(theme)

      let nextNotes = storedNotes.map(normalizeNote)
      const todayKey = getTodayKey()
      if (!nextNotes.some((note) => note.type === 'daily' && note.dateKey === todayKey)) {
        const dailyNote = createDailyNote(todayKey)
        nextNotes = [dailyNote, ...nextNotes]
        await storage.saveNote(dailyNote)
      }

      if (nextNotes.length === 0) {
        const newNote = createEmptyNote()
        nextNotes = [newNote]
        await storage.saveNote(newNote)
      }

      if (lastOpenMode === 'note' && lastOpen) {
        const noteToOpen = nextNotes.find((note) => note.id === lastOpen) ?? nextNotes[0]
        setCurrentMode('note')
        setCurrentNoteId(noteToOpen.id)
      } else {
        const dateKey = lastOpenDateKey ?? todayKey
        const dailyNoteId = getDailyNoteId(dateKey)
        const dailyNote =
          nextNotes.find((note) => note.id === dailyNoteId) ?? createDailyNote(dateKey)
        if (!nextNotes.find((note) => note.id === dailyNoteId)) {
          nextNotes = [dailyNote, ...nextNotes]
          await storage.saveNote(dailyNote)
        }
        setCurrentMode('daily')
        setCurrentDateKey(dateKey)
        setCurrentNoteId(dailyNote.id)
      }

      setNotes(nextNotes.sort((a, b) => b.updatedAt - a.updatedAt))
    }

    void load()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const storage = storageRef.current
    if (!storage || notes.length === 0) return
    const todayKey = getTodayKey()
    const hasToday = notes.some((note) => note.type === 'daily' && note.dateKey === todayKey)
    if (!hasToday) {
      const dailyNote = createDailyNote(todayKey)
      setNotes((prev) => [dailyNote, ...prev])
      void storage.saveNote(dailyNote)
    }
  }, [notes])

  useEffect(() => {
    if (!isPaletteOpen) {
      editorRef.current?.focus()
    }
  }, [isPaletteOpen])

  const persistNote = useCallback(async (note: Note) => {
    const storage = storageRef.current
    if (!storage) return
    try {
      await storage.saveNote(note)
      setSavedAt(now())
    } catch (error) {
      console.warn('Failed to save note, keeping in memory.', error)
    }
  }, [])

  const { debounced: scheduleSave, flush: flushSave, cancel: cancelSave } = useDebouncedCallback((note: Note) => {
    void persistNote(note)
  }, 400)

  useEffect(() => {
    if (!currentNote) return
    const draft = loadDraft(currentNote.id)
    if (!draft) return
    const isNewer = draft.updatedAt > currentNote.updatedAt
    const hasDifferentContent = draft.content !== currentNote.content
    if (!isNewer && !hasDifferentContent) return
    const updatedNote: Note = {
      ...currentNote,
      content: draft.content,
      updatedAt: Math.max(draft.updatedAt, currentNote.updatedAt),
      stats: {
        wordCount: getWordCountFromContent(draft.content),
        editCount: currentNote.stats?.editCount ?? 0,
        lastEditedAt: draft.updatedAt,
      },
    }
    setNotes((prev) => prev.map((note) => (note.id === updatedNote.id ? updatedNote : note)))
    void persistNote(updatedNote)
  }, [currentNote, persistNote])

  const syncEditorContent = useCallback(async () => {
    const editor = editorRef.current
    const activeNote = currentNoteRef.current
    if (!editor || !activeNote) return
    const normalizedContent = normalizeContent(editor.innerHTML)
    if (normalizedContent === activeNote.content) return
    const timestamp = now()
    const updatedNote = {
      ...activeNote,
      content: normalizedContent,
      updatedAt: timestamp,
      stats: {
        wordCount: getWordCountFromContent(normalizedContent),
        editCount: (activeNote.stats?.editCount ?? 0) + 1,
        lastEditedAt: timestamp,
      },
    }
    setNotes((prev) => prev.map((note) => (note.id === updatedNote.id ? updatedNote : note)))
    saveDraft(updatedNote.id, { content: normalizedContent, updatedAt: timestamp })
    cancelSave()
    await persistNote(updatedNote)
  }, [cancelSave, persistNote])

  const handleToggleCalendar = useCallback(async () => {
    if (!isCalendarOpen) {
      await syncEditorContent()
    }
    setIsCalendarOpen((value) => !value)
  }, [isCalendarOpen, syncEditorContent])

  const handleOpenCalendar = useCallback(async () => {
    await syncEditorContent()
    setIsCalendarOpen(true)
  }, [syncEditorContent])

  const handleCloseCalendar = useCallback(() => {
    setIsCalendarOpen(false)
    editorRef.current?.focus()
  }, [])

  const handleContentChange = (value: string) => {
    assert(currentNote, 'No active note')
    const normalizedContent = normalizeContent(value)
    const updatedAt = now()
    const updatedNote = {
      ...currentNote,
      content: normalizedContent,
      updatedAt,
      stats: {
        wordCount: getWordCountFromContent(normalizedContent),
        editCount: (currentNote.stats?.editCount ?? 0) + 1,
        lastEditedAt: updatedAt,
      },
    }
    setNotes((prev) =>
      prev.map((note) => (note.id === updatedNote.id ? updatedNote : note)),
    )
    saveDraft(updatedNote.id, { content: normalizedContent, updatedAt })
    scheduleSave(updatedNote)
  }

  const applyInlineFormatting = (command: 'bold' | 'italic' | 'strikeThrough' | 'underline') => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    document.execCommand(command)
    handleContentChange(editor.innerHTML)
  }

  const applyLinkFormatting = () => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) return
    const linkTarget = 'https://'
    if (range.collapsed) {
      const link = document.createElement('a')
      link.href = linkTarget
      link.textContent = 'link text'
      range.insertNode(link)
      const newRange = document.createRange()
      newRange.selectNodeContents(link)
      selection.removeAllRanges()
      selection.addRange(newRange)
    } else {
      document.execCommand('createLink', false, linkTarget)
    }
    handleContentChange(editor.innerHTML)
  }

  const applyBlockFormatting = (command: 'formatBlock' | 'insertUnorderedList' | 'insertOrderedList') => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    if (command === 'formatBlock') {
      document.execCommand(command, false, 'h1')
    } else {
      document.execCommand(command)
    }
    handleContentChange(editor.innerHTML)
  }

  const handleSelectNote = async (id: string) => {
    setCurrentMode('note')
    setCurrentNoteId(id)
    const storage = storageRef.current
    if (storage) {
      await storage.setMeta('lastOpenNoteId', id)
      await storage.setMeta('lastOpenMode', 'note')
    }
  }

  const handleDeleteNote = async (id: string) => {
    const storage = storageRef.current
    setNotes((prev) => {
      const remaining = prev.filter((note) => note.id !== id)
      if (remaining.length === 0) {
        const newNote = createEmptyNote()
        if (storage) {
          void storage.saveNote(newNote)
          void storage.setMeta('lastOpenNoteId', newNote.id)
          void storage.setMeta('lastOpenMode', 'note')
        }
        setCurrentMode('note')
        setCurrentNoteId(newNote.id)
        return [newNote]
      }
      if (currentNoteId === id) {
        setCurrentNoteId(remaining[0].id)
        if (storage) {
          void storage.setMeta('lastOpenNoteId', remaining[0].id)
          void storage.setMeta('lastOpenMode', 'note')
        }
        setCurrentMode('note')
      }
      return remaining
    })
    if (storage) {
      await storage.deleteNote(id)
    }
    clearDraft(id)
  }

  const handleManualSave = () => {
    if (currentNoteRef.current) {
      flushSave(currentNoteRef.current)
    }
  }

  const exportFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCurrent = () => {
    if (!currentNote) return
    const filename = `${deriveTitle(currentNote).replace(/[^a-z0-9-_]+/gi, '_')}.txt`
    const blob = new Blob([getPlainTextFromContent(currentNote.content)], { type: 'text/plain' })
    exportFile(blob, filename)
  }

  const handleExportAll = () => {
    const payload = {
      version: 1,
      exportedAt: now(),
      notes,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    exportFile(blob, 'notes-backup.json')
  }

  const handleImportMerge = async (imported: Note[]) => {
    let merged = mergeNotes(notes, imported.map(normalizeNote))
    const todayKey = getTodayKey()
    if (!merged.some((note) => note.type === 'daily' && note.dateKey === todayKey)) {
      const dailyNote = createDailyNote(todayKey)
      merged = [dailyNote, ...merged]
    }
    setNotes(merged)
    const storage = storageRef.current
    if (storage) {
      await storage.bulkSaveNotes(merged)
    }
  }

  const handleImportReplace = async (imported: Note[]) => {
    const normalized = imported.map(normalizeNote)
    setNotes(normalized)
    const todayKey = getTodayKey()
    const dailyNote = normalized.find((note) => note.type === 'daily' && note.dateKey === todayKey)
    if (dailyNote) {
      setCurrentMode('daily')
      setCurrentDateKey(todayKey)
      setCurrentNoteId(dailyNote.id)
    } else if (normalized[0]) {
      setCurrentMode('note')
      setCurrentNoteId(normalized[0].id)
    }
    const storage = storageRef.current
    if (storage) {
      await storage.clearAllNotes()
      await storage.bulkSaveNotes(normalized)
      if (dailyNote) {
        await storage.setMeta('lastOpenMode', 'daily')
        await storage.setMeta('lastOpenDateKey', todayKey)
      } else if (normalized[0]) {
        await storage.setMeta('lastOpenNoteId', normalized[0].id)
        await storage.setMeta('lastOpenMode', 'note')
      }
    }
  }

  const handleToggleTheme = async () => {
    const next: ThemePreference =
      themePreference === 'system' ? 'light' : themePreference === 'light' ? 'dark' : 'system'
    setThemePreference(next)
    const storage = storageRef.current
    if (storage) {
      await storage.setMeta('theme', next)
    }
  }

  useHotkeys([
    {
      combo: 'cmd+k',
      handler: (event) => {
        event.preventDefault()
        setPaletteInitialMode('default')
        setIsPaletteOpen(true)
      },
      allowInInput: true,
    },
    {
      combo: 'ctrl+k',
      handler: (event) => {
        event.preventDefault()
        setPaletteInitialMode('default')
        setIsPaletteOpen(true)
      },
      allowInInput: true,
    },
    {
      combo: 'cmd+p',
      handler: (event) => {
        event.preventDefault()
        setPaletteInitialMode('default')
        setIsPaletteOpen(true)
      },
      allowInInput: true,
    },
    {
      combo: 'ctrl+p',
      handler: (event) => {
        event.preventDefault()
        setPaletteInitialMode('default')
        setIsPaletteOpen(true)
      },
      allowInInput: true,
    },
    {
      combo: 'cmd+s',
      handler: (event) => {
        event.preventDefault()
        handleManualSave()
      },
      allowInInput: true,
    },
    {
      combo: 'ctrl+s',
      handler: (event) => {
        event.preventDefault()
        handleManualSave()
      },
      allowInInput: true,
    },
    {
      combo: 'cmd+shift+backspace',
      handler: (event) => {
        event.preventDefault()
        setPaletteInitialMode('confirm-delete')
        setIsPaletteOpen(true)
      },
      allowInInput: true,
    },
    {
      combo: 'ctrl+shift+backspace',
      handler: (event) => {
        event.preventDefault()
        setPaletteInitialMode('confirm-delete')
        setIsPaletteOpen(true)
      },
      allowInInput: true,
    },
  ])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && currentNoteRef.current) {
        flushSave(currentNoteRef.current)
      }
    }
    const handleBlur = () => {
      if (currentNoteRef.current) {
        flushSave(currentNoteRef.current)
      }
    }
    window.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBlur)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleBlur)
      window.removeEventListener('blur', handleBlur)
    }
  }, [flushSave])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      if (!element) return false
      const tag = element.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || element.isContentEditable
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isCalendarOpen) {
        event.preventDefault()
        handleCloseCalendar()
        return
      }

      if (event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        if (isEditableTarget(event.target)) return
        event.preventDefault()
        void handleToggleCalendar()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleCloseCalendar, handleToggleCalendar, isCalendarOpen])

  useEffect(() => {
    const showUi = () => {
      setUiVisible(true)
      if (wordCountTimeout.current) {
        window.clearTimeout(wordCountTimeout.current)
      }
      wordCountTimeout.current = window.setTimeout(() => setUiVisible(false), 2500)
    }
    window.addEventListener('mousemove', showUi)
    window.addEventListener('touchstart', showUi, { passive: true })
    return () => {
      window.removeEventListener('mousemove', showUi)
      window.removeEventListener('touchstart', showUi)
      if (wordCountTimeout.current) {
        window.clearTimeout(wordCountTimeout.current)
      }
    }
  }, [])

  const writingStats = useMemo(() => {
    if (!currentNote) {
      return { wordCount: 0, readingTimeLabel: '<1 min read' }
    }
    return getWritingStatsFromContent(currentNote.content)
  }, [currentNote])

  const selectedDate = currentMode === 'daily' && currentDateKey ? currentDateKey : getTodayKey()

  const hasContentMap = useMemo(() => {
    const map: Record<string, boolean> = {}
    notes.forEach((note) => {
      if (note.type !== 'daily' || !note.dateKey) return
      map[note.dateKey] = getPlainTextFromContent(note.content).trim().length > 0
    })
    return map
  }, [notes])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const draft = currentNote ? loadDraft(currentNote.id) : null
    const hasDraft = draft && draft.updatedAt >= (currentNote?.updatedAt ?? 0)
    const nextContent = hasDraft ? draft!.content : currentNote?.content ?? ''
    if (editor.innerHTML !== nextContent) {
      editor.innerHTML = nextContent
    }
  }, [currentNote])

  const handleInstallApp = async () => {
    if (!installPromptEvent) return
    await installPromptEvent.prompt()
    const choice = await installPromptEvent.userChoice
    if (choice.outcome === 'accepted') {
      setIsInstalled(true)
    }
    setInstallPromptEvent(null)
  }

  const canInstallApp = Boolean(installPromptEvent) && !isInstalled

  const handleSelectDate = async (dateKey: string) => {
    await syncEditorContent()
    const storage = storageRef.current
    const dailyId = getDailyNoteId(dateKey)
    let existing = notesRef.current.find((note) => note.id === dailyId)
    if (!existing) {
      existing = createDailyNote(dateKey)
      setNotes((prev) => [existing!, ...prev])
      if (storage) {
        await storage.saveNote(existing)
      }
    }
    setCurrentMode('daily')
    setCurrentDateKey(dateKey)
    setCurrentNoteId(dailyId)
    if (storage) {
      await storage.setMeta('lastOpenMode', 'daily')
      await storage.setMeta('lastOpenDateKey', dateKey)
    }
    handleCloseCalendar()
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <SaveIndicator savedAt={savedAt} />
        <header className="top-bar">
          <button type="button" className="top-bar-button" aria-label="Open calendar" onClick={() => void handleOpenCalendar()}>
            ☰
          </button>
          <button type="button" className="top-bar-date" onClick={() => void handleOpenCalendar()}>
            {formatFullDate(parseDateKey(selectedDate))}
          </button>
          <button
            type="button"
            className="top-bar-button"
            aria-label="Toggle formatting controls"
            onClick={() => setIsFormattingVisible((value) => !value)}
          >
            Aa
          </button>
        </header>
        {isFormattingVisible ? (
          <div className="formatting-panel">
            <button
              type="button"
              className="formatting-item is-bold"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyInlineFormatting('bold')}
            >
              B
            </button>
            <button
              type="button"
              className="formatting-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyInlineFormatting('italic')}
            >
              I
            </button>
            <button
              type="button"
              className="formatting-item is-strike"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyInlineFormatting('strikeThrough')}
            >
              S
            </button>
            <button
              type="button"
              className="formatting-item is-underline"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyInlineFormatting('underline')}
            >
              U
            </button>
            <button
              type="button"
              className="formatting-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={applyLinkFormatting}
            >
              Link
            </button>
            <span className="formatting-divider" aria-hidden="true" />
            <button
              type="button"
              className="formatting-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyBlockFormatting('formatBlock')}
            >
              H1
            </button>
            <button
              type="button"
              className="formatting-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyBlockFormatting('insertUnorderedList')}
            >
              List
            </button>
            <button
              type="button"
              className="formatting-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyBlockFormatting('insertOrderedList')}
            >
              1.
            </button>
          </div>
        ) : null}
        <main className="editor-shell">
          <div
            ref={editorRef}
            className="editor"
            contentEditable
            role="textbox"
            aria-multiline="true"
            suppressContentEditableWarning
            onInput={(event) => handleContentChange((event.target as HTMLDivElement).innerHTML)}
            onFocus={() => setUiVisible(true)}
          />
        </main>
        {uiVisible && !isPaletteOpen && (
          <div className="writing-stats">
            {writingStats.wordCount.toLocaleString()} words · {writingStats.readingTimeLabel}
          </div>
        )}
        <CalendarDrawer
          isOpen={isCalendarOpen}
          selectedDate={selectedDate}
          hasContentMap={hasContentMap}
          canInstallApp={canInstallApp}
          onInstallApp={() => {
            void handleInstallApp()
          }}
          onSelectDate={(dateKey) => {
            void handleSelectDate(dateKey)
          }}
          themePreference={themePreference}
          onToggleTheme={() => {
            void handleToggleTheme()
          }}
          onClose={handleCloseCalendar}
        />

        <CommandPalette
          isOpen={isPaletteOpen}
          initialMode={paletteInitialMode}
          notes={notes}
          currentNoteId={currentNoteId}
          onClose={() => {
            setIsPaletteOpen(false)
            setPaletteInitialMode('default')
          }}
          onSelectNote={handleSelectNote}
          onDeleteNote={handleDeleteNote}
          onExportCurrent={handleExportCurrent}
          onExportAll={handleExportAll}
          onImportMerge={handleImportMerge}
          onImportReplace={handleImportReplace}
          getTitle={deriveTitle}
        />
      </div>
    </ErrorBoundary>
  )
}
