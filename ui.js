const App = () => (
  <React.Fragment>
    <div id="app" className="app">
      <aside className="sidebar" aria-label="Notes sidebar">
        <div className="sidebar__top">
          <button id="new-note" className="btn btn--primary" type="button">
            New Note
          </button>
          <div className="search">
            <label className="sr-only" htmlFor="search-input">
              Search notes
            </label>
            <input
              id="search-input"
              className="input"
              type="search"
              placeholder="Search"
              autoComplete="off"
              spellCheck="false"
            />
          </div>
          <div id="intent-filters" className="intent-filters" role="group" aria-label="Filter by intent"></div>
          <div className="sidebar__stats">
            <button id="filter-open-questions" className="stat-pill" type="button" aria-pressed="false">
              Open questions (<span id="open-questions-count">0</span>)
            </button>
            <button id="filter-actions" className="stat-pill" type="button" aria-pressed="false">
              Actions mentioned (<span id="actions-count">0</span>)
            </button>
          </div>
          <div className="sidebar__toggles" role="group" aria-label="Views">
            <button id="view-notes" className="segmented is-active" type="button" aria-pressed="true">
              Notes
            </button>
            <button id="view-trash" className="segmented" type="button" aria-pressed="false">
              Trash
            </button>
          </div>
        </div>
        <div id="notes-list" className="notes-list" role="listbox" aria-label="Notes list"></div>
        <div className="sidebar__bottom">
          <button id="open-settings" className="btn btn--ghost" type="button">
            Settings
          </button>
        </div>
      </aside>

      <main className="main" aria-live="polite">
        <header className="main__header">
          <div className="main__header-row">
            <button id="back-button" className="btn btn--ghost back-button" type="button" aria-label="Back to notes">
              ← Back
            </button>
            <input
              id="title-input"
              className="title-input"
              type="text"
              placeholder="Untitled"
              autoComplete="off"
              spellCheck="false"
              aria-label="Note title"
            />
          </div>
          <div className="main__controls-row">
            <label className="intent-select" htmlFor="intent-select">
              <span className="intent-select__label">Intent</span>
              <select id="intent-select" className="select">
                <option value="">None</option>
              </select>
            </label>
            <label className="thinking-select" htmlFor="thinking-select">
              <span className="intent-select__label">Thinking</span>
              <select id="thinking-select" className="select">
                <option value="">Off</option>
                <option value="15">15m</option>
                <option value="30">30m</option>
                <option value="60">60m</option>
              </select>
            </label>
            <div id="thinking-timer" className="thinking-timer" aria-live="polite" hidden></div>
            <div className="main__spacer" aria-hidden="true"></div>
            <button id="mark-decision" className="btn btn--ghost btn--small" type="button">
              Mark as Decision
            </button>
          </div>
          <div id="thinking-prompt" className="thinking-prompt" role="status" hidden>
            <span>Capture takeaway?</span>
            <div className="thinking-prompt__actions">
              <button id="capture-takeaway" className="btn btn--ghost btn--small" type="button">
                Capture
              </button>
              <button id="dismiss-takeaway" className="btn btn--ghost btn--small" type="button">
                Dismiss
              </button>
            </div>
          </div>
          <div className="main__meta-row">
            <div id="last-edited" className="last-edited" aria-live="polite"></div>
            <div className="actions" role="toolbar" aria-label="Note actions">
              <button
                id="restore-note"
                className="icon-btn"
                type="button"
                title="Restore note"
                aria-label="Restore note"
                hidden
              >
                Restore
              </button>
              <button id="pin-note" className="icon-btn" type="button" title="Pin note" aria-label="Pin note">
                📌
              </button>
              <button id="duplicate-note" className="icon-btn" type="button" title="Duplicate note" aria-label="Duplicate note">
                ⧉
              </button>
              <div className="export-menu">
                <button
                  id="export-toggle"
                  className="icon-btn"
                  type="button"
                  aria-haspopup="true"
                  aria-expanded="false"
                  title="Export"
                >
                  Export ▾
                </button>
                <div id="export-panel" className="export-panel" role="menu" hidden>
                  <button className="export-item" type="button" role="menuitem" data-export="prd">
                    Export for PRD
                  </button>
                  <button className="export-item" type="button" role="menuitem" data-export="jira">
                    Export for Jira
                  </button>
                  <button className="export-item" type="button" role="menuitem" data-export="slides">
                    Export for Slides
                  </button>
                </div>
              </div>
              <button id="delete-note" className="icon-btn danger" type="button" title="Delete note" aria-label="Delete note">
                🗑
              </button>
            </div>
          </div>
          <div id="formatting-toolbar" className="toolbar" role="toolbar" aria-label="Formatting">
            <button className="tool-btn" type="button" data-command="bold" aria-label="Bold">
              <strong>B</strong>
            </button>
            <button className="tool-btn" type="button" data-command="italic" aria-label="Italic">
              <em>I</em>
            </button>
            <button className="tool-btn" type="button" data-command="underline" aria-label="Underline">
              <u>U</u>
            </button>
            <span className="toolbar__divider" aria-hidden="true"></span>
            <button className="tool-btn" type="button" data-command="insertUnorderedList" aria-label="Bulleted list">
              • List
            </button>
            <button className="tool-btn" type="button" data-command="insertOrderedList" aria-label="Numbered list">
              1. List
            </button>
            <button className="tool-btn" type="button" data-command="checkbox" aria-label="Checkbox list">
              ☑︎
            </button>
            <span className="toolbar__divider" aria-hidden="true"></span>
            <button id="insert-evidence" className="tool-btn tool-btn--evidence" type="button" aria-label="Evidence block">
              Evidence
            </button>
          </div>
        </header>

        <section className="editor-shell">
          <div id="editor" className="editor" contentEditable="true" role="textbox" aria-multiline="true"></div>
          <div id="empty-state" className="empty-state" hidden>
            <h2>No note selected</h2>
            <p>Create a new note to get started.</p>
          </div>
        </section>
      </main>
    </div>

    <div id="toast" className="toast" role="status" aria-live="polite" hidden></div>

    <div id="settings-modal" className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" hidden>
      <div className="modal__backdrop" data-close-modal="true"></div>
      <div className="modal__panel" role="document">
        <header className="modal__header">
          <h2 id="settings-title">Settings</h2>
          <button className="icon-btn" type="button" data-close-modal="true" aria-label="Close settings">
            ✕
          </button>
        </header>
        <div className="modal__body">
          <label className="toggle">
            <input id="confirm-delete" type="checkbox" />
            <span>Confirm before delete</span>
          </label>
          <label className="toggle">
            <input id="paste-plain" type="checkbox" />
            <span>Paste as plain text</span>
          </label>
        </div>
      </div>
    </div>

    <template id="note-row-template">
      <button className="note-row" type="button" role="option">
        <div className="note-row__title-line">
          <div className="note-row__title"></div>
          <span className="note-row__intent" hidden></span>
        </div>
        <div className="note-row__snippet"></div>
        <div className="note-row__meta">
          <span className="note-row__date"></span>
          <span className="note-row__pin" aria-hidden="true">
            📌
          </span>
        </div>
      </button>
    </template>
  </React.Fragment>
);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
