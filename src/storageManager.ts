import * as vscode from 'vscode';
import { WorkspaceData } from './types';

const STORAGE_KEY = 'checkflow.data';

export function getData(ctx: vscode.ExtensionContext): WorkspaceData {
  return ctx.workspaceState.get<WorkspaceData>(STORAGE_KEY, { groups: [] });
}

export function saveData(ctx: vscode.ExtensionContext, data: WorkspaceData): void {
  ctx.workspaceState.update(STORAGE_KEY, data);
}
