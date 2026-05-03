import { ping } from '@cursor-logs/core';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  void context;
  console.log(`cursor-logs: activated (${ping()})`);
}

export function deactivate(): void {
  // Reserved for disposables / watchers in a later step.
}
