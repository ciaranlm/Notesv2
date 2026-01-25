import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { marked } from 'marked'
import TurndownService from 'turndown'

import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { SlashCommands } from './extensions/slashCommands'
import type { Note, ThemeMode } from './types'
import { loadActiveId, loadNotes, loadTheme, saveActiveId, saveNotes, saveTheme } from './utils/storage'
import { extractTags, stripHtml } from './utils/tagging'

const turndownService = new TurndownService({ codeBlockStyle: 'fenced' })

const createId = () => {
  if (crypto?.randomUUID) return crypto.randomUUID()
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const createNote = (title = 'Untitled note'): Note => {
  const now = Date.now()
  return {
    id: createId(),
    title,
    content: '<p></p>',
    tags: extractTags(title),
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  }
}

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    const listener = () => setMatches(media.matches)
    listener()
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

const downloadFile = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const App = () => {
  const [notes, setNotes] = useState<Note[]>(() => {
    const stored = loadNotes()
    if (stored.length > 0) return stored
    return [createNote('Welcome')]
  })
  const [activeId, setActiveId] = useState<string | null>(() => {
    const stored = loadActiveId()
    if (stored) return stored
    return notes[0]?.id ?? null
  })
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'notes' | 'trash'>('notes')
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme())
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [isRenaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [zenMode, setZenMode] = useState(false)
  const [statusMessage, setStatusMessage] = useState('All changes saved locally')
  const autosaveTimer = useRef<number | null>(null)
  const importRef = useRef<HTMLInputElement | null>(null)
  const isCompact = useMediaQuery('(max-width: 720px)')
  const isDrawer = useMediaQuery('(max-width: 900px)')

  const activeNote = notes.find((note) => note.id === activeId) ?? null

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Placeholder.configure({
        placeholder: 'Start writing, the canvas is yours...',
      }),
      SlashCommands,
    ],
    content: activeNote?.content ?? '<p></p>',
    autofocus: 'start',
    onUpdate: ({ editor }) => {
      if (!activeId) return
      const html = editor.getHTML()
      setStatusMessage('Saving...')
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = window.setTimeout(() => {
        setNotes((prev) =>
          prev.map((note) =>
            note.id === activeId
              ? {
                  ...note,
                  content: html,
                  tags: extractTags(`${note.title} ${html}`),
                  updatedAt: Date.now(),
                }
              : note,
          ),
        )
        setStatusMessage('All changes saved locally')
      }, 400)
    },
  })

  useEffect(() => {
    saveNotes(notes)
  }, [notes])

  useEffect(() => {
    saveActiveId(activeId)
  }, [activeId])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!activeNote) return
    const current = editor?.getHTML() ?? ''
    if (current !== activeNote.content) {
      editor?.commands.setContent(activeNote.content, false)
    }
    setDraftTitle(activeNote.title)
  }, [activeNote, editor])

  useEffect(() => {
    if (!isDrawer) setSidebarOpen(false)
  }, [isDrawer])

  useEffect(() => {
    if (activeId) return
    const next = notes.find((note) => !note.trashedAt)
    if (next) setActiveId(next.id)
  }, [activeId, notes])


  const handleCreateNote = useCallback(() => {
    const newNote = createNote('New note')
    setNotes((prev) => [newNote, ...prev])
    setActiveId(newNote.id)
    setView('notes')
    if (isDrawer) setSidebarOpen(false)
  }, [isDrawer])

  const handleSelectNote = useCallback(
    (id: string) => {
      setActiveId(id)
      if (isDrawer) setSidebarOpen(false)
    },
    [isDrawer],
  )

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        handleCreateNote()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleCreateNote])

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const tagMatches = Array.from(query.matchAll(/#([a-z0-9-]+)/g), (match) => match[1])
    const textQuery = query.replace(/#([a-z0-9-]+)/g, '').trim()
    return notes
      .filter((note) => (view === 'trash' ? note.trashedAt : !note.trashedAt))
      .filter((note) => {
        if (!query) return true
        const noteTags = note.tags.map((tag) => tag.toLowerCase())
        const matchesTagFilter =
          tagMatches.length === 0 || tagMatches.every((tag) => noteTags.includes(tag))
        if (!matchesTagFilter) return false
        if (!textQuery) return true
        return (
          note.title.toLowerCase().includes(textQuery) ||
          stripHtml(note.content).toLowerCase().includes(textQuery) ||
          noteTags.some((tag) => tag.includes(textQuery))
        )
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [notes, search, view])

  useEffect(() => {
    if (view === 'trash' && activeNote && !activeNote.trashedAt) {
      setActiveId(filteredNotes[0]?.id ?? null)
    }
    if (view === 'notes' && activeNote?.trashedAt) {
      setActiveId(filteredNotes[0]?.id ?? null)
    }
  }, [activeNote, filteredNotes, view])

  const handleRename = () => {
    if (!activeNote) return
    const title = draftTitle.trim() || 'Untitled note'
    setNotes((prev) =>
      prev.map((note) =>
        note.id === activeNote.id
          ? { ...note, title, tags: extractTags(`${title} ${note.content}`) }
          : note,
      ),
    )
    setRenaming(false)
  }

  const handleDelete = (id: string) => {
    setNotes((prev) =>
      prev.map((note) => (note.id === id ? { ...note, trashedAt: Date.now() } : note)),
    )
    if (activeId === id) {
      const remaining = notes.find((note) => note.id !== id && !note.trashedAt)
      setActiveId(remaining?.id ?? null)
    }
  }

  const handleRestore = (id: string) => {
    setNotes((prev) =>
      prev.map((note) => (note.id === id ? { ...note, trashedAt: null } : note)),
    )
    setView('notes')
  }

  const handlePurge = (id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id))
    if (activeId === id) {
      const remaining = notes.find((note) => note.id !== id && !note.trashedAt)
      setActiveId(remaining?.id ?? null)
    }
  }

  const handleExport = (format: 'markdown' | 'html') => {
    if (!editor || !activeNote) return
    if (format === 'html') {
      const html = editor.getHTML()
      downloadFile(html, `${activeNote.title || 'note'}.html`, 'text/html')
      return
    }
    const markdown = turndownService.turndown(editor.getHTML())
    downloadFile(markdown, `${activeNote.title || 'note'}.md`, 'text/markdown')
  }

  const handleImport = async (file: File) => {
    const text = await file.text()
    const html = await marked.parse(text)
    if (!editor || !activeNote) return
    editor.commands.setContent(html, false)
    setNotes((prev) =>
      prev.map((note) =>
        note.id === activeNote.id
          ? {
              ...note,
              content: html,
              tags: extractTags(`${note.title} ${html}`),
              updatedAt: Date.now(),
            }
          : note,
      ),
    )
  }

  return (
    <div className={`app ${zenMode ? 'is-zen' : ''}`}>
      <header className="topbar">
        <div className="topbar__left">
          {isDrawer && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
          )}
          <div className="topbar__title">
            <span>Editor</span>
            <small>{statusMessage}</small>
          </div>
        </div>
        <div className="topbar__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setZenMode((prev) => !prev)}
          >
            {zenMode ? 'Exit zen' : 'Zen mode'}
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
        </div>
      </header>

      <div className="shell">
        {!zenMode && (
          <div className={`sidebar-wrapper ${isSidebarOpen ? 'is-open' : ''}`}>
            <Sidebar
              notes={filteredNotes}
              activeId={activeId}
              onSelect={handleSelectNote}
              onCreate={handleCreateNote}
              onDelete={handlePurge}
              search={search}
              onSearch={setSearch}
              view={view}
              onViewChange={setView}
            />
            {isDrawer && (
              <button
                type="button"
                className="sidebar-overlay"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
              />
            )}
          </div>
        )}

        <main className="editor-area">
          <div className="editor-surface">
            <div className="editor-header">
              <input
                className="title-input"
                value={activeNote?.title ?? ''}
                onChange={(event) => {
                  const value = event.target.value
                  if (!activeNote) return
                  setNotes((prev) =>
                    prev.map((note) =>
                      note.id === activeNote.id
                        ? {
                            ...note,
                            title: value,
                            tags: extractTags(`${value} ${note.content}`),
                            updatedAt: Date.now(),
                          }
                        : note,
                    ),
                  )
                }}
                placeholder="Untitled note"
                aria-label="Note title"
              />
              <div className="editor-actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setRenaming(true)}
                  disabled={!activeNote}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => handleExport('markdown')}
                  disabled={!activeNote}
                >
                  Export MD
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => handleExport('html')}
                  disabled={!activeNote}
                >
                  Export HTML
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => importRef.current?.click()}
                  disabled={!activeNote}
                >
                  Import MD
                </button>
                {view === 'notes' ? (
                  <button
                    type="button"
                    className="button button--danger"
                    onClick={() => activeId && handleDelete(activeId)}
                    disabled={!activeNote}
                  >
                    Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => activeId && handleRestore(activeId)}
                    disabled={!activeNote}
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>

            {editor ? (
              <Toolbar editor={editor} compact={isCompact} />
            ) : (
              <div className="toolbar toolbar--compact" aria-hidden="true" />
            )}

            <div className="editor-canvas" aria-live="polite">
              {editor ? <EditorContent editor={editor} /> : null}
            </div>
          </div>
        </main>
      </div>

      <input
        type="file"
        accept=".md,.markdown,text/markdown"
        ref={importRef}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void handleImport(file)
          }
          event.target.value = ''
        }}
      />

      {isRenaming && activeNote && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Rename note</h2>
            <p>Give this note a new title.</p>
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              aria-label="Rename note"
            />
            <div className="modal__actions">
              <button type="button" className="button button--ghost" onClick={() => setRenaming(false)}>
                Cancel
              </button>
              <button type="button" className="button button--primary" onClick={handleRename}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
