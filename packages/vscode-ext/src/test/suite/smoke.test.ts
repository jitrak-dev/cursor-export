/// <reference types="mocha" />

import * as assert from 'node:assert';

import * as vscode from 'vscode';

suite('Extension smoke (real Extension Host)', () => {
  test('cursor-export extension is present and activates', async () => {
    const ext = vscode.extensions.getExtension('jitrak-dev.cursor-export');
    assert.ok(ext, 'extension jitrak-dev.cursor-export should be installed');
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test('contributed commands are registered', async () => {
    const cmds = await vscode.commands.getCommands();
    assert.ok(cmds.includes('cursorExport.exportNow'));
    assert.ok(cmds.includes('cursorExport.showOutput'));
  });
});
