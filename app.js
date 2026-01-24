(function () {
  'use strict';

  var NOTES_KEY = 'notes.v2';
  var SETTINGS_KEY = 'notes.settings.v1';
  var DIFF_DAYS = 3;

  var INTENTS = [
    { id: 'idea', label: '💡 Idea' },
    { id: 'question', label: '❓ Open question' },
    { id: 'decision', label: '✅ Decision' },
    { id: 'hypothesis', label: '🧪 Hypothesis' }
  ];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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

  function formatLongDate(ts) {
    var date = new Date(ts);
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }).format(date);
    } catch (err) {
      return date.toDateString();
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

  function sanitizeHtml(html) {
    var template = document.createElement('template');
    template.innerHTML = html;

    var walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null, false);
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
    var normalized = String(text || '').replace(/\n{3,}/g, '\n\n');
    var safe = escapeHtml(normalized);
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

  function markerTypeFromText(text) {
    if (!text) return null;
    var trimmed = text.replace(/^\s+/, '');
    if (trimmed.indexOf('?? ') === 0) return 'question';
    if (trimmed.indexOf('-> ') === 0) return 'action';
    return null;
  }

  function cleanMarkerPrefix(text) {
    if (!text) return '';
    return text.replace(/^\s*(\?\?|->)\s+/, '').trim();
  }

  function isMeaningful(text) {
    return !!(text && text.replace(/\s+/g, '').length > 0);
  }

  function getBlockNodes(root) {
    if (!root) return [];
    return Array.prototype.slice.call(root.querySelectorAll('div, p, li, h1, h2, h3'));
  }

  function analyzeBlocks(blocks) {
    var openQuestions = 0;
    var actions = 0;
    blocks.forEach(function (block) {
      var text = (block.textContent || '').trim();
      var marker = markerTypeFromText(text);
      if (marker === 'question') openQuestions += 1;
      if (marker === 'action') actions += 1;
    });
    return {
      openQuestions: openQuestions,
      actions: actions
    };
  }

  function analyzeNoteHtml(html) {
    var div = document.createElement('div');
    div.innerHTML = html || '';
    var blocks = getBlockNodes(div);
    return analyzeBlocks(blocks);
  }

  function intentById(id) {
    for (var i = 0; i < INTENTS.length; i += 1) {
      if (INTENTS[i].id === id) return INTENTS[i];
    }
    return null;
  }

  function normalizeThinking(thinking) {
    if (!thinking || !thinking.endsAt || thinking.endsAt < Date.now()) {
      return null;
    }
    return thinking;
  }

  function normalizeNote(note) {
    var safe = Object.assign({}, note);
    if (typeof safe.intent !== 'string') safe.intent = '';
    if (typeof safe.openQuestionCount !== 'number') safe.openQuestionCount = 0;
    if (typeof safe.actionCount !== 'number') safe.actionCount = 0;
    if (typeof safe.lastOpenedAt !== 'number') safe.lastOpenedAt = 0;
    if (typeof safe.snapshotHtml !== 'string') safe.snapshotHtml = '';
    safe.thinking = normalizeThinking(safe.thinking);
    return safe;
  }

  var Store = (function () {
    function readNotes() {
      try {
        var raw = localStorage.getItem(NOTES_KEY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeNote);
      } catch (err) {
        return [];
      }
    }

    function writeNotes(notes) {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes.map(normalizeNote)));
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
          confirmDelete: typeof parsed.confirmDelete === 'boolean' ? parsed.confirmDelete : defaults.confirmDelete,
          pastePlainText:
            typeof parsed.pastePlainText === 'boolean' ? parsed.pastePlainText : defaults.pastePlainText
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
        '<div>• Try a checklist with the ☑︎ button or type “- [ ] ”.</div>',
        '<div><br></div>',
        '<div>PM tips:</div>',
        '<div>?? What evidence do we need?</div>',
        '<div>-> Share the summary in standup</div>'
      ].join('');
      var meta = analyzeNoteHtml(welcomeHtml);
      return normalizeNote({
        id: uid(),
        title: 'Welcome',
        contentHtml: welcomeHtml,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        trashed: false,
        titleManuallyEdited: true,
        intent: '',
        openQuestionCount: meta.openQuestions,
        actionCount: meta.actions,
        lastOpenedAt: now,
        snapshotHtml: welcomeHtml,
        thinking: null
      });
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
      var note = normalizeNote({
        id: uid(),
        title: 'Untitled',
        contentHtml: '',
        createdAt: now,
        updatedAt: now,
        pinned: false,
        trashed: false,
        titleManuallyEdited: false,
        intent: '',
        openQuestionCount: 0,
        actionCount: 0,
        lastOpenedAt: now,
        snapshotHtml: '',
        thinking: null
      });
      notes.unshift(note);
      writeNotes(notes);
      return note;
    }

    function updateNote(id, updater) {
      var notes = ensureSeedData();
      var updated = null;
      var nextNotes = notes.map(function (note) {
        if (note.id !== id) return note;
        updated = normalizeNote(updater(normalizeNote(note)));
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
      var copy = normalizeNote({
        id: uid(),
        title: original.title ? original.title + ' Copy' : 'Untitled Copy',
        contentHtml: original.contentHtml,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        trashed: false,
        titleManuallyEdited: true,
        intent: original.intent || '',
        openQuestionCount: original.openQuestionCount || 0,
        actionCount: original.actionCount || 0,
        lastOpenedAt: now,
        snapshotHtml: original.snapshotHtml || original.contentHtml || '',
        thinking: null
      });
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
    lastSelectionIndex: -1,
    saveState: 'idle',
    lastSavedAt: 0,
    intentFilters: {},
    filterQuestionsOnly: false,
    filterActionsOnly: false,
    diffTimeoutId: 0,
    thinkingIntervalId: 0,
    activeDiffHighlighted: false
  };

  var el = {
    app: document.getElementById('app'),
    newNote: document.getElementById('new-note'),
    search: document.getElementById('search-input'),
    intentFilters: document.getElementById('intent-filters'),
    filterQuestions: document.getElementById('filter-open-questions'),
    filterActions: document.getElementById('filter-actions'),
    openQuestionsCount: document.getElementById('open-questions-count'),
    actionsCount: document.getElementById('actions-count'),
    notesList: document.getElementById('notes-list'),
    noteTemplate: document.getElementById('note-row-template'),
    viewNotes: document.getElementById('view-notes'),
    viewTrash: document.getElementById('view-trash'),
    title: document.getElementById('title-input'),
    intentSelect: document.getElementById('intent-select'),
    thinkingSelect: document.getElementById('thinking-select'),
    thinkingTimer: document.getElementById('thinking-timer'),
    thinkingPrompt: document.getElementById('thinking-prompt'),
    captureTakeaway: document.getElementById('capture-takeaway'),
    dismissTakeaway: document.getElementById('dismiss-takeaway'),
    markDecision: document.getElementById('mark-decision'),
    lastEdited: document.getElementById('last-edited'),
    editor: document.getElementById('editor'),
    emptyState: document.getElementById('empty-state'),
    toolbar: document.getElementById('formatting-toolbar'),
    insertEvidence: document.getElementById('insert-evidence'),
    backButton: document.getElementById('back-button'),
    restore: document.getElementById('restore-note'),
    pin: document.getElementById('pin-note'),
    duplicate: document.getElementById('duplicate-note'),
    exportToggle: document.getElementById('export-toggle'),
    exportPanel: document.getElementById('export-panel'),
    exportItems: document.querySelectorAll('.export-item'),
    del: document.getElementById('delete-note'),
    modal: document.getElementById('settings-modal'),
    modalCloseTargets: document.querySelectorAll('[data-close-modal]'),
    confirmDelete: document.getElementById('confirm-delete'),
    pastePlain: document.getElementById('paste-plain'),
    openSettings: document.getElementById('open-settings'),
    toast: document.getElementById('toast')
  };

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.hidden = false;
    window.clearTimeout(el.toast._hideId);
    el.toast._hideId = window.setTimeout(function () {
      el.toast.hidden = true;
    }, 1600);
  }

  function buildIntentFilters() {
    if (!el.intentFilters) return;
    el.intentFilters.innerHTML = '';
    INTENTS.forEach(function (intent) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'intent-chip';
      btn.dataset.intent = intent.id;
      btn.textContent = intent.label;
      btn.addEventListener('click', function () {
        toggleIntentFilter(intent.id);
      });
      el.intentFilters.appendChild(btn);
    });
  }

  function buildIntentSelectOptions() {
    if (!el.intentSelect) return;
    INTENTS.forEach(function (intent) {
      var opt = document.createElement('option');
      opt.value = intent.id;
      opt.textContent = intent.label;
      el.intentSelect.appendChild(opt);
    });
  }

  function toggleIntentFilter(intentId) {
    state.intentFilters[intentId] = !state.intentFilters[intentId];
    renderIntentFilters();
    renderList();
  }

  function activeIntentFilterCount() {
    return Object.keys(state.intentFilters).filter(function (id) {
      return !!state.intentFilters[id];
    }).length;
  }

  function renderIntentFilters() {
    var chips = el.intentFilters.querySelectorAll('.intent-chip');
    chips.forEach(function (chip) {
      var id = chip.dataset.intent;
      var active = !!state.intentFilters[id];
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function updateSidebarStats() {
    var notes = Store.getAll().filter(function (note) {
      return !note.trashed;
    });
    var questions = 0;
    var actions = 0;
    notes.forEach(function (note) {
      questions += note.openQuestionCount || 0;
      actions += note.actionCount || 0;
    });
    el.openQuestionsCount.textContent = String(questions);
    el.actionsCount.textContent = String(actions);
    el.filterQuestions.disabled = state.showTrash;
    el.filterActions.disabled = state.showTrash;
    el.filterQuestions.classList.toggle('is-active', state.filterQuestionsOnly && !state.showTrash);
    el.filterActions.classList.toggle('is-active', state.filterActionsOnly && !state.showTrash);
    el.filterQuestions.setAttribute('aria-pressed', state.filterQuestionsOnly && !state.showTrash ? 'true' : 'false');
    el.filterActions.setAttribute('aria-pressed', state.filterActionsOnly && !state.showTrash ? 'true' : 'false');
  }

  function noteMatchesFilters(note) {
    if (state.showTrash ? !note.trashed : note.trashed) return false;

    var hasIntentFilters = activeIntentFilterCount() > 0;
    if (hasIntentFilters && !state.intentFilters[note.intent]) {
      return false;
    }

    if (state.filterQuestionsOnly && (note.openQuestionCount || 0) === 0) {
      return false;
    }

    if (state.filterActionsOnly && (note.actionCount || 0) === 0) {
      return false;
    }

    if (state.query.trim()) {
      var q = state.query.trim().toLowerCase();
      var inTitle = (note.title || '').toLowerCase().indexOf(q) !== -1;
      var inBody = textFromHtml(note.contentHtml).toLowerCase().indexOf(q) !== -1;
      if (!inTitle && !inBody) return false;
    }

    return true;
  }

  function getNotesForView() {
    var notes = Store.getAll();
    var filtered = notes.filter(noteMatchesFilters);
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

  function finalizeActiveNoteSnapshot() {
    var note = getNoteById(state.activeNoteId);
    if (!note || state.showTrash) return;
    saveActiveNoteNow();
    var html = normalizeEditorStructure(sanitizeHtml(el.editor.innerHTML));
    var meta = analyzeNoteHtml(html);
    var now = Date.now();
    Store.updateNote(note.id, function (current) {
      return Object.assign({}, current, {
        snapshotHtml: html,
        lastOpenedAt: now,
        openQuestionCount: meta.openQuestions,
        actionCount: meta.actions
      });
    });
  }

  function setActiveNote(id, opts) {
    opts = opts || {};
    if (state.activeNoteId && state.activeNoteId !== id) {
      finalizeActiveNoteSnapshot();
    }
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
      updateSidebarStats();
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

      var intentEl = node.querySelector('.note-row__intent');
      var intent = intentById(note.intent);
      if (intent) {
        intentEl.hidden = false;
        intentEl.textContent = intent.label;
      } else {
        intentEl.hidden = true;
        intentEl.textContent = '';
      }

      node.addEventListener('click', function () {
        setActiveNote(note.id);
      });

      el.notesList.appendChild(node);
    });

    var activeIndex = notes.findIndex(function (n) {
      return n.id === state.activeNoteId;
    });
    state.lastSelectionIndex = activeIndex;
    updateSidebarStats();
    renderIntentFilters();
  }

  function renderEditorEmpty() {
    el.emptyState.hidden = false;
    el.editor.classList.add('hidden');
    el.title.value = '';
    el.lastEdited.textContent = '';
    el.intentSelect.value = '';
    el.thinkingSelect.value = '';
    stopThinkingTimer();
    toggleThinkingPrompt(false);
    updateActionState(null);
  }

  function updateActionState(note) {
    var disabled = !note;
    [el.restore, el.pin, el.duplicate, el.exportToggle, el.del, el.intentSelect, el.markDecision, el.insertEvidence].forEach(
      function (btn) {
        if (!btn) return;
        btn.disabled = disabled;
      }
    );
    if (!note) return;
    var inTrash = !!state.showTrash;
    el.restore.hidden = !inTrash;
    el.restore.disabled = disabled || !inTrash;

    el.pin.hidden = inTrash;
    el.duplicate.hidden = inTrash;
    el.exportToggle.hidden = inTrash;
    el.markDecision.hidden = inTrash;
    el.insertEvidence.disabled = disabled || inTrash;
    el.intentSelect.disabled = disabled || inTrash;
    el.thinkingSelect.disabled = disabled || inTrash;

    el.pin.textContent = note.pinned ? '📍' : '📌';
    el.pin.title = note.pinned ? 'Unpin note' : 'Pin note';
    el.pin.setAttribute('aria-label', note.pinned ? 'Unpin note' : 'Pin note');
    el.del.textContent = state.showTrash ? '␡' : '🗑';
    el.del.title = state.showTrash ? 'Delete permanently' : 'Move to trash';
    el.del.setAttribute('aria-label', el.del.title);
  }

  function applyIntentToSelect(note) {
    el.intentSelect.value = note.intent || '';
  }

  function toggleThinkingPrompt(show) {
    el.thinkingPrompt.hidden = !show;
  }

  function startThinkingTimer(note) {
    stopThinkingTimer();
    if (!note || !note.thinking) {
      el.thinkingTimer.hidden = true;
      toggleThinkingPrompt(false);
      return;
    }
    el.thinkingTimer.hidden = false;
    renderThinkingTimer(note);
    state.thinkingIntervalId = window.setInterval(function () {
      var current = getNoteById(state.activeNoteId);
      if (!current || !current.thinking) {
        stopThinkingTimer();
        return;
      }
      renderThinkingTimer(current);
    }, 1000);
  }

  function stopThinkingTimer() {
    if (state.thinkingIntervalId) {
      window.clearInterval(state.thinkingIntervalId);
      state.thinkingIntervalId = 0;
    }
  }

  function renderThinkingTimer(note) {
    var thinking = note.thinking;
    if (!thinking) {
      el.thinkingTimer.hidden = true;
      toggleThinkingPrompt(false);
      return;
    }
    var remaining = Math.max(0, thinking.endsAt - Date.now());
    var mins = Math.floor(remaining / 60000);
    var secs = Math.floor((remaining % 60000) / 1000);
    el.thinkingTimer.textContent = 'Thinking • ' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    el.thinkingTimer.classList.toggle('is-ending', remaining <= 60000 && remaining > 0);

    var prompted = !!thinking.promptedAt;
    if (remaining === 0 && !prompted) {
      var now = Date.now();
      Store.updateNote(note.id, function (current) {
        var nextThinking = current.thinking ? Object.assign({}, current.thinking) : null;
        if (nextThinking) {
          nextThinking.promptedAt = now;
        }
        return Object.assign({}, current, {
          thinking: nextThinking
        });
      });
      toggleThinkingPrompt(true);
      return;
    }

    if (remaining === 0 && prompted && !thinking.dismissedAt && !thinking.capturedAt) {
      toggleThinkingPrompt(true);
    } else if (thinking.dismissedAt || thinking.capturedAt) {
      toggleThinkingPrompt(false);
    } else {
      toggleThinkingPrompt(false);
    }
  }

  function loadNoteIntoEditor(note, opts) {
    opts = opts || {};
    el.emptyState.hidden = true;
    el.editor.classList.remove('hidden');

    el.editor.innerHTML = sanitizeHtml(note.contentHtml || '');
    el.title.value = note.title || '';
    state.lastSavedAt = note.updatedAt || 0;
    state.saveState = 'idle';
    renderSaveState(note.updatedAt || 0);
    updateActionState(note);
    applyIntentToSelect(note);
    el.thinkingSelect.value = note.thinking ? String(note.thinking.durationMin) : '';

    scanAndDecorateEditor();
    applyDiffHighlightIfNeeded(note);
    startThinkingTimer(note);

    if (!opts.preserveFocus) {
      el.title.blur();
    }
  }

  function focusEditorAtEnd() {
    el.editor.focus();
    var selection = window.getSelection();
    if (!selection) return;
    var range = document.createRange();
    range.selectNodeContents(el.editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function persistSettings() {
    Store.writeSettings(state.settings);
  }

  function syncSettingsUi() {
    el.confirmDelete.checked = !!state.settings.confirmDelete;
    el.pastePlain.checked = !!state.settings.pastePlainText;
  }

  function renderSaveState(tsOverride) {
    var ts = typeof tsOverride === 'number' ? tsOverride : state.lastSavedAt;
    if (state.saveState === 'saving') {
      el.lastEdited.textContent = 'Saving…';
      return;
    }
    if (state.saveState === 'error') {
      el.lastEdited.textContent = 'Couldn’t save';
      return;
    }
    if (ts) {
      el.lastEdited.textContent = 'Saved • ' + formatDate(ts);
      return;
    }
    el.lastEdited.textContent = '';
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
    if (!showTrash) {
      state.filterQuestionsOnly = false;
      state.filterActionsOnly = false;
    }
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
    closeExportPanel();
  }

  function saveActiveNoteNow() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;

    var nextHtml = normalizeEditorStructure(sanitizeHtml(el.editor.innerHTML));
    var nextTitle = el.title.value.trim();
    var titleManuallyEdited = note.titleManuallyEdited;

    if (titleManuallyEdited) {
      nextTitle = nextTitle || 'Untitled';
    } else {
      var generated = titleFromContent(nextHtml);
      nextTitle = generated || 'Untitled';
    }

    var meta = analyzeNoteHtml(nextHtml);
    var savedAt = Date.now();
    var updated = null;
    try {
      updated = Store.updateNote(note.id, function (current) {
        return Object.assign({}, current, {
          title: nextTitle,
          contentHtml: nextHtml,
          updatedAt: savedAt,
          titleManuallyEdited: titleManuallyEdited,
          openQuestionCount: meta.openQuestions,
          actionCount: meta.actions
        });
      });
    } catch (err) {
      state.saveState = 'error';
      renderSaveState();
      return;
    }

    if (updated) {
      state.lastSavedAt = savedAt;
      state.saveState = 'saved';
      renderSaveState(savedAt);
      if (!titleManuallyEdited) {
        el.title.value = updated.title;
      }
      renderList();
      state.isEditorDirty = false;
    }
  }

  var saveActiveNoteDebounced = debounce(saveActiveNoteNow, 400);

  function updateCountsFromEditor(now) {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;
    var blocks = getBlockNodes(el.editor);
    var meta = analyzeBlocks(blocks);
    Store.updateNote(note.id, function (current) {
      return Object.assign({}, current, {
        updatedAt: now,
        openQuestionCount: meta.openQuestions,
        actionCount: meta.actions
      });
    });
  }

  function markDirtyAndSave() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;
    state.isEditorDirty = true;
    state.saveState = 'saving';
    var now = Date.now();
    state.lastSavedAt = now;
    renderSaveState();
    scanAndDecorateEditor();
    updateCountsFromEditor(now);
    renderList();
    saveActiveNoteDebounced();
  }

  function handleTitleInput() {
    var note = getNoteById(state.activeNoteId);
    if (!note) return;
    var now = Date.now();
    var nextTitle = el.title.value.trim() || 'Untitled';
    if (!note.titleManuallyEdited) {
      note.titleManuallyEdited = true;
    }
    state.saveState = 'saving';
    state.lastSavedAt = now;
    renderSaveState();
    Store.updateNote(note.id, function (current) {
      return Object.assign({}, current, {
        titleManuallyEdited: true,
        title: nextTitle,
        updatedAt: now
      });
    });
    state.saveState = 'saved';
    renderSaveState(now);
    renderList();
  }

  function handleIntentChange() {
    var note = getNoteById(state.activeNoteId);
    if (!note || state.showTrash) return;
    var now = Date.now();
    var intent = el.intentSelect.value || '';
    Store.updateNote(note.id, function (current) {
      return Object.assign({}, current, {
        intent: intent,
        updatedAt: now
      });
    });
    state.saveState = 'saved';
    state.lastSavedAt = now;
    renderSaveState(now);
    renderList();
  }

  function handleThinkingChange() {
    var note = getNoteById(state.activeNoteId);
    if (!note || state.showTrash) return;
    var minutes = parseInt(el.thinkingSelect.value, 10);
    if (!minutes) {
      Store.updateNote(note.id, function (current) {
        return Object.assign({}, current, {
          thinking: null
        });
      });
      startThinkingTimer(getNoteById(note.id));
      toggleThinkingPrompt(false);
      return;
    }
    var now = Date.now();
    var endsAt = now + minutes * 60000;
    Store.updateNote(note.id, function (current) {
      return Object.assign({}, current, {
        thinking: {
          durationMin: minutes,
          startedAt: now,
          endsAt: endsAt,
          promptedAt: 0,
          dismissedAt: 0,
          capturedAt: 0
        }
      });
    });
    startThinkingTimer(getNoteById(note.id));
    showToast('Thinking mode started');
  }

  function execCommand(command, value) {
    el.editor.focus();
    document.execCommand(command, false, value);
    markDirtyAndSave();
    updateToolbarState();
  }

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
    var textNode = document.createTextNode(initialText || '');
    span.appendChild(textNode);

    todo.appendChild(checkbox);
    todo.appendChild(span);

    range.deleteContents();
    range.insertNode(todo);

    var after = document.createElement('div');
    after.innerHTML = '<br>';
    todo.after(after);

    var newRange = document.createRange();
    newRange.setStart(textNode, textNode.textContent.length);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);
    el.editor.focus();

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

  function handleChecklistShortcut() {
    var sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;

    var container = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    if (!container) return;

    var block = container.closest('div, p, li');
    if (!block || !el.editor.contains(block)) return;

    var raw = block.textContent || '';
    var text = raw.replace(/^\s+/, '');
    if (text.indexOf('- [ ] ') !== 0) return;

    var rest = text.slice(6);
    block.textContent = '';
    insertCheckboxItem(rest);
  }

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

  function normalizeEditorStructure(html) {
    var source = typeof html === 'string' ? html : el.editor.innerHTML;
    if (!source || !source.trim()) return source || '';
    if (
      source.indexOf('<div') === -1 &&
      source.indexOf('<p') === -1 &&
      source.indexOf('<ul') === -1 &&
      source.indexOf('<ol') === -1 &&
      source.indexOf('<h1') === -1 &&
      source.indexOf('<h2') === -1 &&
      source.indexOf('<h3') === -1
    ) {
      return '<div>' + sanitizeHtml(source) + '</div>';
    }
    return source;
  }

  function clearDiffHighlights() {
    if (!state.activeDiffHighlighted) return;
    window.clearTimeout(state.diffTimeoutId);
    state.diffTimeoutId = 0;
    var changed = el.editor.querySelectorAll('.changed-block');
    changed.forEach(function (node) {
      node.classList.remove('changed-block');
    });
    state.activeDiffHighlighted = false;
  }

  function blocksToTextList(html) {
    var div = document.createElement('div');
    div.innerHTML = html || '';
    return getBlockNodes(div).map(function (node) {
      return (node.textContent || '').trim();
    });
  }

  function applyDiffHighlightIfNeeded(note) {
    clearDiffHighlights();
    if (!note || !note.snapshotHtml || state.showTrash) return;
    if (!note.lastOpenedAt) return;
    var daysSinceOpen = (Date.now() - note.lastOpenedAt) / 86400000;
    if (daysSinceOpen < DIFF_DAYS) return;

    var previous = blocksToTextList(note.snapshotHtml);
    var currentBlocks = getBlockNodes(el.editor);
    var previousLen = previous.length;
    currentBlocks.forEach(function (block, index) {
      var currentText = (block.textContent || '').trim();
      var previousText = index < previousLen ? previous[index] : '';
      if (currentText && currentText !== previousText) {
        block.classList.add('changed-block');
      }
    });
    state.activeDiffHighlighted = true;
    state.diffTimeoutId = window.setTimeout(function () {
      clearDiffHighlights();
    }, 6000);
  }

  function scanAndDecorateEditor() {
    var blocks = getBlockNodes(el.editor);
    blocks.forEach(function (block) {
      if (block.classList.contains('evidence-block') || block.classList.contains('decision-snapshot')) {
        return;
      }
      block.classList.remove('question-line');
      block.classList.remove('action-line');
      var text = (block.textContent || '').trim();
      var marker = markerTypeFromText(text);
      if (marker === 'question') {
        block.classList.add('question-line');
      }
      if (marker === 'action') {
        block.classList.add('action-line');
      }
    });
  }

  function handleEditorInput() {
    clearDiffHighlights();
    markDirtyAndSave();
    handleChecklistShortcut();
  }

  function handleEditorClick(e) {
    var target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('.todo input[type="checkbox"]')) {
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

  function insertBlockTag(tagName) {
    var sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    var node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    if (!node) return;
    var block = node.closest('div, p, li, h1, h2, h3');
    if (!block || !el.editor.contains(block)) return;
    var replacement = document.createElement(tagName);
    replacement.innerHTML = block.innerHTML && block.innerHTML.trim() ? block.innerHTML : '<br>';
    block.replaceWith(replacement);
    var range = document.createRange();
    range.selectNodeContents(replacement);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    markDirtyAndSave();
  }

  function insertListFromSlash(ordered) {
    execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList');
  }

  function handleSlashCommand() {
    var sel = window.getSelection();
    if (!sel || !sel.anchorNode) return false;
    var node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    if (!node) return false;
    var block = node.closest('div, p, li, h1, h2, h3');
    if (!block || !el.editor.contains(block)) return false;
    var text = (block.textContent || '').trim();
    var map = {
      '/h1': function () {
        insertBlockTag('h1');
      },
      '/h2': function () {
        insertBlockTag('h2');
      },
      '/h3': function () {
        insertBlockTag('h3');
      },
      '/p': function () {
        insertBlockTag('div');
      },
      '/ul': function () {
        insertListFromSlash(false);
      },
      '/ol': function () {
        insertListFromSlash(true);
      },
      '/list': function () {
        insertListFromSlash(false);
      },
      '/todo': function () {
        insertCheckboxItem('');
      },
      '/check': function () {
        insertCheckboxItem('');
      },
      '/checkbox': function () {
        insertCheckboxItem('');
      }
    };
    var handler = map[text.toLowerCase()];
    if (!handler) return false;
    block.textContent = '';
    handler();
    return true;
  }

  function closestBlockFromSelection() {
    var sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    var node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    if (!node) return null;
    var block = node.closest('div, p, li, h1, h2, h3');
    if (!block || !el.editor.contains(block)) return null;
    return block;
  }

  function insertEvidenceBlock() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!el.editor.contains(range.commonAncestorContainer)) {
      el.editor.focus();
      focusEditorAtEnd();
      sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      range = sel.getRangeAt(0);
    }

    var evidence = document.createElement('div');
    evidence.className = 'evidence-block';
    evidence.setAttribute('data-block-type', 'evidence');
    var textNode = document.createTextNode('');
    evidence.appendChild(textNode);

    range.deleteContents();
    range.insertNode(evidence);

    var after = document.createElement('div');
    after.innerHTML = '<br>';
    evidence.after(after);

    var newRange = document.createRange();
    newRange.setStart(textNode, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    el.editor.focus();

    markDirtyAndSave();
  }

  function selectedTextWithinEditor() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return '';
    var range = sel.getRangeAt(0);
    if (!el.editor.contains(range.commonAncestorContainer)) return '';
    return sel.toString().trim();
  }

  function firstMeaningfulParagraph() {
    var blocks = getBlockNodes(el.editor);
    for (var i = 0; i < blocks.length; i += 1) {
      var block = blocks[i];
      if (block.classList.contains('decision-snapshot')) continue;
      var text = (block.textContent || '').trim();
      if (!isMeaningful(text)) continue;
      return cleanMarkerPrefix(text);
    }
    return '';
  }

  function insertNodeNearTop(node) {
    var first = el.editor.firstElementChild;
    if (!first) {
      el.editor.appendChild(node);
      return;
    }
    if (first.classList.contains('decision-snapshot')) {
      first.before(node);
      return;
    }
    first.before(node);
  }

  function markAsDecision() {
    var note = getNoteById(state.activeNoteId);
    if (!note || state.showTrash) return;
    var excerpt = selectedTextWithinEditor();
    if (!excerpt) {
      excerpt = firstMeaningfulParagraph();
    }
    if (!excerpt) return;

    var now = Date.now();
    var snapshot = document.createElement('div');
    snapshot.className = 'decision-snapshot';
    snapshot.setAttribute('data-block-type', 'decision');
    snapshot.innerHTML =
      '<div class="decision-snapshot__title">Decision captured on ' +
      escapeHtml(formatLongDate(now)) +
      '</div>' +
      '<div>' +
      escapeHtml(excerpt) +
      '</div>' +
      '<div class="decision-snapshot__meta">' +
      escapeHtml(formatDate(now)) +
      '</div>';

    insertNodeNearTop(snapshot);
    showToast('Decision captured');
    markDirtyAndSave();
  }

  function insertTakeawayAtTop() {
    var takeaway = document.createElement('div');
    takeaway.className = 'takeaway-block';
    takeaway.innerHTML = '<strong>Takeaway:</strong> ';
    var textNode = document.createTextNode('');
    takeaway.appendChild(textNode);
    insertNodeNearTop(takeaway);

    var sel = window.getSelection();
    if (!sel) return;
    var range = document.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    el.editor.focus();
    markDirtyAndSave();
  }

  function handleCaptureTakeaway() {
    var note = getNoteById(state.activeNoteId);
    if (!note || !note.thinking) return;
    insertTakeawayAtTop();
    var now = Date.now();
    Store.updateNote(note.id, function (current) {
      var nextThinking = current.thinking ? Object.assign({}, current.thinking) : null;
      if (nextThinking) {
        nextThinking.capturedAt = now;
      }
      return Object.assign({}, current, {
        thinking: nextThinking
      });
    });
    toggleThinkingPrompt(false);
  }

  function handleDismissTakeaway() {
    var note = getNoteById(state.activeNoteId);
    if (!note || !note.thinking) return;
    var now = Date.now();
    Store.updateNote(note.id, function (current) {
      var nextThinking = current.thinking ? Object.assign({}, current.thinking) : null;
      if (nextThinking) {
        nextThinking.dismissedAt = now;
      }
      return Object.assign({}, current, {
        thinking: nextThinking
      });
    });
    toggleThinkingPrompt(false);
  }

  function handleEvidenceShortcut() {
    var block = closestBlockFromSelection();
    if (!block) return false;
    var text = (block.textContent || '').trim().toLowerCase();
    if (text !== '::evidence') return false;
    block.textContent = '';
    insertEvidenceBlock();
    return true;
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

    if (e.target === el.editor && (e.key === ' ' || e.key === 'Enter')) {
      var handledEvidence = e.key === 'Enter' ? handleEvidenceShortcut() : false;
      if (handledEvidence) {
        e.preventDefault();
        return;
      }
      var handledSlash = handleSlashCommand();
      if (handledSlash) {
        e.preventDefault();
        return;
      }
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
        activeRow.focus({ preventScroll: false });
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

  function sanitizedTitleForExport(note) {
    return (note.title || 'note').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 80);
  }

  function extractLinesFromHtml(html) {
    var div = document.createElement('div');
    div.innerHTML = sanitizeHtml(html || '');
    var blocks = getBlockNodes(div);
    var lines = [];
    blocks.forEach(function (block) {
      if (block.classList.contains('decision-snapshot') || block.classList.contains('evidence-block')) {
        lines.push(block);
        return;
      }
      var tag = block.tagName ? block.tagName.toLowerCase() : 'div';
      var text = (block.textContent || '').trim();
      lines.push({ tag: tag, text: text, block: block });
    });
    return lines;
  }

  function appendSection(lines, heading, items) {
    if (!items.length) return;
    lines.push('');
    lines.push(heading);
    items.forEach(function (item) {
      lines.push('- ' + item);
    });
  }

  function exportForPrd(note) {
    var lines = [];
    lines.push(note.title || 'Untitled');
    lines.push('');

    var openQuestions = [];
    var actions = [];
    var blocks = extractLinesFromHtml(note.contentHtml);
    blocks.forEach(function (entry) {
      if (entry instanceof HTMLElement) {
        if (entry.classList.contains('decision-snapshot')) {
          lines.push(entry.innerText.trim());
        }
        if (entry.classList.contains('evidence-block')) {
          lines.push('Evidence: ' + entry.innerText.trim());
        }
        return;
      }
      if (!entry.text) return;
      var marker = markerTypeFromText(entry.text);
      if (marker === 'question') {
        openQuestions.push(cleanMarkerPrefix(entry.text));
        return;
      }
      if (marker === 'action') {
        actions.push(cleanMarkerPrefix(entry.text));
        return;
      }
      if (entry.tag.indexOf('h') === 0) {
        lines.push(entry.text);
      } else {
        lines.push(entry.text);
      }
    });

    appendSection(lines, 'Open Questions', openQuestions);
    appendSection(lines, 'Actions', actions);

    var fileName = sanitizedTitleForExport(note) + '-prd.txt';
    downloadFile(fileName, lines.join('\n'), 'text/plain;charset=utf-8');
  }

  function exportForJira(note) {
    var lines = [];
    lines.push((note.title || 'Untitled').toUpperCase());
    lines.push('');

    var openQuestions = [];
    var actions = [];
    var blocks = extractLinesFromHtml(note.contentHtml);
    blocks.forEach(function (entry) {
      if (entry instanceof HTMLElement) {
        if (entry.classList.contains('decision-snapshot')) {
          lines.push(entry.innerText.trim());
        }
        if (entry.classList.contains('evidence-block')) {
          lines.push('EVIDENCE: ' + entry.innerText.trim());
        }
        return;
      }
      if (!entry.text) return;
      var marker = markerTypeFromText(entry.text);
      if (marker === 'question') {
        openQuestions.push(cleanMarkerPrefix(entry.text));
        return;
      }
      if (marker === 'action') {
        actions.push(cleanMarkerPrefix(entry.text));
        return;
      }
      if (entry.tag.indexOf('h') === 0) {
        lines.push('## ' + entry.text.toUpperCase());
      } else {
        lines.push(entry.text);
      }
    });

    appendSection(lines, 'ACTIONS', actions);
    appendSection(lines, 'OPEN QUESTIONS', openQuestions);

    var fileName = sanitizedTitleForExport(note) + '-jira.txt';
    downloadFile(fileName, lines.join('\n'), 'text/plain;charset=utf-8');
  }

  function toSlideBullets(text) {
    return text
      .split(/[\.\n]/)
      .map(function (part) {
        return part.trim();
      })
      .filter(isMeaningful)
      .slice(0, 6);
  }

  function exportForSlides(note) {
    var blocks = extractLinesFromHtml(note.contentHtml);
    var slides = [];
    var current = null;

    function ensureSlide(title) {
      if (current) {
        slides.push(current);
      }
      current = {
        title: title || note.title || 'Slide',
        bullets: []
      };
    }

    ensureSlide(note.title || 'Untitled');

    var openQuestions = [];
    var actions = [];

    blocks.forEach(function (entry) {
      if (entry instanceof HTMLElement) {
        if (entry.classList.contains('decision-snapshot')) {
          current.bullets.push('Decision: ' + entry.innerText.trim());
        }
        if (entry.classList.contains('evidence-block')) {
          current.bullets.push('Supporting evidence: ' + entry.innerText.trim());
        }
        return;
      }
      if (!entry.text) return;
      var marker = markerTypeFromText(entry.text);
      if (marker === 'question') {
        openQuestions.push(cleanMarkerPrefix(entry.text));
        return;
      }
      if (marker === 'action') {
        actions.push(cleanMarkerPrefix(entry.text));
        return;
      }
      if (entry.tag.indexOf('h') === 0) {
        ensureSlide(entry.text);
        return;
      }
      var bullets = toSlideBullets(entry.text);
      bullets.forEach(function (b) {
        current.bullets.push(b);
      });
    });

    if (openQuestions.length) {
      ensureSlide('Open Questions');
      openQuestions.forEach(function (q) {
        current.bullets.push(q);
      });
    }
    if (actions.length) {
      ensureSlide('Actions');
      actions.forEach(function (a) {
        current.bullets.push(a);
      });
    }
    if (current) {
      slides.push(current);
    }

    var lines = [];
    slides.forEach(function (slide, index) {
      if (index > 0) lines.push('');
      lines.push('=== ' + slide.title + ' ===');
      slide.bullets.slice(0, 8).forEach(function (bullet) {
        lines.push('- ' + bullet);
      });
    });

    var fileName = sanitizedTitleForExport(note) + '-slides.txt';
    downloadFile(fileName, lines.join('\n'), 'text/plain;charset=utf-8');
  }

  function handleExport(mode) {
    var note = getNoteById(state.activeNoteId);
    if (!note || state.showTrash) return;
    closeExportPanel();
    if (mode === 'prd') exportForPrd(note);
    if (mode === 'jira') exportForJira(note);
    if (mode === 'slides') exportForSlides(note);
  }

  function openExportPanel() {
    if (state.showTrash) return;
    el.exportPanel.hidden = false;
    el.exportToggle.setAttribute('aria-expanded', 'true');
  }

  function closeExportPanel() {
    el.exportPanel.hidden = true;
    el.exportToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleExportPanel() {
    if (el.exportPanel.hidden) {
      openExportPanel();
    } else {
      closeExportPanel();
    }
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

  function handleFilterQuestions() {
    if (state.showTrash) return;
    state.filterQuestionsOnly = !state.filterQuestionsOnly;
    if (state.filterQuestionsOnly) {
      state.filterActionsOnly = false;
    }
    var active = ensureActiveNote();
    renderList();
    if (active) {
      loadNoteIntoEditor(active, { preserveFocus: true });
    }
  }

  function handleFilterActions() {
    if (state.showTrash) return;
    state.filterActionsOnly = !state.filterActionsOnly;
    if (state.filterActionsOnly) {
      state.filterQuestionsOnly = false;
    }
    var active = ensureActiveNote();
    renderList();
    if (active) {
      loadNoteIntoEditor(active, { preserveFocus: true });
    }
  }

  function handleOutsideExportClick(e) {
    if (el.exportPanel.hidden) return;
    var target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('.export-menu')) return;
    closeExportPanel();
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
    el.insertEvidence.addEventListener('click', function () {
      insertEvidenceBlock();
    });
  }

  function initEditorHandlers() {
    el.editor.setAttribute('contenteditable', 'true');
    el.editor.addEventListener('input', handleEditorInput);
    el.editor.addEventListener('paste', handlePaste);
    el.editor.addEventListener('click', handleEditorClick);
    el.editor.addEventListener('keyup', updateToolbarState);
    el.editor.addEventListener('mouseup', updateToolbarState);
    el.editor.addEventListener('focusin', function () {
      el.app.classList.add('is-writing');
    });
    el.editor.addEventListener('focusout', function () {
      window.setTimeout(function () {
        if (document.activeElement !== el.editor) {
          el.app.classList.remove('is-writing');
        }
      }, 0);
    });
  }

  function initListHandlers() {
    el.search.addEventListener('input', handleSearchInput);
    el.viewNotes.addEventListener('click', function () {
      handleViewToggle(false);
    });
    el.viewTrash.addEventListener('click', function () {
      handleViewToggle(true);
    });
    el.filterQuestions.addEventListener('click', handleFilterQuestions);
    el.filterActions.addEventListener('click', handleFilterActions);
  }

  function initActionHandlers() {
    el.newNote.addEventListener('click', createAndSelectNote);
    el.title.addEventListener('input', handleTitleInput);
    el.intentSelect.addEventListener('change', handleIntentChange);
    el.thinkingSelect.addEventListener('change', handleThinkingChange);
    el.captureTakeaway.addEventListener('click', handleCaptureTakeaway);
    el.dismissTakeaway.addEventListener('click', handleDismissTakeaway);
    el.markDecision.addEventListener('click', markAsDecision);
    el.pin.addEventListener('click', handlePin);
    el.duplicate.addEventListener('click', handleDuplicate);
    el.restore.addEventListener('click', handleRestore);
    el.del.addEventListener('click', function () {
      handleDelete();
    });
    el.backButton.addEventListener('click', function () {
      el.app.classList.remove('is-editor-view');
      el.search.focus();
    });
  }

  function initExportHandlers() {
    el.exportToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleExportPanel();
    });
    el.exportItems.forEach(function (item) {
      item.addEventListener('click', function () {
        handleExport(item.dataset.export);
      });
    });
    document.addEventListener('click', handleOutsideExportClick);
  }

  function initKeyboardHandlers() {
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleResize);
    window.addEventListener('beforeunload', finalizeActiveNoteSnapshot);
  }

  function initialRender() {
    syncSettingsUi();
    buildIntentFilters();
    buildIntentSelectOptions();
    var active = ensureActiveNote();
    renderList();
    if (active) {
      loadNoteIntoEditor(active);
      focusEditorAtEnd();
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
    initExportHandlers();
    initKeyboardHandlers();
    initialRender();
  }

  bootstrap();
})();
