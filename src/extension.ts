import * as vscode from 'vscode';
import { ReviewFlowProvider } from './reviewFlowProvider';

const WATCHER_KEY = 'checkflow.watcherEnabled';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ReviewFlowProvider(context.extensionUri, context);

  let watcher: vscode.FileSystemWatcher | undefined;

  function applyWatcherState(enabled: boolean): void {
    context.workspaceState.update(WATCHER_KEY, enabled);
    vscode.commands.executeCommand('setContext', 'checkflow.watcherEnabled', enabled);

    if (enabled) {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (ws && !watcher) {
        watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(ws, '.vscode/checklist.json'),
        );
        watcher.onDidChange(() => provider.watcherImport());
        watcher.onDidCreate(() => provider.watcherImport());
      }
    } else {
      watcher?.dispose();
      watcher = undefined;
    }
  }

  // Restore persisted state (default off)
  const savedEnabled = context.workspaceState.get<boolean>(WATCHER_KEY, false);
  applyWatcherState(savedEnabled);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ReviewFlowProvider.viewId, provider),
    vscode.commands.registerCommand('checkflow.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('checkflow.collapseAll', () => provider.collapseAll()),
    vscode.commands.registerCommand('checkflow.exportJson', () => provider.exportJson()),
    vscode.commands.registerCommand('checkflow.importJson', () => provider.importJson()),
    vscode.commands.registerCommand('checkflow.quickExport', () => provider.quickExport()),
    vscode.commands.registerCommand('checkflow.quickImport', () => provider.quickImport()),
    vscode.commands.registerCommand('checkflow.enableWatcher', () => applyWatcherState(true)),
    vscode.commands.registerCommand('checkflow.disableWatcher', () => applyWatcherState(false)),
    vscode.commands.registerCommand(
      'checkflow.addFromExplorer',
      (uri: vscode.Uri, uris?: vscode.Uri[]) => provider.addFromExplorer(uri, uris),
    ),
    { dispose: () => watcher?.dispose() },
  );
}

export function deactivate(): void {}
