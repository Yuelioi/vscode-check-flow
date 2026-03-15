# Check Flow

A code review checklist manager for VS Code. Organize files into **groups** and **phases**, track review progress with **todos**, and never lose your place during a review session.

[中文文档](README.zh-cn.md)

---

## Preview

<p align="center">
  <img src="screenshot/preview-simple.png" alt="Files-only view" width="340" />
  &nbsp;&nbsp;
  <img src="screenshot/preview-full.png" alt="Full view with todos" width="340" />
</p>
<p align="center">
  <em>Left: files-only view &nbsp;·&nbsp; Right: full view with todo sub-items</em>
</p>

---

## Features

### Groups & Phases — two-level organization

Structure your review work with:

- **Groups** — top-level categories, e.g. "Frontend", "Backend", "QA"
- **Phases** — stages within a group, e.g. "Phase 1 — Core", "Sprint 42"

Double-click any group or phase name to rename it inline.

### Files with Todo sub-items

Each file in a checklist can have its own todo list:

```
[□] UserInfo.vue                   1/3
    │ [☑] Check layout on mobile
    │ [□] Verify API error states
    │ [□] Check loading skeleton
    │ + Add todo…
```

- Toggle **≡ Todos** in the sidebar toolbar to show or hide the todo layer
- When **all todos are checked**, the parent file is automatically marked as done
- When **any todo is unchecked**, the parent file is automatically unmarked
- The `1/3` pill on each file row shows todo progress even when todos are hidden

### Progress tracking

Every group and phase shows a `done/total` badge and an animated progress bar.

### Drag & drop reordering

Drag file rows within a phase or across phases/groups. A blue insertion line shows exactly where the file will land.

### Add files from Explorer

**Option 1 — Right-click** (recommended, supports multi-select)

Select one or more files/folders in the Explorer → right-click → **Add to Check Flow…** → pick group → pick phase.

**Option 2 — + Files button**

Click **+ Files** next to a phase name → native file picker (supports multi-select and folders).

**Option 3 — Drop zone**

Drag files from your OS file manager onto a phase's drop zone.

### JSON Export / Import

Icons in the panel title bar:

| Icon | Action |
|------|--------|
| Export | Save the full checklist as human-readable JSON (choose destination) |
| Import | Load a JSON file (choose file, then replace or merge) |

