# cursor-export

Monorepo for **Cursor Export** (`cursor-export`): export Cursor (and compatible VS Code) composer chats from read-only `state.vscdb` storage into Markdown under your workspace (default `.cursor/chats/`), plus a machine-readable `index.json`.

Repository: [github.com/jitrak-dev/cursor-export](https://github.com/jitrak-dev/cursor-export)

## Privacy and opt-in

- Chat exports can include **sensitive** content (prompts, code, secrets). Treat exported files like source code: review before sharing, and use `.gitignore` if you do not want them in git.
- The VS Code extension is **off by default** (`cursorExport.enabled`: `false`). Enable it only when you accept writing exports under the opened workspace.
- This tool **does not** upload chats anywhere; it only reads local SQLite and writes files you configure.

## Layout

| Package               | Role                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `packages/core`       | Paths, schema detection, SQLite read, Markdown export, schema guard |
| `packages/vscode-ext` | Extension: watch `state.vscdb`, debounce, run export                |

## Development

Requirements: Node **24+**, [pnpm](https://pnpm.io/) **11** (see `packageManager` in root `package.json`).

**Environment:** develop and run packaging on **Linux** or **macOS**. On **Windows**, use **WSL** (treat like Linux: same paths and shell). The VSIX / publish scripts are not aimed at native Windows shells.

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm format:check
```

### Commits

This repo uses [Conventional Commits](https://www.conventionalcommits.org/). The Husky [`commit-msg`](./.husky/commit-msg) hook runs [commitlint](https://commitlint.js.org/) (`commitlint.config.js`) so messages stay parseable for automated releases.

### Schema golden file

```bash
pnpm schema:dump   # refresh packages/core/schema/known-schema.json (optional: CURSOR_STATE_DB=/path/to/state.vscdb)
pnpm schema:diff   # CI/local: fail if sqlite_master drifts from golden
```

## VSIX (extension package)

The extension depends on **`better-sqlite3`**, which ships **native binaries**. A VSIX must be built on (or for) the **same platform** users install on (e.g. `darwin-arm64` for Apple Silicon Macs). CI builds **one VSIX per target** on matching GitHub runners and publishes each to Open VSX (see [`.github/workflows/extension-publish.yml`](./.github/workflows/extension-publish.yml)).

From the repo root:

```bash
pnpm extension:package
```

Without extra arguments, the script **infers** the VS Code target from `process.platform` / `process.arch` and writes:

`packages/vscode-ext/cursor-export-<version>-<target>.vsix`

(not committed; `*.vsix` is gitignored). Example: `cursor-export-1.0.2-linux-x64.vsix`. Install in Cursor or VS Code: **Extensions → … → Install from VSIX…**.

To build for an explicit platform (e.g. from Linux when preparing artifacts elsewhere):

```bash
pnpm extension:package -- --target darwin-arm64
```

### Publish to Open VSX (`jitrak-dev` namespace)

Primary distribution is the [public Open VSX Registry](https://open-vsx.org/) (VSCodium and many VS Code–compatible editors use it). The VSIX is built by [`package-vsix.mjs`](./packages/vscode-ext/scripts/package-vsix.mjs), which stages `README.md`, `LICENSE`, compiled `out/`, `icon.png`, and `images/` (for README assets), installs production dependencies on the **current runner OS**, then runs **vsce** with `--target <platform>` from `@vscode/vsce` (`^3.0.0` in [`packages/vscode-ext/package.json`](./packages/vscode-ext/package.json)). **vsce** 3.x requires Node **20+**; this repo uses **24+**. Publishing uses the [`ovsx`](https://github.com/eclipse/openvsx) CLI via **`pnpm exec ovsx`** from the devDependency **`ovsx@0.10.1`** (same version CI uses after `pnpm install`).

1. Create an **Open VSX** personal access token ([user settings → tokens](https://open-vsx.org/user-settings/tokens)). The namespace must match `publisher` in `packages/vscode-ext/package.json` (e.g. `jitrak-dev`); create the namespace first if needed ([publishing guide](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions)).
2. From repo root (packages for **this machine’s** inferred target, then uploads every `cursor-export-<version>-*.vsix` matching that version in `packages/vscode-ext/`, or a single legacy `cursor-export-<version>.vsix` if present):

```bash
pnpm extension:publish
```

This runs `pnpm extension:package` then uploads via [`publish-openvsx.mjs`](./packages/vscode-ext/scripts/publish-openvsx.mjs). To publish **one** platform-specific file without globbing (e.g. in CI), set **`VSCE_TARGET`** (e.g. `linux-x64`) or **`PUBLISH_VSIX`** to a path. Set the token in the environment (do **not** commit it):

```bash
export OPEN_VSX_TOKEN="<your-token-here>"
pnpm extension:publish
```

You can use `OVSX_PAT` instead of `OPEN_VSX_TOKEN` if you prefer the ovsx default name. For GitHub Actions, add a repository secret **`OPEN_VSX_TOKEN`**; the workflow [`.github/workflows/extension-publish.yml`](./.github/workflows/extension-publish.yml) maps it to `OVSX_PAT` when publishing on tag `v*` (or manual `workflow_dispatch`): a **matrix** builds and publishes `linux-x64`, `darwin-arm64`, `darwin-x64`, and `win32-x64`.

**Listing:** after publish, the extension appears under `https://open-vsx.org/extension/<publisher>/<name>` (e.g. `jitrak-dev` / `cursor-export`).

## Releases

- **Version and changelog:** [semantic-release](https://github.com/semantic-release/semantic-release) runs on pushes to **`main`** via [`.github/workflows/release.yml`](./.github/workflows/release.yml). It updates [`packages/vscode-ext/package.json`](./packages/vscode-ext/package.json), appends to root `CHANGELOG.md`, creates a GitHub Release, and pushes a release commit plus a **`v*`** tag. Config lives in [`.releaserc.cjs`](./.releaserc.cjs); local dry runs: `pnpm release` (needs a repo with tags and appropriate `GITHUB_TOKEN`).
- **Open VSX after release:** The tag push must trigger [extension-publish](.github/workflows/extension-publish.yml). GitHub’s default `GITHUB_TOKEN` does **not** start new workflows when it creates a tag, so this workflow uses a **personal access token** repository secret **`SEMANTIC_RELEASE_GITHUB_TOKEN`**. In [`.releaserc.cjs`](./.releaserc.cjs), `@semantic-release/github` has comments and failure issues disabled (`successComment` / `releasedLabels` / `failComment` / `failTitle`), so a **fine-grained** PAT can stay minimal: **Contents** read/write and **Metadata** read. Classic PAT: **`repo`** on private repos or **`public_repo`** on public repos still works.
- **Tag workflows vs. `[skip ci]`:** Release commits must **not** include `[skip ci]` in the message. GitHub skips `on: push` workflows for commits that contain it, which includes **tag** pushes pointing at that commit—so Publish Open VSX would never run. The next `Release` workflow run after a release commit is a no-op for semantic-release (no version bump), which is acceptable.
- **First-time baseline:** semantic-release infers the next version from existing **`v*`** git tags. This repo already has `v0.0.1` … `v0.0.4` aligned with the extension version; keep tags consistent with published Open VSX versions when introducing automation.
- **Manual publish:** You can still run `pnpm extension:publish` locally (it rebuilds for the inferred target, then uploads every `cursor-export-<version>-*.vsix` for that version in `packages/vscode-ext/`). To upload **one** file without repackaging, run `pnpm --filter cursor-export run publish:openvsx` with `VSCE_TARGET=<platform>` or `PUBLISH_VSIX=/path/to.vsix` and your token. If the registry says the version exists, merge conventional commits to `main` and let semantic-release bump, or use `workflow_dispatch` on extension-publish after a new tag exists.

If your default branch is not `main`, update `branches` in `.releaserc.cjs` and the branch filter in `release.yml` to match.

## Output format

- **Markdown** files: required YAML front matter keys `title`, `model`, `updated` (ISO-8601), then the thread body.
- **`index.json`**: maps stable composer id → relative path, title, updated.

Default output directory: `<workspace>/.cursor/chats/`. Override with setting `cursorExport.outputDirectory`.

## Donation channels

[![Support me on Ko-fi](packages/vscode-ext/images/support_me_on_kofi_dark.png)](https://ko-fi.com/U6U81YWLS6)

## License

MIT — see [LICENSE](./LICENSE).
