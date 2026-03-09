import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Note } from '../storage/types'
import { getPlainTextFromContent } from '../utils/content'
import './CommandPalette.css'

export type CommandPaletteProps = {
  isOpen: boolean
  notes: Note[]
  currentNoteId: string | null
  onClose: () => void
  onSelectNote: (id: string) => void
  getTitle: (note: Note) => string
}

type ListItem = { id: string; note: Note; titleMatch?: HighlightMatch; snippet?: HighlightMatch }

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

export const CommandPalette = ({
  isOpen,
  notes,
  currentNoteId,
  onClose,
  onSelectNote,
  getTitle,
}: CommandPaletteProps) => {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  const normalizedQuery = useMemo(() => normalize(query), [query])

  const rankedNotes = useMemo<RankedNote[]>(() => {
    const prepared = notes.map((note) => {
      const title = getTitle(note)
      const bodyText = getPlainTextFromContent(note.content)
      return { note, title, bodyText }
    })

    if (!normalizedQuery) return []

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
    const noteItems: ListItem[] = rankedNotes.map((result) => ({
      id: result.note.id,
      note: result.note,
      titleMatch: result.titleMatch,
      snippet: result.snippet,
    }))

    return noteItems
  }, [rankedNotes])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  if (!isOpen) return null

  const handleSelect = (item: ListItem) => {
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
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = items[selectedIndex]
      if (item) {
        handleSelect(item)
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  const emptyMessage = normalizedQuery ? 'No matching notes. Try a different keyword.' : 'Type to search notes.'

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search notes..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <ul className="palette-list">
          {items.map((item, index) => {
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
        <div className="palette-footer">↑↓ navigate · Enter open · Esc close</div>
      </div>
    </div>
  )
}
