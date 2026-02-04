import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CommandPalette } from '../components/CommandPalette'
import { SaveIndicator } from '../components/SaveIndicator'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import { useHotkeys } from '../hooks/useHotkeys'
import { getStorage, sanitizeTheme } from '../storage/db'
import type { Note, ThemePreference } from '../storage/types'
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
  }
}

const deriveTitle = (note: Note) => {
  if (note.titleOverride?.trim()) return note.titleOverride.trim()
  const line = note.content.split('\n').find((value) => value.trim().length > 0)
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
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [paletteInitialMode, setPaletteInitialMode] = useState<'default' | 'confirm-delete'>('default')
  const [themePreference, setThemePreference] = useState<ThemePreference>('system')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [uiVisible, setUiVisible] = useState(false)
  const [isFormattingVisible, setIsFormattingVisible] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem('formattingVisible')
    if (stored === null) return true
    return stored === 'true'
  })
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const storageRef = useRef<Awaited<ReturnType<typeof getStorage>> | null>(null)
  const currentNoteRef = useRef<Note | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const wordCountTimeout = useRef<number | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentNote = useMemo(
    () => notes.find((note) => note.id === currentNoteId) ?? null,
    [notes, currentNoteId],
  )

  useEffect(() => {
    currentNoteRef.current = currentNote
  }, [currentNote])

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
    if (!isMenuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) {
        return
      }
      setIsMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMenuOpen])

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      const storage = await getStorage()
      if (!isMounted) return
      storageRef.current = storage
      const [storedNotes, lastOpen, storedTheme] = await Promise.all([
        storage.getAllNotes(),
        storage.getMeta('lastOpenNoteId'),
        storage.getMeta('theme'),
      ])

      const theme = sanitizeTheme(storedTheme)
      setThemePreference(theme)

      let nextNotes = storedNotes
      if (nextNotes.length === 0) {
        const newNote = createEmptyNote()
        nextNotes = [newNote]
        await storage.saveNote(newNote)
        await storage.setMeta('lastOpenNoteId', newNote.id)
        setCurrentNoteId(newNote.id)
      } else {
        const noteToOpen = nextNotes.find((note) => note.id === lastOpen) ?? nextNotes[0]
        setCurrentNoteId(noteToOpen.id)
      }

      setNotes(nextNotes.sort((a, b) => b.updatedAt - a.updatedAt))
    }

    void load()
    return () => {
      isMounted = false
    }
  }, [])

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

  const { debounced: scheduleSave, flush: flushSave } = useDebouncedCallback((note: Note) => {
    void persistNote(note)
  }, 400)

  const handleContentChange = (value: string) => {
    assert(currentNote, 'No active note')
    const updatedNote = { ...currentNote, content: value, updatedAt: now() }
    setNotes((prev) =>
      prev.map((note) => (note.id === updatedNote.id ? updatedNote : note)),
    )
    scheduleSave(updatedNote)
  }

  const applyWrapFormatting = (prefix: string, suffix = prefix, placeholder = '') => {
    const editor = editorRef.current
    if (!editor) return
    const { selectionStart, selectionEnd, value } = editor
    const selectedText = value.slice(selectionStart, selectionEnd)
    const content = selectedText || placeholder
    const replacement = `${prefix}${content}${suffix}`
    editor.setRangeText(replacement, selectionStart, selectionEnd, 'select')
    if (selectedText.length === 0 && placeholder.length === 0) {
      const cursor = selectionStart + prefix.length
      editor.setSelectionRange(cursor, cursor)
    } else {
      const rangeStart = selectionStart + prefix.length
      const rangeEnd = rangeStart + content.length
      editor.setSelectionRange(rangeStart, rangeEnd)
    }
    handleContentChange(editor.value)
    editor.focus()
  }

  const applyLinkFormatting = () => {
    const editor = editorRef.current
    if (!editor) return
    const { selectionStart, selectionEnd, value } = editor
    const selectedText = value.slice(selectionStart, selectionEnd)
    const linkText = selectedText || 'link text'
    const linkTarget = 'https://'
    const replacement = `[${linkText}](${linkTarget})`
    editor.setRangeText(replacement, selectionStart, selectionEnd, 'select')
    const urlStart = selectionStart + linkText.length + 3
    const urlEnd = urlStart + linkTarget.length
    editor.setSelectionRange(urlStart, urlEnd)
    handleContentChange(editor.value)
    editor.focus()
  }

  const applyLinePrefix = (prefix: string) => {
    const editor = editorRef.current
    if (!editor) return
    const { selectionStart, selectionEnd, value } = editor
    const blockStart = value.lastIndexOf('\n', selectionStart - 1) + 1
    const blockEndIndex = value.indexOf('\n', selectionEnd)
    const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex
    const block = value.slice(blockStart, blockEnd)
    const updated = block
      .split('\n')
      .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
      .join('\n')
    editor.setRangeText(updated, blockStart, blockEnd, 'select')
    editor.setSelectionRange(blockStart, blockStart + updated.length)
    handleContentChange(editor.value)
    editor.focus()
  }

  const handleSelectNote = async (id: string) => {
    setCurrentNoteId(id)
    const storage = storageRef.current
    if (storage) {
      await storage.setMeta('lastOpenNoteId', id)
    }
  }

  const handleNewNote = async () => {
    const storage = storageRef.current
    const newNote = createEmptyNote()
    setNotes((prev) => [newNote, ...prev])
    setCurrentNoteId(newNote.id)
    if (storage) {
      await storage.saveNote(newNote)
      await storage.setMeta('lastOpenNoteId', newNote.id)
    }
  }

  const handleRenameNote = async (id: string, titleOverride?: string) => {
    setNotes((prev) => {
      const updatedNotes = prev.map((note) =>
        note.id === id ? { ...note, titleOverride, updatedAt: now() } : note,
      )
      const updatedNote = updatedNotes.find((note) => note.id === id)
      if (updatedNote) {
        void persistNote(updatedNote)
      }
      return updatedNotes
    })
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
        }
        setCurrentNoteId(newNote.id)
        return [newNote]
      }
      if (currentNoteId === id) {
        setCurrentNoteId(remaining[0].id)
        if (storage) {
          void storage.setMeta('lastOpenNoteId', remaining[0].id)
        }
      }
      return remaining
    })
    if (storage) {
      await storage.deleteNote(id)
    }
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
    const blob = new Blob([currentNote.content], { type: 'text/plain' })
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
    const merged = mergeNotes(notes, imported)
    setNotes(merged)
    const storage = storageRef.current
    if (storage) {
      await storage.bulkSaveNotes(merged)
    }
  }

  const handleImportReplace = async (imported: Note[]) => {
    setNotes(imported)
    if (imported[0]) {
      setCurrentNoteId(imported[0].id)
    }
    const storage = storageRef.current
    if (storage) {
      await storage.clearAllNotes()
      await storage.bulkSaveNotes(imported)
      if (imported[0]) {
        await storage.setMeta('lastOpenNoteId', imported[0].id)
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
      combo: 'cmd+n',
      handler: (event) => {
        event.preventDefault()
        void handleNewNote()
      },
      allowInInput: true,
    },
    {
      combo: 'ctrl+n',
      handler: (event) => {
        event.preventDefault()
        void handleNewNote()
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

  const wordCount = useMemo(() => {
    if (!currentNote) return 0
    return currentNote.content.trim().length === 0
      ? 0
      : currentNote.content.trim().split(/\s+/).length
  }, [currentNote])

  return (
    <ErrorBoundary>
      <div className="app">
        <SaveIndicator savedAt={savedAt} />
        <div className="app-menu" ref={menuRef}>
          <button
            type="button"
            className="menu-trigger"
            aria-label="Menu"
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
            ref={menuButtonRef}
            onClick={() => setIsMenuOpen((value) => !value)}
          >
            <span aria-hidden="true">⋯</span>
          </button>
          {isMenuOpen ? (
            <div className="menu-dropdown" role="menu">
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setIsFormattingVisible((value) => !value)
                  setIsMenuOpen(false)
                  menuButtonRef.current?.focus()
                }}
              >
                Toggle formatting
              </button>
            </div>
          ) : null}
        </div>
        {isFormattingVisible ? (
          <div className="formatting-panel">
            <button
              type="button"
              className="formatting-item is-bold"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyWrapFormatting('**')}
            >
              B
            </button>
            <button
              type="button"
              className="formatting-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyWrapFormatting('*')}
            >
              I
            </button>
            <button
              type="button"
              className="formatting-item is-strike"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyWrapFormatting('~~')}
            >
              S
            </button>
            <button
              type="button"
              className="formatting-item is-underline"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyWrapFormatting('<u>', '</u>', 'underline')}
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
              onClick={() => applyLinePrefix('# ')}
            >
              H1
            </button>
            <button
              type="button"
              className="formatting-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyLinePrefix('- ')}
            >
              List
            </button>
            <button
              type="button"
              className="formatting-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyLinePrefix('1. ')}
            >
              1.
            </button>
          </div>
        ) : null}
        <main className="editor-shell">
          <textarea
            ref={editorRef}
            className="editor"
            value={currentNote?.content ?? ''}
            placeholder=""
            onChange={(event) => handleContentChange(event.target.value)}
            onFocus={() => setUiVisible(true)}
          />
        </main>
        {uiVisible && !isPaletteOpen && (
          <div className="word-count">{wordCount} words</div>
        )}
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
          onNewNote={handleNewNote}
          onRenameNote={handleRenameNote}
          onDeleteNote={handleDeleteNote}
          onExportCurrent={handleExportCurrent}
          onExportAll={handleExportAll}
          onImportMerge={handleImportMerge}
          onImportReplace={handleImportReplace}
          onToggleTheme={handleToggleTheme}
          themePreference={themePreference}
          getTitle={deriveTitle}
        />
      </div>
    </ErrorBoundary>
  )
}
