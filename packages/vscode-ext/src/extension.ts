import * as vscode from 'vscode';

import { registerCursorExport } from './cursorExportController';

export function activate(context: vscode.ExtensionContext): void {
  registerCursorExport(context);
}

export function deactivate(): void {}