**Quick variants** (no dialogs, for AI workflows — see [below](#using-the-exported-json-with-ai)):

| Command (Ctrl+Shift+P) | Action |
|------------------------|--------|
| Quick Export to checklist.json | Write directly to `<workspace root>/.vscode/checklist.json` |
| Quick Import from checklist.json | Read directly from `<workspace root>/.vscode/checklist.json` |

Exported JSON is designed to be readable by humans and AI alike:

```json
{
  "version": 1,
  "exportedAt": "2026-03-15T10:00:00.000Z",
  "workspace": "my-project",
  "summary": "2 groups, 8 files, 5 checked",
  "groups": [
    {
      "name": "Frontend Review",
      "phases": [
        {
          "name": "Phase 1 — Core",
          "progress": "2/4 files",
          "files": [
            {
              "name": "index.vue",
              "path": "src/views/index.vue",
              "checked": true,
              "todos": [
                { "text": "Check layout", "checked": true },
                { "text": "Check API", "checked": true }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Auto-Import (File Watcher)

The panel title bar has an eye icon that toggles a file watcher on `.vscode/checklist.json`:

| Icon | State | Action |
|------|-------|--------|
| `$(eye-closed)` | Watcher OFF | Click to enable auto-import |
| `$(eye)` | Watcher ON | Click to disable auto-import |

When enabled, any time `.vscode/checklist.json` is **created or modified**, the plugin automatically imports it (replace mode, no dialog). The state is saved per workspace and persists across restarts.

> **Note:** Auto-import always **replaces** the current data. Make sure you don't accidentally overwrite work-in-progress. Disable the watcher when you don't need AI collaboration.

### Collapse all

Click the collapse icon in the panel title bar (or run **Check Flow: Collapse / Expand All Groups**) to fold every group at once. Click again to expand all.

---

## Getting Started

1. Open the **Review Flow** panel in the Activity Bar
2. Click **＋ Group** → name your group (e.g. "Frontend Review")
3. Click **+ Phase** → name your phase (e.g. "Sprint 42")
4. Right-click files in Explorer → **Add to Check Flow…** → select group & phase
5. Click a filename to open it in the editor
6. Check the checkbox when done — or add todos first for finer-grained tracking

---

## Keyboard Shortcuts

| Action | Key |
|--------|-----|
| Confirm inline form | `Enter` |
| Cancel form or inline edit | `Escape` |
| Add todo | Type in the `+ Add todo…` field → `Enter` |
| Rename group / phase | Double-click the name |

---

## Commands

All commands are available via `Ctrl+Shift+P` under the **Check Flow** category:

| Command | Description |
|---------|-------------|
| Refresh | Reload the webview |
| Collapse / Expand All Groups | Toggle collapse state of all groups |
| Export as JSON | Save checklist to a JSON file (with save dialog) |
| Import from JSON | Load checklist from a JSON file (with file picker) |
| Quick Export to checklist.json | Write directly to `<workspace root>/.vscode/checklist.json` |
| Quick Import from checklist.json | Read directly from `<workspace root>/.vscode/checklist.json` |
| Enable Auto-Import (checklist.json) | Start watching `checklist.json` for changes |
| Disable Auto-Import (checklist.json) | Stop watching `checklist.json` |
| Add to Check Flow… | Add selected Explorer items to a phase |

---

## Data Storage

All data is saved to VS Code's **workspace state** — one independent checklist per workspace. Nothing is written to disk unless you explicitly export.

---

## Using the exported JSON with AI

Check Flow is designed to work seamlessly with AI coding assistants (Claude Code, Copilot, Cursor, etc.). The bridge is `.vscode/checklist.json` — a plain file both humans and AI can read and write.

### Workflow A — Auto-Import (recommended, fully hands-free)

Enable the file watcher once, then let the AI do the rest:

```
Step 1 (one-time setup)
  Panel title bar → click $(eye-closed) to enable Auto-Import

Step 2 (export)
  Ctrl+Shift+P → "Check Flow: Quick Export to checklist.json"

Step 3 (AI edits)
  Tell AI: "Read checklist.json, update it, and write it back."
  AI reads → edits → saves checklist.json

Step 4 (auto)
  Plugin detects the file change → silently replaces data ✓
  No further action needed.
```

> **For AI assistants:** `checklist.json` is always at `<workspace root>/.vscode/checklist.json`.
> Read it, modify it, write it back. If the user has the watcher enabled, the plugin reloads automatically.
> If the watcher is off, ask the user to run **Quick Import from checklist.json**.

### Workflow B — Manual Import

For one-off exchanges or when you want to review changes before applying:

```
1. Ctrl+Shift+P → "Check Flow: Quick Export to checklist.json"
2. Share checklist.json content with AI
3. AI returns updated JSON → overwrite checklist.json
4. Ctrl+Shift+P → "Check Flow: Quick Import from checklist.json"
```

### Workflow C — Dialog-based (custom file location)

Use the panel toolbar icons when you want to choose the file location manually (Export / Import icons open native file dialogs).

---

### ⚠ Important notes

- **Auto-import always replaces** all current data — there is no merge or undo.  Disable the watcher (`$(eye)` → off) when you are not in an AI session to avoid accidental overwrites.
- The watcher only monitors `.vscode/checklist.json` — files at other locations are ignored.
- Relative file paths in `checklist.json` are resolved against the workspace root, so AI-generated paths like `src/views/index.vue` work correctly without full absolute paths.
- The watcher state is saved **per workspace** and persists across VS Code restarts.

### Suggested prompts

```
以下是我的代码检查清单，请帮我分析哪些文件还没检查，并给出检查建议：
[粘贴 JSON]
```

```
Here is my review checklist. Based on the unchecked files and their todos,
suggest what to focus on next:
[paste JSON]
```

### What the AI can help with

| Scenario | Example prompt |
|----------|----------------|
| Prioritize remaining files | "Which unchecked files are most likely to have bugs?" |
| Generate todos automatically | "For each unchecked file, suggest 3 review todos based on the filename" |
| Summarize progress | "Summarize the review status across all groups" |
| Re-import after AI edits | Ask the AI to return updated JSON, then import it back |

### JSON schema reference

```jsonc
{
  "version": 1,               // always 1
  "exportedAt": "ISO-8601",   // export timestamp
  "workspace": "string",      // VS Code workspace folder name
  "summary": "string",        // human-readable progress summary
  "groups": [
    {
      "name": "string",       // group label, e.g. "Frontend"
      "phases": [
        {
          "name": "string",   // phase label, e.g. "Phase 1"
          "progress": "x/y files",
          "files": [
            {
              "name": "string",     // filename only, e.g. "index.vue"
              "path": "string",     // absolute path on disk
              "checked": boolean,   // true = review done
              "todos": [
                {
                  "text": "string",    // todo description
                  "checked": boolean   // true = todo done
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Round-trip: AI edits → re-import

**With Auto-Import ON** (zero steps for you):

1. AI writes updated JSON to `<workspace root>/.vscode/checklist.json`
2. Plugin auto-detects the change and reloads — done ✓

**With Auto-Import OFF** (one manual step):

1. AI writes updated JSON to `<workspace root>/.vscode/checklist.json`
2. Run **Quick Import from checklist.json** (`Ctrl+Shift+P`)

**Custom file location**:

1. Save the AI's output as any `.json` file
2. Panel toolbar → **Import from JSON** → pick the file → choose Merge or Replace

---

## License

MIT © [YUE LI](https://github.com/Yuelioi)
