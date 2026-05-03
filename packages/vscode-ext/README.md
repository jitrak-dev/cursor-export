# cursor-sync

Export Cursor / VS Code **composer** chats from local `state.vscdb` storage into your workspace as Markdown (`.cursor/chats/` by default) and `index.json`.

## Privacy (read first)

Exports can contain **sensitive** data. The extension is **disabled by default**; turn on **Cursor Sync: Enabled** only if you want files written under your workspace. Nothing is uploaded by this extension.

## Migrating from cursor-logs

If you previously used the **cursor-logs** extension, uninstall it and install **cursor-sync**. Settings and commands use new ids: **`cursorSync.*`** (not `cursorLogs.*`); re-enable **Enabled** and any custom output path after upgrading.

## Usage

1. Open a **folder** workspace (single-root v1).
2. Settings → search **Cursor Sync** → enable **Enabled** when you want automatic exports on storage changes.
3. Or run command **Cursor Sync: Export chats now** anytime.
4. Optional: **Cursor Sync: Show output** for diagnostics.

## Settings

| Id                            | Default   | Description                                       |
| ----------------------------- | --------- | ------------------------------------------------- |
| `cursorSync.enabled`          | `false`   | Watch global + workspace `state.vscdb` and export |
| `cursorSync.outputDirectory`  | _(empty)_ | Relative to workspace or absolute path            |
| `cursorSync.debounceMs`       | `800`     | Debounce after file changes before export         |

## Repository

Source and full monorepo docs: [github.com/jitrak-dev/cursor-sync](https://github.com/jitrak-dev/cursor-sync).
