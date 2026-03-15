(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // ── State ────────────────────────────────────────────────────────────────────

  let state = { groups: [] };
  let dragState = null;
  let isEditing = false;
  let pendingState = null;

  // UI preferences persisted across reloads via vscode.getState()
  let ui = Object.assign({ todosMode: false }, vscode.getState() || {});
  function saveUi() { vscode.setState(ui); }

  // ── Bootstrap ────────────────────────────────────────────────────────────────

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'update') {
      if (!isEditing) { state = msg.data; renderAll(); }
      else { pendingState = msg.data; }
    } else if (msg.type === 'revealFile') {
      const block = document.querySelector(`.file-block[data-fid="${msg.fileId}"]`);
      if (block) {
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        block.classList.add('reveal-highlight');
        setTimeout(() => block.classList.remove('reveal-highlight'), 1500);
      }
    }
  });

  vscode.postMessage({ type: 'ready' });

  // ── Render ───────────────────────────────────────────────────────────────────

  function renderAll() {
    const app = document.getElementById('app');
    if (!app) { return; }
    const list = app.querySelector('.groups-list');
    const scrollTop = list ? list.scrollTop : 0;
    app.innerHTML = buildAppHtml();
    const newList = app.querySelector('.groups-list');
    if (newList && scrollTop) { newList.scrollTop = scrollTop; }
    bindEvents();
    bindDragDrop();
  }

  function buildAppHtml() {
    const groups = state.groups;
    const todoBtnClass = ui.todosMode ? 'btn-tool active' : 'btn-tool';
    return `
      <div class="toolbar">
        <span class="app-title">Review Flow</span>
        <div class="toolbar-right">
          <button class="${todoBtnClass}" id="btn-todos-mode" title="${ui.todosMode ? 'Hide Todos' : 'Show Todos'}">≡ Todos</button>
          <button class="btn-primary" id="btn-add-group">＋ Group</button>
        </div>
      </div>
      <div id="form-add-group" class="inline-form hidden">
        <input id="input-group-name" class="inline-input" type="text" placeholder="Group name…" maxlength="64" />
        <div class="form-btns">
          <button class="btn-confirm" id="btn-confirm-group">Add</button>
          <button class="btn-cancel" id="btn-cancel-group">Cancel</button>
        </div>
      </div>
      <div class="groups-list">
        ${groups.length === 0
          ? '<div class="empty-state">Click <b>＋ Group</b> to create your first review group.</div>'
          : groups.map(buildGroupHtml).join('')}
      </div>
    `;
  }

  function buildGroupHtml(group) {
    const allFiles = group.phases.flatMap(p => p.files);
    const total = allFiles.length;
    const done = allFiles.filter(f => f.checked).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return `
      <div class="group${group.collapsed ? ' collapsed' : ''}" data-gid="${group.id}">
        <div class="group-hdr">
          <button class="btn-collapse" data-action="toggle-group" data-gid="${group.id}" title="Toggle">
            <span class="arrow">${group.collapsed ? '▶' : '▼'}</span>
          </button>
          <span class="group-name name-editable" data-action="rename-group" data-gid="${group.id}"
                title="Double-click to rename">${esc(group.name)}</span>
          <span class="badge${total > 0 && done === total ? ' all-done' : ''}">${done}/${total}</span>
          <div class="hdr-actions">
            <button class="btn-sm" data-action="show-add-phase" data-gid="${group.id}">+ Phase</button>
            <button class="btn-sm btn-danger" data-action="del-group" data-gid="${group.id}" title="Delete">✕</button>
          </div>
        </div>
        ${total > 0 ? `<div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>` : ''}
        <div class="group-body">
          <div class="add-phase-form hidden" id="apf-${group.id}">
            <input class="inline-input phase-name-input" type="text" placeholder="Phase name…" maxlength="64" />
            <div class="form-btns">
              <button class="btn-confirm" data-action="confirm-add-phase" data-gid="${group.id}">Add</button>
              <button class="btn-cancel" data-action="cancel-add-phase" data-gid="${group.id}">Cancel</button>
            </div>
          </div>
          ${group.phases.length === 0 && !group.collapsed
            ? '<div class="empty-state" style="padding:6px 10px;text-align:left;font-size:11px;">Click <b>+ Phase</b> to add a phase.</div>'
            : group.phases.map(p => buildPhaseHtml(group.id, p)).join('')}
        </div>
      </div>
    `;
  }

  function buildPhaseHtml(gid, phase) {
    const total = phase.files.length;
    const done = phase.files.filter(f => f.checked).length;

    return `
      <div class="phase${phase.collapsed ? ' collapsed' : ''}" data-gid="${gid}" data-pid="${phase.id}">
        <div class="phase-hdr">
          <button class="btn-collapse" data-action="toggle-phase" data-gid="${gid}" data-pid="${phase.id}" title="Toggle">
            <span class="arrow">${phase.collapsed ? '▶' : '▼'}</span>
          </button>
          <span class="phase-name name-editable" data-action="rename-phase" data-gid="${gid}" data-pid="${phase.id}"
                title="Double-click to rename">${esc(phase.name)}</span>
          <span class="badge${total > 0 && done === total ? ' all-done' : ''}">${done}/${total}</span>
          <div class="hdr-actions">
            <button class="btn-sm" data-action="pick-files" data-gid="${gid}" data-pid="${phase.id}" title="Add Files">+ Files</button>
            <button class="btn-sm btn-danger" data-action="del-phase" data-gid="${gid}" data-pid="${phase.id}" title="Delete">✕</button>
          </div>
        </div>
        <div class="phase-body drop-zone${total === 0 ? ' empty' : ''}" data-gid="${gid}" data-pid="${phase.id}">
          ${phase.files.map(f => buildFileHtml(gid, phase.id, f)).join('')}
          <div class="drop-hint">Drop files / folders here, or click <b>+ Files</b></div>
        </div>
      </div>
    `;
  }

  function buildFileHtml(gid, pid, file) {
    const todos = file.todos || [];
    const tdDone = todos.filter(t => t.checked).length;
    const tdTotal = todos.length;
    const todoPill = tdTotal > 0
      ? `<span class="todo-pill${tdDone === tdTotal ? ' all-done' : ''}" title="${tdDone}/${tdTotal} todos done">${tdDone}/${tdTotal}</span>`
      : '';

    const todosSection = ui.todosMode ? buildTodosHtml(gid, pid, file) : '';

    return `
      <div class="file-block${file.checked ? ' checked' : ''}"
           data-gid="${gid}" data-pid="${pid}" data-fid="${file.id}">
        <div class="file-item" draggable="true" title="${escAttr(file.path)}">
          <input type="checkbox" class="file-check" ${file.checked ? 'checked' : ''}
                 data-action="toggle-file" data-gid="${gid}" data-pid="${pid}" data-fid="${file.id}" />
          <span class="file-name" data-action="open-file" data-path="${escAttr(file.path)}">${esc(file.name)}</span>
          ${todoPill}
          <button class="btn-del-file" data-action="del-file" data-gid="${gid}" data-pid="${pid}" data-fid="${file.id}" title="Remove">✕</button>
        </div>
        ${todosSection}
      </div>
    `;
  }

  function buildTodosHtml(gid, pid, file) {
    const todos = file.todos || [];
    return `
      <div class="todos-section" data-gid="${gid}" data-pid="${pid}" data-fid="${file.id}">
        ${todos.map(t => `
          <div class="todo-item" data-todo-id="${t.id}">
            <input type="checkbox" class="todo-check" ${t.checked ? 'checked' : ''}
                   data-action="toggle-todo" data-gid="${gid}" data-pid="${pid}" data-fid="${file.id}" data-tid="${t.id}" />
            <span class="todo-text${t.checked ? ' done' : ''}" data-action="rename-todo" data-gid="${gid}" data-pid="${pid}" data-fid="${file.id}" data-tid="${t.id}" title="Double-click to edit">${esc(t.text)}</span>
            <button class="btn-del-todo" data-action="del-todo" data-gid="${gid}" data-pid="${pid}" data-fid="${file.id}" data-tid="${t.id}" title="Remove">✕</button>
          </div>
        `).join('')}
        <div class="todo-add-row">
          <input type="text" class="todo-add-input" placeholder="＋ Add todo…"
                 data-gid="${gid}" data-pid="${pid}" data-fid="${file.id}"
                 maxlength="200" />
        </div>
      </div>
    `;
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  function bindEvents() {
    const app = document.getElementById('app');
    app.addEventListener('click', onAppClick);
    app.addEventListener('dblclick', onAppDblClick);
    app.addEventListener('keydown', onAppKeydown);
  }

  function onAppClick(e) {
    // Toolbar own buttons (no data-action)
    const btnId = e.target.id || e.target.closest('button')?.id;
    if (btnId === 'btn-add-group')     { showForm('form-add-group', 'input-group-name'); return; }
    if (btnId === 'btn-confirm-group') { submitAddGroup(); return; }
    if (btnId === 'btn-cancel-group')  { hideForm('form-add-group'); return; }
    if (btnId === 'btn-todos-mode')    { ui.todosMode = !ui.todosMode; saveUi(); renderAll(); return; }

    const btn = e.target.closest('[data-action]');
    if (!btn) { return; }
    const { action, gid, pid, fid, tid } = btn.dataset;

    switch (action) {
      case 'toggle-group':    vscode.postMessage({ type: 'toggleGroupCollapse', groupId: gid }); break;
      case 'toggle-phase':    vscode.postMessage({ type: 'togglePhaseCollapse', groupId: gid, phaseId: pid }); break;
      case 'open-file':       vscode.postMessage({ type: 'openFile', path: btn.dataset.path }); break;
      case 'toggle-file':     vscode.postMessage({ type: 'toggleFile', groupId: gid, phaseId: pid, fileId: fid }); break;
      case 'del-group':       vscode.postMessage({ type: 'removeGroup', groupId: gid }); break;
      case 'del-phase':       vscode.postMessage({ type: 'removePhase', groupId: gid, phaseId: pid }); break;
      case 'del-file':        vscode.postMessage({ type: 'removeFile', groupId: gid, phaseId: pid, fileId: fid }); break;
      case 'pick-files':      vscode.postMessage({ type: 'pickFiles', groupId: gid, phaseId: pid }); break;
      case 'show-add-phase':  showAddPhaseForm(gid); break;
      case 'confirm-add-phase': submitAddPhase(gid); break;
      case 'cancel-add-phase':  hideAddPhaseForm(gid); break;
      case 'toggle-todo':     vscode.postMessage({ type: 'toggleTodo', groupId: gid, phaseId: pid, fileId: fid, todoId: tid }); break;
      case 'del-todo':        vscode.postMessage({ type: 'removeTodo', groupId: gid, phaseId: pid, fileId: fid, todoId: tid }); break;
    }
  }

  function onAppDblClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) { return; }
    const { action, gid, pid, fid, tid } = btn.dataset;
    if (action === 'rename-group') {
      startEdit(btn, (name) => vscode.postMessage({ type: 'renameGroup', groupId: gid, name }));
    } else if (action === 'rename-phase') {
      startEdit(btn, (name) => vscode.postMessage({ type: 'renamePhase', groupId: gid, phaseId: pid, name }));
    } else if (action === 'rename-todo') {
      startEdit(btn, (text) => vscode.postMessage({ type: 'renameTodo', groupId: gid, phaseId: pid, fileId: fid, todoId: tid, text }));
    }
  }

  function onAppKeydown(e) {
    if (e.key === 'Enter') {
      if (e.target.id === 'input-group-name') { submitAddGroup(); return; }
      if (e.target.classList.contains('phase-name-input')) {
        const gid = e.target.closest('.add-phase-form')
          ?.querySelector('[data-action="confirm-add-phase"]')?.dataset?.gid;
        if (gid) { submitAddPhase(gid); return; }
      }
      if (e.target.classList.contains('todo-add-input')) {
        submitAddTodo(e.target);
        return;
      }
    }
    if (e.key === 'Escape') {
      hideForm('form-add-group');
      document.querySelectorAll('.add-phase-form').forEach(f => f.classList.add('hidden'));
      if (e.target.classList.contains('todo-add-input')) { e.target.value = ''; e.target.blur(); }
    }
  }

  // ── Forms ────────────────────────────────────────────────────────────────────

  function showForm(formId, inputId) {
    const form = document.getElementById(formId);
    if (!form) { return; }
    form.classList.remove('hidden');
    const input = inputId ? document.getElementById(inputId) : null;
    if (input) { input.value = ''; input.focus(); }
  }

  function hideForm(formId) { document.getElementById(formId)?.classList.add('hidden'); }

  function showAddPhaseForm(gid) {
    const form = document.getElementById(`apf-${gid}`);
    if (!form) { return; }
    form.classList.remove('hidden');
    const input = form.querySelector('.phase-name-input');
    if (input) { input.value = ''; input.focus(); }
  }

  function hideAddPhaseForm(gid) { document.getElementById(`apf-${gid}`)?.classList.add('hidden'); }

  function submitAddGroup() {
    const input = document.getElementById('input-group-name');
    const name = input?.value.trim();
    if (name) { vscode.postMessage({ type: 'addGroup', name }); hideForm('form-add-group'); }
  }

  function submitAddPhase(gid) {
    const form = document.getElementById(`apf-${gid}`);
    const input = form?.querySelector('.phase-name-input');
    const name = input?.value.trim();
    if (name) { vscode.postMessage({ type: 'addPhase', groupId: gid, name }); hideAddPhaseForm(gid); }
  }

  function submitAddTodo(inputEl) {
    const text = inputEl.value.trim();
    if (!text) { return; }
    const { gid, pid, fid } = inputEl.dataset;
    vscode.postMessage({ type: 'addTodo', groupId: gid, phaseId: pid, fileId: fid, text });
    inputEl.value = '';
  }

  // ── Inline editing ───────────────────────────────────────────────────────────

  function startEdit(el, onSave) {
    isEditing = true;
    const original = el.textContent.trim();
    el.contentEditable = 'true';
    el.classList.add('editing');
    el.focus();
    selectAllText(el);

    function finish(save) {
      if (!isEditing) { return; }
      el.contentEditable = 'false';
      el.classList.remove('editing');
      isEditing = false;
      const newName = el.textContent.trim();
      if (save && newName && newName !== original) {
        onSave(newName);
      } else {
        el.textContent = original;
        if (pendingState) { state = pendingState; pendingState = null; renderAll(); }
      }
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
    }

    function onBlur() { finish(true); }
    function onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    }

    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
  }

  function selectAllText(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  function bindDragDrop() {
    const app = document.getElementById('app');

    app.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.file-item');
      if (!item) { return; }
      const block = item.closest('.file-block');
      dragState = { gid: block.dataset.gid, pid: block.dataset.pid, fid: block.dataset.fid };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'file-item');
      setTimeout(() => item.classList.add('dragging'), 0);
    });

    app.addEventListener('dragend', () => {
      document.querySelectorAll('.file-item.dragging').forEach(el => el.classList.remove('dragging'));
      clearDropUI();
      dragState = null;
    });

    app.addEventListener('dragover', (e) => {
      const zone = e.target.closest('.drop-zone');
      if (!zone) { return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = dragState ? 'move' : 'copy';
      clearDropUI();
      zone.classList.add('drag-over');
      if (dragState) { showInsertLine(zone, e.clientY); }
    });

    app.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) { clearDropUI(); }
    });

    app.addEventListener('drop', (e) => {
      e.preventDefault();
      clearDropUI();
      const zone = e.target.closest('.drop-zone');
      if (!zone) { return; }

      const toGid = zone.dataset.gid;
      const toPid = zone.dataset.pid;

      if (dragState) {
        const toIndex = getDropIndex(zone, e.clientY);
        vscode.postMessage({
          type: 'moveFile',
          fromGroupId: dragState.gid, fromPhaseId: dragState.pid, fileId: dragState.fid,
          toGroupId: toGid, toPhaseId: toPid, toIndex,
        });
        dragState = null;
        return;
      }

      const uris = extractUris(e.dataTransfer);
      if (uris.length > 0) {
        vscode.postMessage({ type: 'dropFiles', groupId: toGid, phaseId: toPid, uris });
      }
    });
  }

  function clearDropUI() {
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.insert-line').forEach(el => el.remove());
  }

  function showInsertLine(zone, clientY) {
    document.querySelectorAll('.insert-line').forEach(el => el.remove());
    const items = [...zone.querySelectorAll('.file-block:not(:has(.file-item.dragging))')];
    let insertBefore = null;
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) { insertBefore = item; break; }
    }
    const line = document.createElement('div');
    line.className = 'insert-line';
    if (insertBefore) { zone.insertBefore(line, insertBefore); }
    else { const hint = zone.querySelector('.drop-hint'); hint ? zone.insertBefore(line, hint) : zone.appendChild(line); }
  }

  function getDropIndex(zone, clientY) {
    const items = [...zone.querySelectorAll('.file-block')];
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) { return i; }
    }
    return items.length;
  }

  function extractUris(dataTransfer) {
    // Try all known formats in order of reliability

    // 1. VS Code internal format (newer VS Code versions)
    const vscodeList = dataTransfer.getData('application/vnd.code.uri-list');
    if (vscodeList && vscodeList.trim()) {
      return vscodeList.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
    }

    // 2. Standard URI list (OS drag, also works in some VS Code versions)
    const uriList = dataTransfer.getData('text/uri-list');
    if (uriList && uriList.trim()) {
      return uriList.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
    }

    // 3. Plain text paths (some environments)
    const plain = dataTransfer.getData('text/plain');
    if (plain && plain.trim() && plain !== 'file-item') {
      return plain.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(p => {
        if (p.startsWith('file:')) { return p; }
        const n = p.replace(/\\/g, '/');
        return n.startsWith('/') ? `file://${n}` : `file:///${n}`;
      });
    }

    // 4. FileList (OS drag from file manager)
    if (dataTransfer.files && dataTransfer.files.length > 0) {
      return Array.from(dataTransfer.files).map(f => {
        const p = f.path || f.name;
        if (!p) { return null; }
        if (p.startsWith('file:')) { return p; }
        const n = p.replace(/\\/g, '/');
        return n.startsWith('/') ? `file://${n}` : `file:///${n}`;
      }).filter(Boolean);
    }

    return [];
  }

  // ── Utils ────────────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

})();
