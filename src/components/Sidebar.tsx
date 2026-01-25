import type { Note } from '../types'

const formatDate = (value: number) =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))

export const Sidebar = ({
  notes,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  search,
  onSearch,
  view,
  onViewChange,
}: {
  notes: Note[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  search: string
  onSearch: (value: string) => void
  view: 'notes' | 'trash'
  onViewChange: (value: 'notes' | 'trash') => void
}) => {
  return (
    <aside className="sidebar" aria-label="Notes">
      <div className="sidebar__header">
        <div className="brand">
          <span className="brand__dot" aria-hidden="true" />
          <div>
            <p className="brand__title">Notes Studio</p>
            <p className="brand__subtitle">Local-first writing</p>
          </div>
        </div>
        <button type="button" className="button button--primary" onClick={onCreate}>
          New note
        </button>
      </div>

      <div className="sidebar__search">
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
        />
      </div>

      <div className="sidebar__tabs" role="tablist" aria-label="Note views">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'notes'}
          className={view === 'notes' ? 'is-active' : ''}
          onClick={() => onViewChange('notes')}
        >
          Notes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'trash'}
          className={view === 'trash' ? 'is-active' : ''}
          onClick={() => onViewChange('trash')}
        >
          Trash
        </button>
      </div>

      <div className="note-list" role="list">
        {notes.length === 0 ? (
          <div className="note-empty">
            <p className="note-empty__title">Nothing here yet</p>
            <p className="note-empty__subtitle">
              {view === 'trash'
                ? 'Trash is empty. Deleted notes show up here.'
                : 'Create a new note to get started.'}
            </p>
          </div>
        ) : (
          notes.map((note) => (
            <div
              role="listitem"
              key={note.id}
              className={`note-card ${note.id === activeId ? 'is-active' : ''}`}
            >
              <button
                type="button"
                className="note-card__main"
                onClick={() => onSelect(note.id)}
              >
                <div>
                  <p className="note-card__title">{note.title || 'Untitled note'}</p>
                  <p className="note-card__meta">Last edit {formatDate(note.updatedAt)}</p>
                  {note.tags.length > 0 && (
                    <div className="note-card__tags" aria-label="Tags">
                      {note.tags.map((tag) => (
                        <span key={tag} className="note-card__tag">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
              {view === 'notes' ? (
                <span className="note-card__status">Active</span>
              ) : (
                <button
                  type="button"
                  className="note-card__delete"
                  onClick={() => onDelete(note.id)}
                >
                  Delete
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
