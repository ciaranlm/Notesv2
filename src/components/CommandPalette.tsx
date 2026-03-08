import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Note } from '../storage/types'
import { getPlainTextFromContent } from '../utils/content'
import './CommandPalette.css'

export type CommandPaletteMode = 'default' | 'import-choice' | 'replace-confirm'

export type CommandPaletteProps = {
  isOpen: boolean
  notes: Note[]
  currentNoteId: string | null
  initialMode?: CommandPaletteMode
  onClose: () => void
  onSelectNote: (id: string) => void
  onImportMerge: (notes: Note[]) => void
  onImportReplace: (notes: Note[]) => void
  getTitle: (note: Note) => string
}

type Mode = CommandPaletteMode

type ListItem =
  | { type: 'action'; id: string; label: string; hint?: string; action: () => void }
  | { type: 'note'; id: string; note: Note; titleMatch?: HighlightMatch; snippet?: HighlightMatch }

type HighlightMatch = {
  before: string
  match: string
  after: string
}

type RankedNote = {
  note: Note
  title: string
  bodyText: string
  score: number
  titleMatch?: HighlightMatch
  snippet?: HighlightMatch
}

const normalize = (value: string) => value.trim().toLowerCase()

const fuzzyScore = (text: string, query: string) => {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  if (!lowerText || !lowerQuery) return null

  const exactIndex = lowerText.indexOf(lowerQuery)
  if (exactIndex >= 0) {
    return {
      score: 220 - Math.min(exactIndex, 40),
      start: exactIndex,
      end: exactIndex + lowerQuery.length,
    }
  }

  let textIndex = 0
  const positions: number[] = []
  for (const character of lowerQuery) {
    const found = lowerText.indexOf(character, textIndex)
    if (found < 0) return null
    positions.push(found)
    textIndex = found + 1
  }

  const start = positions[0]
  const end = positions[positions.length - 1] + 1
  const gaps = positions.slice(1).reduce((sum, pos, index) => sum + (pos - positions[index] - 1), 0)
  const compactnessPenalty = Math.min(gaps, 30)
  const spreadPenalty = Math.min(end - start - lowerQuery.length, 30)
  return {
    score: 130 - compactnessPenalty - spreadPenalty - Math.min(start, 30),
    start,
    end,
  }
}

const toHighlight = (text: string, start: number, end: number): HighlightMatch => ({
  before: text.slice(0, start),
  match: text.slice(start, end),
  after: text.slice(end),
})

const buildSnippet = (text: string, start: number, end: number): HighlightMatch => {
  const context = 44
  const snippetStart = Math.max(0, start - context)
  const snippetEnd = Math.min(text.length, end + context)
  const beforeRaw = text.slice(snippetStart, start)
  const afterRaw = text.slice(end, snippetEnd)
  return {
    before: snippetStart > 0 ? `…${beforeRaw}` : beforeRaw,
    match: text.slice(start, end),
    after: snippetEnd < text.length ? `${afterRaw}…` : afterRaw,
  }
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
  onImportMerge,
  onImportReplace,
  getTitle,
}: CommandPaletteProps) => {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>('default')
  const [selectedIndex, setSelectedIndex] = useState(0)
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
      setConfirmValue('')
      setImportNotes(null)
      setImportError(null)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen, initialMode])

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [mode, isOpen])

  const normalizedQuery = useMemo(() => normalize(query), [query])

  const rankedNotes = useMemo<RankedNote[]>(() => {
    const prepared = notes.map((note) => {
      const title = getTitle(note)
      const bodyText = getPlainTextFromContent(note.content)
      return { note, title, bodyText }
    })

    if (!normalizedQuery) {
      return prepared.slice(0, 24).map(({ note, title, bodyText }) => ({ note, title, bodyText, score: 0 }))
    }

    const ranked: RankedNote[] = []
    for (const candidate of prepared) {
      const titleFuzzy = fuzzyScore(candidate.title, normalizedQuery)
      const bodyFuzzy = fuzzyScore(candidate.bodyText, normalizedQuery)
      if (!titleFuzzy && !bodyFuzzy) continue

      const hasExactTitle = candidate.title.toLowerCase() === normalizedQuery
      const score = hasExactTitle
        ? 10_000
        : titleFuzzy
          ? 6_000 + titleFuzzy.score
          : 1_000 + (bodyFuzzy?.score ?? 0)

      ranked.push({
        note: candidate.note,
        title: candidate.title,
        bodyText: candidate.bodyText,
        score,
        titleMatch: titleFuzzy ? toHighlight(candidate.title, titleFuzzy.start, titleFuzzy.end) : undefined,
        snippet: bodyFuzzy ? buildSnippet(candidate.bodyText, bodyFuzzy.start, bodyFuzzy.end) : undefined,
      })
    }

    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.note.updatedAt - a.note.updatedAt
    })

    return ranked.slice(0, 40)
  }, [notes, getTitle, normalizedQuery])

  const items = useMemo<ListItem[]>(() => {
    const actions: ListItem[] = normalizedQuery
      ? []
      : [
          {
            type: 'action',
            id: 'import',
            label: 'Import notes (.json)',
            action: () => fileInputRef.current?.click(),
          },
        ]

    const noteItems: ListItem[] = rankedNotes.map((result) => ({
      type: 'note',
      id: result.note.id,
      note: result.note,
      titleMatch: result.titleMatch,
      snippet: result.snippet,
    }))

    return [...actions, ...noteItems]
  }, [normalizedQuery, rankedNotes])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, mode])

  if (!isOpen) return null

  const handleSelect = (item: ListItem) => {
    if (item.type === 'action') {
      item.action()
      onClose()
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
        setImportNotes(null)
        setImportError(null)
        return
      }
      onClose()
    }
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

  const emptyMessage = normalizedQuery ? 'No matching notes. Try a different keyword.' : 'No notes yet.'

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        {mode === 'default' && (
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search notes..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
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
                      {item.titleMatch ? (
                        <>
                          {item.titleMatch.before}
                          <mark>{item.titleMatch.match}</mark>
                          {item.titleMatch.after}
                        </>
                      ) : (
                        title
                      )}
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
            {items.length === 0 && <li className="palette-empty">{emptyMessage}</li>}
          </ul>
        )}
        {mode === 'default' && (
          <div className="palette-footer">↑↓ navigate · Enter open · Esc close</div>
        )}
      </div>
    </div>
  )
}
