import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Note, ThemePreference } from '../storage/types'
import './CommandPalette.css'

export type CommandPaletteMode = 'default' | 'rename' | 'confirm-delete' | 'import-choice' | 'replace-confirm'

export type CommandPaletteProps = {
  isOpen: boolean
  notes: Note[]
  currentNoteId: string | null
  initialMode?: CommandPaletteMode
  onClose: () => void
  onSelectNote: (id: string) => void
  onNewNote: () => void
  onRenameNote: (id: string, title: string | undefined) => void
  onDeleteNote: (id: string) => void
  onExportCurrent: () => void
  onExportAll: () => void
  onImportMerge: (notes: Note[]) => void
  onImportReplace: (notes: Note[]) => void
  onToggleTheme: () => void
  themePreference: ThemePreference
  getTitle: (note: Note) => string
}

type Mode = CommandPaletteMode

type ListItem =
  | { type: 'action'; id: string; label: string; hint?: string; action: () => void }
  | { type: 'note'; id: string; note: Note; snippet?: Snippet }

type Snippet = {
  before: string
  match: string
  after: string
}

const tokenize = (value: string) => value.toLowerCase().split(/\s+/).filter(Boolean)

const matchTokens = (text: string, tokens: string[]) => {
  const lower = text.toLowerCase()
  return tokens.every((token) => lower.includes(token))
}

const findSnippet = (content: string, tokens: string[]): Snippet | undefined => {
  if (tokens.length === 0) return undefined
  const lower = content.toLowerCase()
  let index = -1
  let tokenMatch = ''
  for (const token of tokens) {
    const found = lower.indexOf(token)
    if (found >= 0) {
      index = found
      tokenMatch = token
      break
    }
  }
  if (index < 0) return undefined
  const start = Math.max(0, index - 36)
  const end = Math.min(content.length, index + tokenMatch.length + 36)
  const before = content.slice(start, index)
  const match = content.slice(index, index + tokenMatch.length)
  const after = content.slice(index + tokenMatch.length, end)
  return { before, match, after }
}

const parseImportedNotes = (data: unknown): Note[] => {
  if (!data) return []
  if (Array.isArray(data)) {
    return data.filter((note): note is Note => typeof note?.id === 'string')
  }
  if (typeof data === 'object' && data !== null && 'notes' in data) {
    const notes = (data as { notes: unknown }).notes
    if (Array.isArray(notes)) {
      return notes.filter((note): note is Note => typeof note?.id === 'string')
    }
  }
  return []
}

