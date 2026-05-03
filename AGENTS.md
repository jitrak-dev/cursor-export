# AGENTS.md

## Cursor Cloud specific instructions

### Branch layout

The primary development branch is `develop` (not `main`). All source code, configs, and CI live there. The `main` branch only contains the initial commit (`.gitignore` + `LICENSE`). Always work from `develop`.

### Monorepo overview

| Package                           | Path                  | Purpose                                                         |
| --------------------------------- | --------------------- | --------------------------------------------------------------- |
| `@cursor-logs/core`               | `packages/core`       | Path resolution, SQLite read, schema detection, Markdown export |
| `cursor-logs` (VS Code extension) | `packages/vscode-ext` | Extension: watch `state.vscdb`, debounce, run export            |

### Development commands

All commands are documented in the root `package.json` scripts and the `README.md`. Key commands from repo root:

- `pnpm install` — install all dependencies (includes native `better-sqlite3` compilation)
- `pnpm build` — TypeScript compile (`tsc -b`) for both packages
- `pnpm test` — run Vitest tests in `@cursor-logs/core`
- `pnpm lint` — ESLint
- `pnpm format:check` — Prettier check
- `pnpm extension:package` — build the `.vsix` file

### Pre-commit hooks

The `.husky/pre-commit` hook runs `pnpm lint`, `pnpm test`, and `pnpm format:check`. These must all pass before committing.

### Node.js version

The project requires **Node.js >= 24**. The `packageManager` field specifies `pnpm@11.0.4`; Corepack handles this automatically.

### Native dependencies

`better-sqlite3` requires native C++ compilation. The `pnpm-workspace.yaml` file has `allowBuilds` for `better-sqlite3`, `keytar`, and `@vscode/vsce-sign`. Build tools (`build-essential`, `python3`, `make`) must be present on the system.

### Testing notes

- Tests are only in `packages/core` (Vitest). The VS Code extension package has no automated tests.
- Test fixtures use in-memory SQLite databases to simulate Cursor's `state.vscdb`.
- There is no dev server to start — this is a VS Code extension + library project. The "hello world" verification is building the VSIX via `pnpm extension:package`.
