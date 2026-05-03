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

**Environment:** develop and run packaging on **Linux** or **macOS**. On **Windows**, use **WSL** (treat like Linux: same paths and shell). The VSIX / publish scripts are not aimed at native Windows shells.

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

### Publish to Open VSX (`jitrak-dev` namespace)

Primary distribution is the [public Open VSX Registry](https://open-vsx.org/) (VSCodium and many VS Code–compatible editors use it). The VSIX is built by [`package-vsix.mjs`](./packages/vscode-ext/scripts/package-vsix.mjs) invoking the **`vsce`** binary from the devDependency **`@vscode/vsce@2.32.0`** under `packages/vscode-ext/node_modules/.bin` (2.x avoids vsce 3.x secret-scan issues with this staging layout). Publishing uses the [`ovsx`](https://github.com/eclipse/openvsx) CLI via **`pnpm dlx ovsx@0.10.1`** (not declared in `package.json`; only runs when you publish).

1. Create an **Open VSX** personal access token ([user settings → tokens](https://open-vsx.org/user-settings/tokens)). The namespace must match `publisher` in `packages/vscode-ext/package.json` (e.g. `jitrak-dev`); create the namespace first if needed ([publishing guide](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions)).
2. From repo root:

```bash
pnpm extension:publish
```

This runs `pnpm extension:package` then uploads the VSIX. Set the token in the environment (do **not** commit it):

```bash
export OPEN_VSX_TOKEN="<your-token-here>"
pnpm extension:publish
```

You can use `OVSX_PAT` instead of `OPEN_VSX_TOKEN` if you prefer the ovsx default name. For GitHub Actions, add a repository secret **`OPEN_VSX_TOKEN`**; the workflow [`.github/workflows/extension-publish.yml`](./.github/workflows/extension-publish.yml) maps it to `OVSX_PAT` when publishing on tag `v*` (or manual `workflow_dispatch`).

**Listing:** after publish, the extension appears under `https://open-vsx.org/extension/<publisher>/<name>` (e.g. `jitrak-dev` / `cursor-logs`).

If the registry reports the version already exists, bump `version` in `packages/vscode-ext/package.json`, then run `pnpm extension:publish` again.

## Output format

- **Markdown** files: required YAML front matter keys `title`, `model`, `updated` (ISO-8601), then the thread body.
- **`index.json`**: maps stable composer id → relative path, title, updated.

Default output directory: `<workspace>/.cursor/chats/`. Override with setting `cursorLogs.outputDirectory`.

## License

MIT — see [LICENSE](./LICENSE).
