# cursor-logs

Export Cursor / VS Code **composer** chats from local `state.vscdb` storage into your workspace as Markdown (`.cursor/chats/` by default) and `index.json`.

## Privacy (read first)

Exports can contain **sensitive** data. The extension is **disabled by default**; turn on **Cursor Logs: Enabled** only if you want files written under your workspace. Nothing is uploaded by this extension.

## Usage

1. Open a **folder** workspace (single-root v1).
2. Settings → search **Cursor Logs** → enable **Enabled** when you want automatic exports on storage changes.
3. Or run command **Cursor Logs: Export chats now** anytime.
4. Optional: **Cursor Logs: Show output** for diagnostics.

## Settings

| Id                           | Default   | Description                                       |
| ---------------------------- | --------- | ------------------------------------------------- |
| `cursorLogs.enabled`         | `false`   | Watch global + workspace `state.vscdb` and export |
| `cursorLogs.outputDirectory` | _(empty)_ | Relative to workspace or absolute path            |
| `cursorLogs.debounceMs`      | `800`     | Debounce after file changes before export         |

## Repository

Source and full monorepo docs: [github.com/jitrak-dev/cursor-logs](https://github.com/jitrak-dev/cursor-logs).
