# Cursor Export

Export Cursor / VS Code **composer** chats from local `state.vscdb` storage into your workspace as Markdown (`.cursor/chats/` by default) and `index.json`.

## Privacy (read first)

Exports can contain **sensitive** data. The extension is **disabled by default**; turn on **Cursor Export: Enabled** only if you want files written under your workspace. Nothing is uploaded by this extension.

## Usage

1. Open a **folder** workspace (single-root v1).
2. Settings → search **Cursor Export** → enable **Enabled** when you want automatic exports on storage changes.
3. Or run command **Cursor Export: Export chats now** anytime.
4. Optional: **Cursor Export: Show output** for diagnostics.

## Settings

| Id                             | Default   | Description                                       |
| ------------------------------ | --------- | ------------------------------------------------- |
| `cursorExport.enabled`         | `false`   | Watch global + workspace `state.vscdb` and export |
| `cursorExport.outputDirectory` | _(empty)_ | Relative to workspace or absolute path            |
| `cursorExport.debounceMs`      | `800`     | Debounce after file changes before export         |

## Repository

Source and full monorepo docs: [github.com/jitrak-dev/cursor-export](https://github.com/jitrak-dev/cursor-export).

## Donation channels

[![Support me on Ko-fi](images/support_me_on_kofi_dark.png)](https://ko-fi.com/U6U81YWLS6)
