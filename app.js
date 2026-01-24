(function () {
  'use strict';

  var NOTES_KEY = 'notes.v1';
  var SETTINGS_KEY = 'notes.settings.v1';

  function uid() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function debounce(fn, wait) {
    var timeoutId = null;
    return function debounced() {
      var args = arguments;
      var ctx = this;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  function formatDate(ts) {
    var date = new Date(ts);
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(date);
    } catch (err) {
      return date.toLocaleString();
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Sanitizer that removes scripts, inline handlers, and unsafe URLs.
  function sanitizeHtml(html) {
    var template = document.createElement('template');
    template.innerHTML = html;

    var walker = document.createTreeWalker(
      template.content,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    var nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach(function (el) {
      var tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (tag === 'script' || tag === 'style' || tag === 'iframe') {
        el.remove();
        return;
      }

      var attrs = Array.prototype.slice.call(el.attributes || []);
      attrs.forEach(function (attr) {
        var name = attr.name.toLowerCase();
        var value = attr.value;
        if (name.indexOf('on') === 0) {
          el.removeAttribute(attr.name);
          return;
        }
        if ((name === 'href' || name === 'src') && /^javascript:/i.test(value)) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return template.innerHTML;
  }

  function htmlFromPlainText(text) {
    var safe = escapeHtml(text);
    var parts = safe.split(/\n/);
    return parts
      .map(function (line) {
        if (!line.trim()) {
          return '<div><br></div>';
        }
        return '<div>' + line + '</div>';
      })
      .join('');
  }

  function textFromHtml(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function snippetFromHtml(html) {
    var text = textFromHtml(html);
    if (!text) {
      return 'No additional text';
    }
    return text.length > 110 ? text.slice(0, 107) + '…' : text;
  }

  function titleFromContent(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    var lines = (div.textContent || '').split(/\n+/);
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (line) {
        return line.length > 60 ? line.slice(0, 60) : line;
      }
    }
    return '';
  }

  function downloadFile(name, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  var Store = (function () {
    function readNotes() {
      try {
        var raw = localStorage.getItem(NOTES_KEY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        return [];
      }
    }

    function writeNotes(notes) {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    }

    function readSettings() {
      var defaults = {
        confirmDelete: true,
        pastePlainText: true
      };
      try {
        var raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return defaults;
        var parsed = JSON.parse(raw) || {};
        return {
          confirmDelete:
            typeof parsed.confirmDelete === 'boolean'
              ? parsed.confirmDelete
              : defaults.confirmDelete,
          pastePlainText:
            typeof parsed.pastePlainText === 'boolean'
              ? parsed.pastePlainText
              : defaults.pastePlainText
        };
      } catch (err) {
        return defaults;
      }
    }

    function writeSettings(settings) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function makeWelcomeNote(now) {
      var welcomeHtml = [
        '<div>Welcome to your calm notes space.</div>',
        '<div><br></div>',
        '<div>• Create a new note with the “New Note” button.</div>',
        '<div>• Use ⌘/Ctrl+B, I, U for formatting.</div>',
        '<div>• Try a checklist with the ☑︎ button or type “- [ ] ”.</div>'
      ].join('');

      return {
        id: uid(),
        title: 'Welcome',
        contentHtml: welcomeHtml,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        trashed: false,
        titleManuallyEdited: true
      };
    }

    function ensureSeedData() {
      var notes = readNotes();
      if (notes.length) return notes;
      var now = Date.now();
      var seeded = [makeWelcomeNote(now)];
      writeNotes(seeded);
      return seeded;
    }

    function sortNotes(notes) {
      return notes
        .slice()
        .sort(function (a, b) {
          if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1;
          }
          return b.updatedAt - a.updatedAt;
        });
    }

    function createNote() {
      var notes = ensureSeedData();
      var now = Date.now();
      var note = {
        id: uid(),
        title: 'Untitled',
        contentHtml: '',
        createdAt: now,
        updatedAt: now,
        pinned: false,
        trashed: false,
        titleManuallyEdited: false
      };
      notes.unshift(note);
      writeNotes(notes);
      return note;
    }

    function updateNote(id, updater) {
      var notes = ensureSeedData();
      var updated = null;
      var nextNotes = notes.map(function (note) {
        if (note.id !== id) return note;
        updated = updater(note);
        return updated;
      });
      if (updated) {
        writeNotes(nextNotes);
      }
      return updated;
    }

    function duplicateNote(id) {
      var notes = ensureSeedData();
      var original = notes.find(function (n) {
        return n.id === id;
      });
      if (!original) return null;
      var now = Date.now();
      var copy = {
        id: uid(),
        title: original.title ? original.title + ' Copy' : 'Untitled Copy',
        contentHtml: original.contentHtml,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        trashed: false,
        titleManuallyEdited: true
      };
      notes.unshift(copy);
      writeNotes(notes);
      return copy;
    }

    function softDelete(id) {
      return updateNote(id, function (note) {
        return Object.assign({}, note, {
          trashed: true,
          pinned: false,
          updatedAt: Date.now()
        });
      });
    }

    function restore(id) {
      return updateNote(id, function (note) {
        return Object.assign({}, note, {
          trashed: false,
          updatedAt: Date.now()
        });
      });
    }

    function destroy(id) {
      var notes = ensureSeedData();
      var nextNotes = notes.filter(function (note) {
        return note.id !== id;
      });
      writeNotes(nextNotes);
      return nextNotes;
    }

    function togglePin(id) {
      return updateNote(id, function (note) {
        return Object.assign({}, note, {
          pinned: !note.pinned,
          updatedAt: Date.now()
        });
      });
    }

    function getAll() {
      return ensureSeedData();
    }

    return {
      getAll: getAll,
      sortNotes: sortNotes,
      createNote: createNote,
      updateNote: updateNote,
      duplicateNote: duplicateNote,
      softDelete: softDelete,
      restore: restore,
      destroy: destroy,
      togglePin: togglePin,
      readSettings: readSettings,
      writeSettings: writeSettings
    };
  })();

  var state = {
    activeNoteId: null,
    showTrash: false,
    query: '',
    settings: Store.readSettings(),
    isEditorDirty: false,
    lastSelectionIndex: -1
  };

  var el = {
    app: document.getElementById('app'),
    newNote: document.getElementById('new-note'),
    search: document.getElementById('search-input'),
    notesList: document.getElementById('notes-list'),
    noteTemplate: document.getElementById('note-row-template'),
    viewNotes: document.getElementById('view-notes'),
    viewTrash: document.getElementById('view-trash'),
    title: document.getElementById('title-input'),
    lastEdited: document.getElementById('last-edited'),
    editor: document.getElementById('editor'),
    emptyState: document.getElementById('empty-state'),
    toolbar: document.getElementById('formatting-toolbar'),
    backButton: document.getElementById('back-button'),
    restore: document.getElementById('restore-note'),
    pin: document.getElementById('pin-note'),
    duplicate: document.getElementById('duplicate-note'),
    exportHtml: document.getElementById('export-html'),
    exportTxt: document.getElementById('export-txt'),
    del: document.getElementById('delete-note'),
    modal: document.getElementById('settings-modal'),
    modalCloseTargets: document.querySelectorAll('[data-close-modal]'),
    confirmDelete: document.getElementById('confirm-delete'),
    pastePlain: document.getElementById('paste-plain'),
    openSettings: document.getElementById('open-settings')
  };

  function getNotesForView() {
    var notes = Store.getAll();
    var filtered = notes.filter(function (note) {
      return state.showTrash ? note.trashed : !note.trashed;
    });

    if (state.query.trim()) {
      var q = state.query.trim().toLowerCase();
      filtered = filtered.filter(function (note) {
        var inTitle = (note.title || '').toLowerCase().indexOf(q) !== -1;
        var inBody = textFromHtml(note.contentHtml).toLowerCase().indexOf(q) !== -1;
        return inTitle || inBody;
      });
    }

    return Store.sortNotes(filtered);
  }

  function getNoteById(id) {
    if (!id) return null;
    var notes = Store.getAll();
    for (var i = 0; i < notes.length; i += 1) {
      if (notes[i].id === id) return notes[i];
    }
    return null;
  }

  function setActiveNote(id, opts) {
    opts = opts || {};
    var note = getNoteById(id);
    if (!note) return;
    state.activeNoteId = id;
    state.isEditorDirty = false;
    renderList();
    loadNoteIntoEditor(note, { preserveFocus: opts.preserveFocus });
    if (window.matchMedia('(max-width: 760px)').matches) {
      el.app.classList.add('is-editor-view');
    }
  }

  function ensureActiveNote() {
    var notes = getNotesForView();
    if (!notes.length) {
      state.activeNoteId = null;
      renderEditorEmpty();
      renderList();
      return null;
    }
    var active = getNoteById(state.activeNoteId);
    if (!active || (state.showTrash && !active.trashed) || (!state.showTrash && active.trashed)) {
      state.activeNoteId = notes[0].id;
      active = notes[0];
    }
    return active;
  }

  function renderList() {
    var notes = getNotesForView();
    var activeId = state.activeNoteId;
    el.notesList.innerHTML = '';

    notes.forEach(function (note, index) {
      var node = el.noteTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = note.id;
      node.dataset.index = String(index);
      node.setAttribute('aria-selected', note.id === activeId ? 'true' : 'false');
      node.classList.toggle('is-active', note.id === activeId);
      node.classList.toggle('is-pinned', !!note.pinned);

      var title = note.title && note.title.trim() ? note.title.trim() : 'Untitled';
      node.querySelector('.note-row__title').textContent = title;
      node.querySelector('.note-row__snippet').textContent = snippetFromHtml(note.contentHtml);
      node.querySelector('.note-row__date').textContent = formatDate(note.updatedAt);

      node.addEventListener('click', function () {
        setActiveNote(note.id);
      });

      el.notesList.appendChild(node);
    });

    var activeIndex = notes.findIndex(function (n) {
      return n.id === state.activeNoteId;
    });
    state.lastSelectionIndex = activeIndex;
  }

  function renderEditorEmpty() {
    el.emptyState.hidden = false;
    el.editor.classList.add('hidden');
    el.title.value = '';
    el.lastEdited.textContent = '';
    updateActionState(null);
  }

  function updateActionState(note) {
    var disabled = !note;
    [el.restore, el.pin, el.duplicate, el.exportHtml, el.exportTxt, el.del].forEach(function (btn) {
      btn.disabled = disabled;
    });
    if (!note) return;
    var inTrash = !!state.showTrash;
    el.restore.hidden = !inTrash;
    el.restore.disabled = disabled || !inTrash;

    el.pin.hidden = inTrash;
    el.duplicate.hidden = inTrash;

    el.pin.textContent = note.pinned ? '📍' : '📌';
    el.pin.title = note.pinned ? 'Unpin note' : 'Pin note';
    el.pin.setAttribute('aria-label', note.pinned ? 'Unpin note' : 'Pin note');
    el.del.textContent = state.showTrash ? '␡' : '🗑';
    el.del.title = state.showTrash ? 'Delete permanently' : 'Move to trash';
    el.del.setAttribute('aria-label', el.del.title);
  }

  function loadNoteIntoEditor(note, opts) {
    opts = opts || {};
    el.emptyState.hidden = true;
    el.editor.classList.remove('hidden');

    // We only write to innerHTML when switching notes, never on each keystroke.
    el.editor.innerHTML = sanitizeHtml(note.contentHtml || '');
    el.title.value = note.title || '';
    el.lastEdited.textContent = 'Last edited ' + formatDate(note.updatedAt);
    updateActionState(note);

    if (!opts.preserveFocus) {
      el.title.blur();
    }
  }

  function persistSettings() {
    Store.writeSettings(state.settings);
  }

  function syncSettingsUi() {
    el.confirmDelete.checked = !!state.settings.confirmDelete;
    el.pastePlain.checked = !!state.settings.pastePlainText;
  }

  function openModal() {
    syncSettingsUi();
    el.modal.hidden = false;
    document.body.classList.add('is-modal-open');
  }

  function closeModal() {
    el.modal.hidden = true;
    document.body.classList.remove('is-modal-open');
  }

  function handleViewToggle(showTrash) {
    state.showTrash = showTrash;
    el.viewNotes.classList.toggle('is-active', !showTrash);
    el.viewTrash.classList.toggle('is-active', showTrash);
    el.viewNotes.setAttribute('aria-pressed', showTrash ? 'false' : 'true');
    el.viewTrash.setAttribute('aria-pressed', showTrash ? 'true' : 'false');
    var active = ensureActiveNote();
    renderList();
    if (active) {
      loadNoteIntoEditor(active);
      updateActionState(active);
    }
  }

  function saveActiveNoteNow() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;

    var nextHtml = sanitizeHtml(el.editor.innerHTML);
    var nextTitle = el.title.value.trim();
    var titleManuallyEdited = note.titleManuallyEdited;

    if (titleManuallyEdited) {
      nextTitle = nextTitle || 'Untitled';
    } else {
      var generated = titleFromContent(nextHtml);
      nextTitle = generated || 'Untitled';
    }

    var updated = Store.updateNote(note.id, function (current) {
      return Object.assign({}, current, {
        title: nextTitle,
        contentHtml: nextHtml,
        updatedAt: Date.now(),
        titleManuallyEdited: titleManuallyEdited
      });
    });

    if (updated) {
      el.lastEdited.textContent = 'Last edited ' + formatDate(updated.updatedAt);
      if (!titleManuallyEdited) {
        el.title.value = updated.title;
      }
      renderList();
      state.isEditorDirty = false;
    }
  }

  var saveActiveNoteDebounced = debounce(saveActiveNoteNow, 400);

  function markDirtyAndSave() {
    state.isEditorDirty = true;
    saveActiveNoteDebounced();
  }

  function handleTitleInput() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;
    if (!note.titleManuallyEdited) {
      Store.updateNote(note.id, function (current) {
        return Object.assign({}, current, {
          titleManuallyEdited: true,
          title: el.title.value.trim() || 'Untitled',
          updatedAt: Date.now()
        });
      });
    } else {
      Store.updateNote(note.id, function (current) {
        return Object.assign({}, current, {
          title: el.title.value.trim() || 'Untitled',
          updatedAt: Date.now()
        });
      });
    }
    el.lastEdited.textContent = 'Last edited ' + formatDate(Date.now());
    renderList();
  }

  function execCommand(command, value) {
    el.editor.focus();
    document.execCommand(command, false, value);
    markDirtyAndSave();
    updateToolbarState();
  }

  // Insert a checklist item using the requested HTML structure.
  function insertCheckboxItem(initialText) {
    var selection = window.getSelection();
    if (!selection) return;
    var range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) return;

    var todo = document.createElement('div');
    todo.className = 'todo';

    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';

    var span = document.createElement('span');
    span.setAttribute('contenteditable', 'true');
    span.textContent = initialText || '';

    todo.appendChild(checkbox);
    todo.appendChild(span);

    range.deleteContents();
    range.insertNode(todo);

    var after = document.createElement('div');
    after.innerHTML = '<br>';
    todo.after(after);

    var newRange = document.createRange();
    newRange.selectNodeContents(span);
    newRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(newRange);
    span.focus();

    markDirtyAndSave();
  }

  function isSelectionInsideList() {
    var sel = window.getSelection();
    if (!sel || !sel.anchorNode) return false;
    var node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    while (node && node !== el.editor) {
      var tag = node.tagName ? node.tagName.toLowerCase() : '';
      if (tag === 'li') return true;
      node = node.parentElement;
    }
    return false;
  }

  function handleTabIndent(e) {
    if (!isSelectionInsideList()) return;
    e.preventDefault();
    execCommand(e.shiftKey ? 'outdent' : 'indent');
  }

  // Best-effort checklist trigger when the user types "- [ ] " at line start.
  function handleChecklistShortcut() {
    var sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;

    var container = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    if (!container) return;

    var block = container.closest('div, p, li');
    if (!block || !el.editor.contains(block)) return;

    var text = (block.textContent || '').trimStart();
    if (text.indexOf('- [ ] ') !== 0) return;

    var rest = text.slice(6);
    block.textContent = '';
    insertCheckboxItem(rest);
  }

  // Paste handling: plain text default with line breaks preserved and sanitized HTML fallback.
  function handlePaste(e) {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;

    if (!state.settings.pastePlainText) {
      window.setTimeout(markDirtyAndSave, 0);
      return;
    }

    e.preventDefault();
    var clipboard = e.clipboardData || window.clipboardData;
    var text = clipboard ? clipboard.getData('text/plain') : '';
    if (!text && clipboard && clipboard.getData) {
      text = clipboard.getData('Text') || '';
    }

    var html = htmlFromPlainText(text || '');
    document.execCommand('insertHTML', false, html);
    markDirtyAndSave();
  }

  function normalizeEditorStructure() {
    var html = el.editor.innerHTML;
    if (!html || !html.trim()) return;
    if (html.indexOf('<div') === -1 && html.indexOf('<p') === -1 && html.indexOf('<ul') === -1 && html.indexOf('<ol') === -1) {
      el.editor.innerHTML = '<div>' + sanitizeHtml(html) + '</div>';
    }
  }

  function handleEditorInput() {
    normalizeEditorStructure();
    markDirtyAndSave();
    handleChecklistShortcut();
  }

  function handleEditorClick(e) {
    var target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('.todo input[type="checkbox"]')) {
      // Checkbox toggles should save without disrupting the caret.
      markDirtyAndSave();
    }
  }

  function updateToolbarState() {
    var buttons = el.toolbar.querySelectorAll('[data-command]');
    buttons.forEach(function (btn) {
      var cmd = btn.getAttribute('data-command');
      if (!cmd || cmd === 'checkbox') {
        btn.classList.remove('is-active');
        return;
      }
      var active = false;
      try {
        active = document.queryCommandState(cmd);
      } catch (err) {
        active = false;
      }
      btn.classList.toggle('is-active', !!active);
    });
  }

  function handleToolbarClick(e) {
    var target = e.target;
    if (!(target instanceof HTMLElement)) return;
    var button = target.closest('[data-command]');
    if (!button) return;
    var command = button.getAttribute('data-command');
    if (command === 'checkbox') {
      insertCheckboxItem('');
      return;
    }
    execCommand(command);
  }

  function handleKeydown(e) {
    var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    var metaKey = isMac ? e.metaKey : e.ctrlKey;

    if (metaKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      createAndSelectNote();
      return;
    }

    if (metaKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      execCommand('bold');
      return;
    }

    if (metaKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      execCommand('italic');
      return;
    }

    if (metaKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      execCommand('underline');
      return;
    }

    if (e.key === 'Tab') {
      handleTabIndent(e);
      return;
    }

    if (e.target === el.editor && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey) {
      return;
    }

    if (e.target === el.search && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      moveSelectionByArrow(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (e.target === document.body && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      var activeEl = document.activeElement;
      if (activeEl === el.editor || activeEl === el.title) return;
      e.preventDefault();
      moveSelectionByArrow(e.key === 'ArrowDown' ? 1 : -1);
    }
  }

  function moveSelectionByArrow(delta) {
    var notes = getNotesForView();
    if (!notes.length) return;

    var currentIndex = notes.findIndex(function (n) {
      return n.id === state.activeNoteId;
    });
    if (currentIndex === -1) currentIndex = 0;
    var nextIndex = currentIndex + delta;
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= notes.length) nextIndex = notes.length - 1;
    var nextNote = notes[nextIndex];
    if (nextNote) {
      setActiveNote(nextNote.id, { preserveFocus: true });
      var activeRow = el.notesList.querySelector('[data-id="' + nextNote.id + '"]');
      if (activeRow) {
        activeRow.focus();
        activeRow.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  function createAndSelectNote() {
    var note = Store.createNote();
    state.showTrash = false;
    el.viewNotes.classList.add('is-active');
    el.viewTrash.classList.remove('is-active');
    el.viewNotes.setAttribute('aria-pressed', 'true');
    el.viewTrash.setAttribute('aria-pressed', 'false');
    setActiveNote(note.id);
    el.title.focus();
    el.title.select();
  }

  function handleDelete() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;

    if (state.showTrash) {
      var confirmDestroy = !state.settings.confirmDelete || window.confirm('Delete this note permanently?');
      if (!confirmDestroy) return;
      Store.destroy(note.id);
    } else {
      var confirmDelete = !state.settings.confirmDelete || window.confirm('Move this note to trash?');
      if (!confirmDelete) return;
      Store.softDelete(note.id);
    }

    var next = ensureActiveNote();
    renderList();
    if (next) {
      loadNoteIntoEditor(next);
    } else {
      renderEditorEmpty();
    }
  }

  function handleRestore() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;
    Store.restore(note.id);
    handleViewToggle(false);
    setActiveNote(note.id);
  }

  function handlePin() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;
    var updated = Store.togglePin(note.id);
    if (updated) {
      renderList();
      updateActionState(updated);
    }
  }

  function handleDuplicate() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;
    var copy = Store.duplicateNote(note.id);
    if (copy) {
      state.showTrash = false;
      setActiveNote(copy.id);
    }
  }

  function handleExportHtml() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;
    var title = (note.title || 'note').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 80);
    var doc =
      '<!doctype html><html><head><meta charset="utf-8"><title>' +
      escapeHtml(note.title || 'Note') +
      '</title></head><body>' +
      sanitizeHtml(note.contentHtml || '') +
      '</body></html>';
    downloadFile(title + '.html', doc, 'text/html;charset=utf-8');
  }

  function handleExportTxt() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;
    var title = (note.title || 'note').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 80);
    var text = textFromHtml(note.contentHtml || '');
    downloadFile(title + '.txt', text, 'text/plain;charset=utf-8');
  }

  function handleSearchInput() {
    state.query = el.search.value || '';
    var active = ensureActiveNote();
    renderList();
    if (active) {
      loadNoteIntoEditor(active, { preserveFocus: true });
    }
  }

  function handleResize() {
    if (!window.matchMedia('(max-width: 760px)').matches) {
      el.app.classList.remove('is-editor-view');
    }
  }

  function initSettingsHandlers() {
    el.openSettings.addEventListener('click', openModal);
    el.modalCloseTargets.forEach(function (target) {
      target.addEventListener('click', closeModal);
    });
    el.modal.addEventListener('click', function (e) {
      var target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset && target.dataset.closeModal === 'true') {
        closeModal();
      }
    });
    el.confirmDelete.addEventListener('change', function () {
      state.settings.confirmDelete = el.confirmDelete.checked;
      persistSettings();
    });
    el.pastePlain.addEventListener('change', function () {
      state.settings.pastePlainText = el.pastePlain.checked;
      persistSettings();
    });
  }

  function initToolbarHandlers() {
    el.toolbar.addEventListener('click', handleToolbarClick);
  }

  function initEditorHandlers() {
    el.editor.setAttribute('contenteditable', 'true');
    el.editor.addEventListener('input', handleEditorInput);
    el.editor.addEventListener('paste', handlePaste);
    el.editor.addEventListener('click', handleEditorClick);
    el.editor.addEventListener('keyup', updateToolbarState);
    el.editor.addEventListener('mouseup', updateToolbarState);
  }

  function initListHandlers() {
    el.search.addEventListener('input', handleSearchInput);
    el.viewNotes.addEventListener('click', function () {
      handleViewToggle(false);
    });
    el.viewTrash.addEventListener('click', function () {
      handleViewToggle(true);
    });
  }

  function initActionHandlers() {
    el.newNote.addEventListener('click', createAndSelectNote);
    el.title.addEventListener('input', handleTitleInput);
    el.pin.addEventListener('click', handlePin);
    el.duplicate.addEventListener('click', handleDuplicate);
    el.exportHtml.addEventListener('click', handleExportHtml);
    el.exportTxt.addEventListener('click', handleExportTxt);
    el.restore.addEventListener('click', handleRestore);
    el.del.addEventListener('click', function () {
      handleDelete();
    });
    el.backButton.addEventListener('click', function () {
      el.app.classList.remove('is-editor-view');
      el.search.focus();
    });
  }

  function initKeyboardHandlers() {
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleResize);
  }

  function initialRender() {
    syncSettingsUi();
    var active = ensureActiveNote();
    renderList();
    if (active) {
      loadNoteIntoEditor(active);
    } else {
      renderEditorEmpty();
    }
  }

  function bootstrap() {
    initSettingsHandlers();
    initToolbarHandlers();
    initEditorHandlers();
    initListHandlers();
    initActionHandlers();
    initKeyboardHandlers();
    initialRender();
  }

  bootstrap();
})();
