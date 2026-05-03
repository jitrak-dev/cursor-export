# 1.0.0 (2026-05-03)


### chore

* 🤖 move cursor-sync implementation plan document ([](https://github.com/jitrak-dev/cursor-export/commit/4d5580f7790c333133f9a9eb0b7cbb5c521dffac))
* initial import — Cursor Export monorepo ([](https://github.com/jitrak-dev/cursor-export/commit/e7d4f06bc62b5fce52c30da126d2c0ee016bcc07))


### fix

* **vscode-ext:** migrate tsconfig from deprecated node resolution ([](https://github.com/jitrak-dev/cursor-export/commit/15acfb09a07dd6c27d23444617f4505caaf89244))

# [1.0.0](https://github.com/jitrak-dev/cursor-export) (2026-05-04)

### release

* reset published version line to **1.0.0** after clearing prior Open VSX versions; GitHub releases use standard **`v*`** tags via semantic-release

# [2.0.0](https://github.com/jitrak-dev/cursor-export/compare/v1.1.0...v2.0.0) (2026-05-03)


* feat!: rebrand extension to Cursor Export (cursor-export) ([](https://github.com/jitrak-dev/cursor-export/commit/caffc037d010c724d9e628f38e043aa5e3888ef5))
* Merge branch 'develop' ([](https://github.com/jitrak-dev/cursor-export/commit/ddfee80e45c4f3103709a793f5cd9b6b48f29e66))
* Merge pull request #6 from jitrak-dev/develop ([](https://github.com/jitrak-dev/cursor-export/commit/e51046498967c9abec17a520dc236eeae6848c56)), closes [#6](https://github.com/jitrak-dev/cursor-export/issues/6)


### docs

* add Ko-fi donation links to README files ([](https://github.com/jitrak-dev/cursor-export/commit/54151b08a3355ebad20bc769cf34a7f71269d491))
* remove obsolete cursor-logs migration notes ([](https://github.com/jitrak-dev/cursor-export/commit/14fa94fe846913ebb55a6c918e7791a45fd7d5e5))


### fix

* **vscode-ext:** include extension icon in staged VSIX package ([](https://github.com/jitrak-dev/cursor-export/commit/67ad53b7ac537c19e552479c67a9be774b1eb2ed))


### BREAKING CHANGE

* Extension id is cursor-export (replaces cursor-sync).
* Rename settings from cursorSync.* to cursorExport.*.
* Rename commands to cursorExport.exportNow and cursorExport.showOutput.
* VSIX is cursor-export-<version>.vsix; core is @cursor-export/core.

Co-authored-by: Cursor <cursoragent@cursor.com>

# [1.1.0](https://github.com/jitrak-dev/cursor-sync/compare/v1.0.1...v1.1.0) (2026-05-03)


* Merge pull request #4 from jitrak-dev/develop ([](https://github.com/jitrak-dev/cursor-sync/commit/6ef8185f5931c5a2fe1829594b853377e0099fbb)), closes [#4](https://github.com/jitrak-dev/cursor-sync/issues/4)
* Merge pull request #5 from jitrak-dev/develop ([](https://github.com/jitrak-dev/cursor-sync/commit/1bda0aac0706ff6f7424a51ad38d91fb17393458)), closes [#5](https://github.com/jitrak-dev/cursor-sync/issues/5)


### chore

* **ci:** minimize PAT needs for semantic-release GitHub plugin ([](https://github.com/jitrak-dev/cursor-sync/commit/cd41725f38f16378e72896a2433de05120fe3d2d))


### docs

* **changelog:** expand 1.0.1 notes and harden release notes ([](https://github.com/jitrak-dev/cursor-sync/commit/5734f7c9ad590358ee1ef33945ef99d572520276))


### feat

* **vscode-ext:** add marketplace icon ([](https://github.com/jitrak-dev/cursor-sync/commit/04ad7720091647cc7a0f8d80c474546ad9c5855d))


### fix

* **ci:** avoid mutating commit in release-notes transform ([](https://github.com/jitrak-dev/cursor-sync/commit/cfe25e48d9dc0b9c7b2f36935966e80eb44863fd))

## [1.0.1](https://github.com/jitrak-dev/cursor-sync/compare/v1.0.0...v1.0.1) (2026-05-03)

### Bug Fixes

* **ci:** remove `[skip ci]` from semantic-release release commits ([48b4310](https://github.com/jitrak-dev/cursor-sync/commit/48b431070cbd0beda2549f78f40210a091986b1b))

### Notes

* Release commits previously included `[skip ci]`. GitHub skips **all** `on: push` workflows for commits whose message contains that marker—including **tag** pushes—so **Publish Open VSX** did not run for affected tags. Removing `[skip ci]` from the release commit template restores tag-triggered publishing.
* **PAT / GitHub plugin:** `@semantic-release/github` is configured without issue/PR comments so a fine-grained `SEMANTIC_RELEASE_GITHUB_TOKEN` only needs **Contents** and **Metadata** permissions.

# [1.0.0](https://github.com/jitrak-dev/cursor-sync/compare/v0.0.4...v1.0.0) (2026-05-03)

* feat!: release cursor-sync extension 1.0.0 ([de94406](https://github.com/jitrak-dev/cursor-sync/commit/de94406be9ec002a2b19045aa0a76f71ff1a2bbf))

### Bug Fixes

* **ci:** ignore CHANGELOG.md in Prettier ([4506f88](https://github.com/jitrak-dev/cursor-sync/commit/4506f881bd447ac246ac6b93de8c055d76808fbf))

### BREAKING CHANGES

* Promote initial stable 1.0.0 release on Open VSX.