export const CommandPalette = ({
  isOpen,
  notes,
  currentNoteId,
  initialMode = 'default',
  onClose,
  onSelectNote,
  onNewNote,
  onRenameNote,
  onDeleteNote,
  onExportCurrent,
  onExportAll,
  onImportMerge,
  onImportReplace,
  onToggleTheme,
  themePreference,
  getTitle,
}: CommandPaletteProps) => {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>('default')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [renameValue, setRenameValue] = useState('')
  const [confirmValue, setConfirmValue] = useState('')
  const [importNotes, setImportNotes] = useState<Note[] | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setMode(initialMode)
      setSelectedIndex(0)
      setRenameValue('')
      setConfirmValue('')
      setImportNotes(null)
      setImportError(null)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [mode, isOpen])

  const tokens = useMemo(() => tokenize(query), [query])

  const filteredNotes = useMemo(() => {
    if (tokens.length === 0) return notes
    return notes.filter((note) => {
      const title = getTitle(note)
      return matchTokens(`${title} ${note.content}`, tokens)
    })
  }, [notes, tokens, getTitle])

  const items = useMemo<ListItem[]>(() => {
    const actions: ListItem[] = [
      { type: 'action', id: 'new', label: 'New note', hint: 'Cmd/Ctrl+N', action: onNewNote },
      {
        type: 'action',
        id: 'rename',
        label: 'Rename current note',
        action: () => setMode('rename'),
      },
      {
        type: 'action',
        id: 'delete',
        label: 'Delete current note',
        hint: 'Cmd/Ctrl+Shift+Backspace',
        action: () => setMode('confirm-delete'),
      },
      { type: 'action', id: 'export-current', label: 'Export current note (.txt)', action: onExportCurrent },
      { type: 'action', id: 'export-all', label: 'Export all notes (.json)', action: onExportAll },
      {
        type: 'action',
        id: 'import',
        label: 'Import notes (.json)',
        action: () => fileInputRef.current?.click(),
      },
      {
        type: 'action',
        id: 'theme',
        label: `Theme: ${themePreference}`,
        action: onToggleTheme,
      },
    ]

    const noteItems: ListItem[] = filteredNotes.map((note) => ({
      type: 'note',
      id: note.id,
      note,
      snippet: findSnippet(note.content, tokens),
    }))

    return [...actions, ...noteItems]
  }, [filteredNotes, onNewNote, onExportAll, onExportCurrent, onToggleTheme, themePreference, tokens])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, mode])

  if (!isOpen) return null

  const activeNote = notes.find((note) => note.id === currentNoteId)

  const handleSelect = (item: ListItem) => {
    if (item.type === 'action') {
      item.action()
      if (item.id === 'new') {
        onClose()
      }
      return
    }
    onSelectNote(item.id)
    onClose()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    }
    if (event.key === 'Enter' && mode === 'default') {
      event.preventDefault()
      const item = items[selectedIndex]
      if (item) {
        handleSelect(item)
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (mode !== 'default') {
        setMode('default')
        setConfirmValue('')
        setRenameValue('')
        setImportNotes(null)
        setImportError(null)
        return
      }
      onClose()
    }
  }

  const handleRenameSubmit = () => {
    if (!activeNote) return
    const value = renameValue.trim()
    onRenameNote(activeNote.id, value.length ? value : undefined)
    onClose()
  }

  const handleDeleteSubmit = () => {
    if (!activeNote) return
    if (confirmValue.trim().toUpperCase() !== 'DELETE') return
    onDeleteNote(activeNote.id)
    onClose()
  }

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const imported = parseImportedNotes(parsed)
      if (imported.length === 0) {
        setImportError('No valid notes found in file.')
        return
      }
      setImportNotes(imported)
      setMode('import-choice')
    } catch {
      setImportError('Could not read this file.')
    } finally {
      event.target.value = ''
    }
  }

  const handleImportMerge = () => {
    if (!importNotes) return
    onImportMerge(importNotes)
    onClose()
  }

  const handleImportReplace = () => {
    setMode('replace-confirm')
    setConfirmValue('')
  }

  const handleReplaceConfirm = () => {
    if (!importNotes) return
    if (confirmValue.trim().toUpperCase() !== 'REPLACE') return
    onImportReplace(importNotes)
    onClose()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        {mode === 'default' && (
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search notes or run a command..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
        {mode === 'rename' && (
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Rename note"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleRenameSubmit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setMode('default')
              }
            }}
          />
        )}
        {mode === 'confirm-delete' && (
          <div className="palette-confirm">
            <div className="palette-confirm__title">Type DELETE to confirm</div>
            <input
              ref={inputRef}
              className="palette-input"
              placeholder="DELETE"
              value={confirmValue}
              onChange={(event) => setConfirmValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleDeleteSubmit()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setMode('default')
                }
              }}
            />
          </div>
        )}
        {mode === 'import-choice' && (
          <div className="palette-confirm">
            <div className="palette-confirm__title">
              Import {importNotes?.length ?? 0} notes
            </div>
            <div className="palette-actions">
              <button type="button" onClick={handleImportMerge}>
                Merge
              </button>
              <button type="button" onClick={handleImportReplace}>
                Replace all
              </button>
            </div>
          </div>
        )}
        {mode === 'replace-confirm' && (
          <div className="palette-confirm">
            <div className="palette-confirm__title">Type REPLACE to confirm overwrite</div>
            <input
              ref={inputRef}
              className="palette-input"
              placeholder="REPLACE"
              value={confirmValue}
              onChange={(event) => setConfirmValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleReplaceConfirm()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setMode('default')
                }
              }}
            />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="palette-file"
          onChange={handleImportChange}
        />
        {importError && <div className="palette-error">{importError}</div>}
        {mode === 'default' && (
          <ul className="palette-list">
            {items.map((item, index) => {
              if (item.type === 'action') {
                return (
                  <li
                    key={item.id}
                    className={`palette-item ${index === selectedIndex ? 'is-active' : ''}`}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => handleSelect(item)}
                  >
                    <span>{item.label}</span>
                    {item.hint && <span className="palette-hint">{item.hint}</span>}
                  </li>
                )
              }
              const title = getTitle(item.note)
              return (
                <li
                  key={item.note.id}
                  className={`palette-item ${index === selectedIndex ? 'is-active' : ''}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => handleSelect(item)}
                >
                  <div className="palette-note">
                    <div className="palette-note__title">
                      {title}
                      {item.note.id === currentNoteId && <span className="palette-note__current">Current</span>}
                    </div>
                    {item.snippet && (
                      <div className="palette-note__snippet">
                        {item.snippet.before}
                        <mark>{item.snippet.match}</mark>
                        {item.snippet.after}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
            {items.length === 0 && <li className="palette-empty">No results.</li>}
          </ul>
        )}
        {mode === 'default' && (
          <div className="palette-footer">Esc to close · Enter to select</div>
        )}
      </div>
    </div>
  )
}
