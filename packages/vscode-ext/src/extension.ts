import * as vscode from 'vscode';

import { registerCursorSync } from './cursorSyncController';

export function activate(context: vscode.ExtensionContext): void {
  registerCursorSync(context);
}

export function deactivate(): void {}
