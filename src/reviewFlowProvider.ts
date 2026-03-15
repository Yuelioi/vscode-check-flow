import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceData, ChecklistGroup } from './types';
import { getData, saveData } from './storageManager';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars[Math.floor(Math.random() * chars.length)];
  }
  return nonce;
}

/** Add missing `todos` arrays to files saved by older versions. */
function migrate(data: WorkspaceData): WorkspaceData {
  for (const g of data.groups) {
    for (const p of g.phases) {
      for (const f of p.files) {
        if (!Array.isArray((f as any).todos)) {
          (f as any).todos = [];
        }
      }
    }
  }
  return data;
}

export class ReviewFlowProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'checkflow.sidebar';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      undefined,
      this._context.subscriptions,
    );
  }

  refresh(): void {
    if (this._view) {
      this._view.webview.html = this._getHtml(this._view.webview);
    }
  }

  collapseAll(): void {
    const data = migrate(getData(this._context));
    const allCollapsed = data.groups.every(g => g.collapsed);
    for (const g of data.groups) { g.collapsed = !allCollapsed; }
    saveData(this._context, data);
    this._sendData();
  }

  async exportJson(): Promise<void> {
    const data = migrate(getData(this._context));
    const ws = vscode.workspace.workspaceFolders?.[0];
    const wsName = ws ? path.basename(ws.uri.fsPath) : 'workspace';

    const totalFiles = data.groups.flatMap(g => g.phases.flatMap(p => p.files)).length;
    const doneFiles = data.groups.flatMap(g => g.phases.flatMap(p => p.files.filter(f => f.checked))).length;

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace: wsName,
      summary: `${data.groups.length} groups, ${totalFiles} files, ${doneFiles} checked`,
      groups: data.groups.map(g => ({
        name: g.name,
        phases: g.phases.map(p => ({
          name: p.name,
          progress: `${p.files.filter(f => f.checked).length}/${p.files.length} files`,
          files: p.files.map(f => ({
            name: f.name,
            path: f.path,
            checked: f.checked,
            todos: f.todos.map(t => ({ text: t.text, checked: t.checked })),
          })),
        })),
      })),
    };

    const json = JSON.stringify(payload, null, 2);

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        path.join(ws?.uri.fsPath ?? '', `checkflow-${wsName}.json`),
      ),
      filters: { JSON: ['json'] },
      saveLabel: 'Export',
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
      const open = await vscode.window.showInformationMessage(
        `Exported to ${path.basename(uri.fsPath)}`,
        'Open',
      );
      if (open === 'Open') {
        await vscode.window.showTextDocument(uri);
      }
    }
  }

  async addFromExplorer(uri: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
    const selectedUris = (uris && uris.length > 0) ? uris : (uri ? [uri] : []);
    if (selectedUris.length === 0) {
      vscode.window.showWarningMessage('No files or folders selected.');
      return;
    }

    const data = migrate(getData(this._context));

    if (data.groups.length === 0) {
      vscode.window.showWarningMessage('No groups yet. Open Review Flow and create a group first.');
      return;
    }

    // Step 1 — pick group
    const groupPick = await vscode.window.showQuickPick(
      data.groups.map(g => ({
        label: g.name,
        description: `${g.phases.length} phase(s)`,
        groupId: g.id,
      })),
      { placeHolder: 'Select a group  (step 1 / 2)', title: 'Add to Check Flow' },
    );
    if (!groupPick) { return; }

    const group = data.groups.find(g => g.id === groupPick.groupId);
    if (!group) { return; }

    if (group.phases.length === 0) {
      vscode.window.showWarningMessage(`"${group.name}" has no phases — add one first.`);
      return;
    }

    // Step 2 — pick phase
    const phasePick = await vscode.window.showQuickPick(
      group.phases.map(p => ({
        label: p.name,
        description: `${p.files.length} file(s)`,
        phaseId: p.id,
      })),
      { placeHolder: 'Select a phase  (step 2 / 2)', title: 'Add to Check Flow' },
    );
    if (!phasePick) { return; }

    await this._addUrisToPhase(groupPick.groupId, phasePick.phaseId, selectedUris);
    vscode.window.showInformationMessage(
      `Added to ${groupPick.label} › ${phasePick.label}`,
    );
  }

  async quickExport(): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    const data = migrate(getData(this._context));
    const wsName = path.basename(ws.uri.fsPath);

    const totalFiles = data.groups.flatMap(g => g.phases.flatMap(p => p.files)).length;
    const doneFiles = data.groups.flatMap(g => g.phases.flatMap(p => p.files.filter(f => f.checked))).length;

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace: wsName,
      summary: `${data.groups.length} groups, ${totalFiles} files, ${doneFiles} checked`,
      groups: data.groups.map(g => ({
        name: g.name,
        phases: g.phases.map(p => ({
          name: p.name,
          progress: `${p.files.filter(f => f.checked).length}/${p.files.length} files`,
          files: p.files.map(f => ({
            name: f.name,
            path: f.path,
            checked: f.checked,
            todos: f.todos.map(t => ({ text: t.text, checked: t.checked })),
          })),
        })),
      })),
    };

    const vscodeDir = vscode.Uri.joinPath(ws.uri, '.vscode');
    await vscode.workspace.fs.createDirectory(vscodeDir);
    const destUri = vscode.Uri.joinPath(vscodeDir, 'checklist.json');
    await vscode.workspace.fs.writeFile(destUri, Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'));

    const open = await vscode.window.showInformationMessage(
      `Exported to checklist.json`,
      'Open',
    );
    if (open === 'Open') {
      await vscode.window.showTextDocument(destUri);
    }
  }

  async quickImport(): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    const destUri = vscode.Uri.joinPath(ws.uri, '.vscode', 'checklist.json');
    let imported: any;
    try {
      const bytes = await vscode.workspace.fs.readFile(destUri);
      imported = JSON.parse(Buffer.from(bytes).toString('utf-8'));
    } catch {
      vscode.window.showErrorMessage('checklist.json not found or invalid in .vscode/.');
      return;
    }

    if (!imported.groups || !Array.isArray(imported.groups)) {
      vscode.window.showErrorMessage('Invalid file: expected a "groups" array.');
      return;
    }

    const choice = await vscode.window.showQuickPick(
      ['Replace — discard current data', 'Merge — append imported groups'],
      { placeHolder: 'How to import?' },
    );
    if (!choice) { return; }

    const data = migrate(getData(this._context));
    const newGroups = this._normalizeGroups(imported.groups);

    if (choice.startsWith('Replace')) {
      data.groups = newGroups;
    } else {
      data.groups.push(...newGroups);
    }

    saveData(this._context, data);
    this._sendData();
    vscode.window.showInformationMessage(`Imported ${newGroups.length} group(s) from checklist.json.`);
  }

  async importJson(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: { JSON: ['json'] },
      openLabel: 'Import',
    });
    if (!result || result.length === 0) { return; }

    let imported: any;
    try {
      const bytes = await vscode.workspace.fs.readFile(result[0]);
      imported = JSON.parse(Buffer.from(bytes).toString('utf-8'));
    } catch (e) {
      vscode.window.showErrorMessage(`Cannot parse JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    if (!imported.groups || !Array.isArray(imported.groups)) {
      vscode.window.showErrorMessage('Invalid file: expected a "groups" array.');
      return;
    }

    const choice = await vscode.window.showQuickPick(
      ['Replace — discard current data', 'Merge — append imported groups'],
      { placeHolder: 'How to import?' },
    );
    if (!choice) { return; }

    const data = migrate(getData(this._context));
    const newGroups = this._normalizeGroups(imported.groups);

    if (choice.startsWith('Replace')) {
      data.groups = newGroups;
    } else {
      data.groups.push(...newGroups);
    }

    saveData(this._context, data);
    this._sendData();
    vscode.window.showInformationMessage(`Imported ${newGroups.length} group(s).`);
  }

  async watcherImport(): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) { return; }

    const destUri = vscode.Uri.joinPath(ws.uri, '.vscode', 'checklist.json');
    let imported: any;
    try {
      const bytes = await vscode.workspace.fs.readFile(destUri);
      imported = JSON.parse(Buffer.from(bytes).toString('utf-8'));
    } catch { return; }

    if (!imported.groups || !Array.isArray(imported.groups)) { return; }

    const data = migrate(getData(this._context));
    data.groups = this._normalizeGroups(imported.groups);
    saveData(this._context, data);
    this._sendData();
  }

  private async _quickImportReplace(): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) { vscode.window.showErrorMessage('No workspace folder open.'); return; }

    const destUri = vscode.Uri.joinPath(ws.uri, '.vscode', 'checklist.json');
    let imported: any;
    try {
      const bytes = await vscode.workspace.fs.readFile(destUri);
      imported = JSON.parse(Buffer.from(bytes).toString('utf-8'));
    } catch {
      vscode.window.showErrorMessage('checklist.json not found or invalid in .vscode/.');
      return;
    }

    if (!imported.groups || !Array.isArray(imported.groups)) {
      vscode.window.showErrorMessage('Invalid file: expected a "groups" array.');
      return;
    }

    const data = migrate(getData(this._context));
    data.groups = this._normalizeGroups(imported.groups);
    saveData(this._context, data);
    this._sendData();
    vscode.window.showInformationMessage(`Imported ${data.groups.length} group(s) from checklist.json.`);
  }

  private _normalizeGroups(raw: any[]): ChecklistGroup[] {
    return raw.map(g => ({
      id: generateId(),
      name: String(g.name ?? 'Unnamed Group'),
      collapsed: false,
      phases: (g.phases ?? []).map((p: any) => ({
        id: generateId(),
        name: String(p.name ?? 'Unnamed Phase'),
        collapsed: false,
        files: (p.files ?? []).map((f: any) => ({
          id: generateId(),
          name: String(f.name ?? 'Unknown'),
          path: String(f.path ?? ''),
          checked: Boolean(f.checked),
          todos: (f.todos ?? []).map((t: any) => ({
            id: generateId(),
            text: String(t.text ?? ''),
            checked: Boolean(t.checked),
          })),
        })),
      })),
    }));
  }

  private _sendData(): void {
    if (!this._view) { return; }
    const data = migrate(getData(this._context));
    this._view.webview.postMessage({ type: 'update', data });
  }

  private async _handleMessage(msg: any): Promise<void> {
    switch (msg.type) {

      case 'ready':
        this._sendData();
        break;

      case 'exportJson': this.exportJson(); break;
      case 'importJson': this.importJson(); break;
      case 'quickExport': this.quickExport(); break;
      case 'quickImportReplace': this._quickImportReplace(); break;

      case 'openFile': {
        try {
          let uri: vscode.Uri;
          if (path.isAbsolute(msg.path)) {
            uri = vscode.Uri.file(msg.path);
          } else {
            const ws = vscode.workspace.workspaceFolders?.[0];
            if (!ws) { vscode.window.showErrorMessage(`Cannot open: ${msg.path}`); break; }
            uri = vscode.Uri.joinPath(ws.uri, msg.path);
          }
          await vscode.window.showTextDocument(uri, { preview: false });
        } catch (e) {
          vscode.window.showErrorMessage(`Cannot open: ${msg.path} — ${e instanceof Error ? e.message : String(e)}`);
        }
        break;
      }

      // ── Groups ─────────────────────────────────────────────────────────────

      case 'addGroup': {
        const data = migrate(getData(this._context));
        data.groups.push({ id: generateId(), name: msg.name, collapsed: false, phases: [] });
        saveData(this._context, data);
        this._sendData();
        break;
      }

      case 'renameGroup': {
        const data = migrate(getData(this._context));
        const g = data.groups.find(x => x.id === msg.groupId);
        if (g) { g.name = msg.name; saveData(this._context, data); this._sendData(); }
        break;
      }

      case 'removeGroup': {
        const data = migrate(getData(this._context));
        data.groups = data.groups.filter(x => x.id !== msg.groupId);
        saveData(this._context, data);
        this._sendData();
        break;
      }

      case 'toggleGroupCollapse': {
        const data = migrate(getData(this._context));
        const g = data.groups.find(x => x.id === msg.groupId);
        if (g) { g.collapsed = !g.collapsed; saveData(this._context, data); this._sendData(); }
        break;
      }

      // ── Phases ─────────────────────────────────────────────────────────────

      case 'addPhase': {
        const data = migrate(getData(this._context));
        const g = data.groups.find(x => x.id === msg.groupId);
        if (g) {
          g.phases.push({ id: generateId(), name: msg.name, collapsed: false, files: [] });
          saveData(this._context, data);
          this._sendData();
        }
        break;
      }

      case 'renamePhase': {
        const data = migrate(getData(this._context));
        const p = data.groups.find(x => x.id === msg.groupId)?.phases.find(x => x.id === msg.phaseId);
        if (p) { p.name = msg.name; saveData(this._context, data); this._sendData(); }
        break;
      }

      case 'removePhase': {
        const data = migrate(getData(this._context));
        const g = data.groups.find(x => x.id === msg.groupId);
        if (g) {
          g.phases = g.phases.filter(x => x.id !== msg.phaseId);
          saveData(this._context, data);
          this._sendData();
        }
        break;
      }

      case 'togglePhaseCollapse': {
        const data = migrate(getData(this._context));
        const p = data.groups.find(x => x.id === msg.groupId)?.phases.find(x => x.id === msg.phaseId);
        if (p) { p.collapsed = !p.collapsed; saveData(this._context, data); this._sendData(); }
        break;
      }

      // ── Files ──────────────────────────────────────────────────────────────

      case 'toggleFile': {
        const data = migrate(getData(this._context));
        const f = data.groups.find(x => x.id === msg.groupId)
          ?.phases.find(x => x.id === msg.phaseId)
          ?.files.find(x => x.id === msg.fileId);
        if (f) { f.checked = !f.checked; saveData(this._context, data); this._sendData(); }
        break;
      }

      case 'removeFile': {
        const data = migrate(getData(this._context));
        const p = data.groups.find(x => x.id === msg.groupId)?.phases.find(x => x.id === msg.phaseId);
        if (p) {
          p.files = p.files.filter(x => x.id !== msg.fileId);
          saveData(this._context, data);
          this._sendData();
        }
        break;
      }

      case 'moveFile': {
        const data = migrate(getData(this._context));
        const fp = data.groups.find(x => x.id === msg.fromGroupId)?.phases.find(x => x.id === msg.fromPhaseId);
        const tp = data.groups.find(x => x.id === msg.toGroupId)?.phases.find(x => x.id === msg.toPhaseId);
        if (fp && tp) {
          const idx = fp.files.findIndex(x => x.id === msg.fileId);
          if (idx !== -1) {
            const [file] = fp.files.splice(idx, 1);
            tp.files.splice(Math.min(msg.toIndex, tp.files.length), 0, file);
            saveData(this._context, data);
            this._sendData();
          }
        }
        break;
      }

      case 'pickFiles': {
        const result = await vscode.window.showOpenDialog({
          canSelectMany: true,
          canSelectFiles: true,
          canSelectFolders: true,
          openLabel: 'Add to Checklist',
        });
        if (result?.length) { await this._addUrisToPhase(msg.groupId, msg.phaseId, result); }
        break;
      }

      case 'dropFiles': {
        const uris: vscode.Uri[] = [];
        for (const raw of (msg.uris as string[])) {
          try { uris.push(vscode.Uri.parse(raw, true)); } catch { /* skip */ }
        }
        if (uris.length) { await this._addUrisToPhase(msg.groupId, msg.phaseId, uris); }
        break;
      }

      // ── Todos ──────────────────────────────────────────────────────────────

      case 'addTodo': {
        const data = migrate(getData(this._context));
        const f = data.groups.find(x => x.id === msg.groupId)
          ?.phases.find(x => x.id === msg.phaseId)
          ?.files.find(x => x.id === msg.fileId);
        if (f) {
          f.todos.push({ id: generateId(), text: msg.text, checked: false });
          // New todo is unchecked → file can't be fully done
          if (f.todos.length > 0) { f.checked = false; }
          saveData(this._context, data);
          this._sendData();
        }
        break;
      }

      case 'toggleTodo': {
        const data = migrate(getData(this._context));
        const f = data.groups.find(x => x.id === msg.groupId)
          ?.phases.find(x => x.id === msg.phaseId)
          ?.files.find(x => x.id === msg.fileId);
        const t = f?.todos.find(x => x.id === msg.todoId);
        if (f && t) {
          t.checked = !t.checked;
          // Sync parent file: done iff every todo is checked
          f.checked = f.todos.length > 0 && f.todos.every(x => x.checked);
          saveData(this._context, data);
          this._sendData();
        }
        break;
      }

      case 'removeTodo': {
        const data = migrate(getData(this._context));
        const f = data.groups.find(x => x.id === msg.groupId)
          ?.phases.find(x => x.id === msg.phaseId)
          ?.files.find(x => x.id === msg.fileId);
        if (f) {
          f.todos = f.todos.filter(x => x.id !== msg.todoId);
          // Re-sync after removal (if no todos remain, keep current state)
          if (f.todos.length > 0) {
            f.checked = f.todos.every(x => x.checked);
          }
          saveData(this._context, data);
          this._sendData();
        }
        break;
      }
    }
  }

  private async _addUrisToPhase(groupId: string, phaseId: string, uris: vscode.Uri[]): Promise<void> {
    const data = migrate(getData(this._context));
    const phase = data.groups.find(g => g.id === groupId)?.phases.find(p => p.id === phaseId);
    if (!phase) { return; }

    for (const uri of uris) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type & vscode.FileType.Directory) {
          const entries = await vscode.workspace.fs.readDirectory(uri);
          for (const [name, type] of entries) {
            if (type & vscode.FileType.File) {
              const fp = vscode.Uri.joinPath(uri, name).fsPath;
              if (!phase.files.some(f => f.path === fp)) {
                phase.files.push({ id: generateId(), name, path: fp, checked: false, todos: [] });
              }
            }
          }
        } else {
          const fp = uri.fsPath;
          const name = path.basename(fp);
          if (!phase.files.some(f => f.path === fp)) {
            phase.files.push({ id: generateId(), name, path: fp, checked: false, todos: [] });
          }
        }
      } catch (e) {
        console.error('Failed to add URI:', uri.toString(), e);
      }
    }

    saveData(this._context, data);
    this._sendData();
  }

  private _getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.css'),
    );
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'),
    );
    const nonce = generateNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${codiconsUri}" rel="stylesheet">
  <title>Review Flow</title>
</head>
<body>
  <div id="app"><div class="loading">Loading…</div></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
