import * as vscode from 'vscode';
import { ReviewFlowProvider } from './reviewFlowProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ReviewFlowProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ReviewFlowProvider.viewId, provider),
    vscode.commands.registerCommand('checkflow.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('checkflow.collapseAll', () => provider.collapseAll()),
    vscode.commands.registerCommand('checkflow.exportJson', () => provider.exportJson()),
    vscode.commands.registerCommand('checkflow.importJson', () => provider.importJson()),
    vscode.commands.registerCommand(
      'checkflow.addFromExplorer',
      (uri: vscode.Uri, uris?: vscode.Uri[]) => provider.addFromExplorer(uri, uris),
    ),
  );
}

export function deactivate(): void {}
