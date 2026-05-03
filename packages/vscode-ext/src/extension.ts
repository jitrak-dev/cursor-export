import * as vscode from 'vscode';

import { registerCursorLogs } from './cursorLogsController';

export function activate(context: vscode.ExtensionContext): void {
  registerCursorLogs(context);
}

export function deactivate(): void {}
