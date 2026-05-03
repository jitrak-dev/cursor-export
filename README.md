# cursor-logs

Monorepo for **cursor-logs**: export Cursor (and compatible VS Code) composer chats from read-only `state.vscdb` storage into Markdown under your workspace (default `.cursor/chats/`), plus a machine-readable `index.json`.

Repository: [github.com/jitrak-dev/cursor-logs](https://github.com/jitrak-dev/cursor-logs)

## Privacy and opt-in

- Chat exports can include **sensitive** content (prompts, code, secrets). Treat exported files like source code: review before sharing, and use `.gitignore` if you do not want them in git.
- The VS Code extension is **off by default** (`cursorLogs.enabled`: `false`). Enable it only when you accept writing exports under the opened workspace.
- This tool **does not** upload chats anywhere; it only reads local SQLite and writes files you configure.

## Layout

| Package               | Role                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `packages/core`       | Paths, schema detection, SQLite read, Markdown export, schema guard |
| `packages/vscode-ext` | Extension: watch `state.vscdb`, debounce, run export                |

## Development

Requirements: Node 20+, [pnpm](https://pnpm.io/) 9.

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm format:check
```

### Schema golden file

```bash
pnpm schema:dump   # refresh packages/core/schema/known-schema.json (optional: CURSOR_STATE_DB=/path/to/state.vscdb)
pnpm schema:diff   # CI/local: fail if sqlite_master drifts from golden
```

## VSIX (extension package)

From the repo root:

```bash
pnpm extension:package
```

Writes `packages/vscode-ext/cursor-logs-<version>.vsix` (not committed; `*.vsix` is gitignored). Install in Cursor or VS Code: **Extensions → … → Install from VSIX…**.

### Publish to Marketplace (`jitrak-dev` publisher)

1. Create an Azure DevOps **Personal Access Token** with scope **Marketplace → Manage** ([docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token)).
2. Ensure `publisher` in `packages/vscode-ext/package.json` matches your Marketplace publisher **ID** (e.g. `jitrak-dev`).
3. From repo root:

```bash
pnpm extension:publish
```

This builds the VSIX then uploads it. Set the token in the environment (do **not** commit it):

```bash
export VSCE_PAT="<your-pat-here>"
pnpm extension:publish
```

Or one line: `VSCE_PAT="<token>" pnpm extension:publish`

**Marketplace web UI:** after the publisher exists, open the publisher’s **Extensions** tab to see uploaded versions; profile **Details** (name, domain, logo) is separate from uploading the extension.

If `vsce` reports the version already exists, bump `version` in `packages/vscode-ext/package.json`, rebuild, and publish again.

## Output format

- **Markdown** files: required YAML front matter keys `title`, `model`, `updated` (ISO-8601), then the thread body.
- **`index.json`**: maps stable composer id → relative path, title, updated.

Default output directory: `<workspace>/.cursor/chats/`. Override with setting `cursorLogs.outputDirectory`.

## License

MIT — see [LICENSE](./LICENSE).
