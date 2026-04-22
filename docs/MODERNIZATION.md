# Modernization Plan — webpack 5 + semantic-release

`@soda/friendly-errors-webpack-plugin` currently ships as `1.8.1` against a toolchain written for webpack 4: a `compiler.plugin(...)` fallback branch, a `require("webpack/lib/RequestShortener")` internal import, `memory-fs@0.4.1` in tests, `webpack@4.31.0` as the test-pinned devDependency, `jest@24`, and `eslint@5`. The `peerDependencies` field permits webpack 5, but nothing in the source or the test harness actually exercises webpack 5.

This document tracks the modernization effort in **three slices** plus one follow-up:

1. [Slice 1 — Webpack 5 core compatibility](#slice-1--webpack-5-core-compatibility)
2. [Slice 2 — Tooling & dependency hygiene](#slice-2--tooling--dependency-hygiene)
3. [Slice 3 — Release automation config (semantic-release)](#slice-3--release-automation-config-semantic-release)
4. [Follow-up — Release workflow & first live publish (paired)](#follow-up--release-workflow--first-live-publish-paired)

**Outcome:** a published `2.0.0` that targets webpack 5 exclusively, runs on a current Node LTS, has CI on every PR, and auto-releases from trunk on conventional-commits pushes to `master`.

## Decisions

| Topic | Decision |
| --- | --- |
| Webpack support | webpack 5 only — drop webpack 4. Breaking → major bump to `2.0.0`. |
| Node minimum | Align with webpack 5's own `engines.node` floor (currently `>=10.13.0`). |
| Commit convention | `conventionalcommits` preset with custom release rules (see Slice 3). |
| Publishing | GitHub Actions → npm only. No GitHub Releases; semantic-release still pushes tags + `CHANGELOG.md` commit. |
| `chalk` | Stay on `chalk@4.x`. Chalk 5 is ESM-only; this plugin ships CommonJS. |

Tracking is in beads. Epic + slice-child issues are created with `bd create` and wired with `bd dep add`. Run `bd list --status=open` or `bd show <id>` for current status.

## Slice 1 — Webpack 5 core compatibility

**Goal:** plugin runs correctly on webpack 5 with no internal-API imports; test suite actually runs against webpack 5.

### Scope

- `src/core/extractWebpackError.js:4` — remove `require("webpack/lib/RequestShortener")`. Replace with an inline duck-typed `{ shorten(id) { ... } }` object (strip `process.cwd()` prefix, normalize separators, strip leading `./`). `readableIdentifier(shortener)` only needs that interface.
- `src/friendly-errors-plugin.js:66-74` — delete the `else { compiler.plugin(...) }` branch. webpack 5 always exposes `compiler.hooks`.
- `package.json`:
  - `peerDependencies.webpack`: `"^5.0.0"` (drop `^4.0.0`).
  - `devDependencies.webpack`: `^5.x`.
  - Remove `memory-fs`; port `test/integration.spec.js` to `memfs`.
  - `engines.node`: match webpack 5's floor.
- `test/fixtures/*`: any fixture using `eslint-loader` switches to `eslint-webpack-plugin`; fixtures that exist only to cover Babel 6 errors get dropped.

### Acceptance criteria

- `grep -r "webpack/lib" src/` returns no matches.
- `npm test` passes with `webpack@5` pinned in `devDependencies`.
- `cd _sandbox && node watch.js` still produces the expected friendly errors (sandbox modernization lands in Slice 2, but the plugin code itself must not regress).

## Slice 2 — Tooling & dependency hygiene

**Goal:** clean, current toolchain — no dead dependencies, modern lint/test versions, CI on every PR, working sandbox.

### Scope

**`package.json` — remove** (unused or superseded):

- `babel-core` (6.26.3)
- `babel-loader-7` alias
- `babel-preset-react`
- `node-sass` (use `sass` — already a devDep)
- `eslint-7` alias
- `eslint-loader` (use `eslint-webpack-plugin`)
- `memory-fs` (handled in Slice 1)
- `expect` (bundled with jest)

**`package.json` — upgrade:**

- `eslint` → 8.x (keep `.eslintrc.json`; flat-config migration is out of scope).
- `eslint-plugin-node` → `eslint-plugin-n` (maintained fork).
- `jest` → 29.x.
- Loaders (`css-loader`, `sass-loader`, `postcss-loader`, `style-loader`, `autoprefixer`, `mini-css-extract-plugin`) → webpack-5-compatible versions.
- `chalk` — **stay on 4.x**.

**`.eslintrc.json`:** `parserOptions.ecmaVersion` → `2022`.

**`_sandbox/`:** rewrite `_sandbox/webpack.config.js` to webpack 5 (`module.rules`, `mode`, etc.); update `_sandbox/package.json`.

**CI — `.github/workflows/test.yml`:**

- Triggers: `pull_request` (any branch), `push` on `master`.
- Matrix: supported Node versions (e.g. `[18.x, 20.x, 22.x]`, trimmed to what webpack 5 declares).
- Steps: checkout → setup-node (with cache) → `npm ci` → `npm test`.
- Concurrency group per ref so redundant runs cancel.

### Acceptance criteria

- `npm install` produces no peer-dep or deprecation warnings traceable to our direct devDeps.
- Test workflow green on every matrix Node version in a PR.
- `_sandbox` boots and shows the expected friendly errors on webpack 5.

## Slice 3 — Release automation config (semantic-release)

**Goal:** all repo-side semantic-release configuration is in place — `.releaserc`, `package.json` fields, optional commitlint, README. The live GitHub Actions release workflow is a follow-up (see below).

### Scope

**Add `.releaserc`** (extension-less — semantic-release auto-detects JSON):

```json
{
  "branches": ["master"],
  "plugins": [
    ["@semantic-release/commit-analyzer", {
      "preset": "conventionalcommits",
      "releaseRules": [
        { "type": "chore",    "release": false },
        { "type": "perf",     "release": "patch" },
        { "type": "compat",   "release": "patch" },
        { "type": "refactor", "release": "minor" },
        { "type": "style",    "release": "patch" }
      ],
      "parserOpts": { "noteKeywords": ["BREAKING CHANGE", "BREAKING CHANGES"] }
    }],
    ["@semantic-release/release-notes-generator", {
      "preset": "conventionalcommits",
      "presetConfig": {
        "types": [
          { "type": "feat",     "section": ":sparkles: Features",      "hidden": false },
          { "type": "fix",      "section": ":bug: Bug Fixes",          "hidden": false },
          { "type": "compat",   "section": ":gear: Compatibility",     "hidden": false },
          { "type": "refactor", "section": ":recycle: Refactor",       "hidden": false },
          { "type": "style",    "section": ":art: Code style",         "hidden": false },
          { "type": "perf",     "section": ":rocket: Performance",     "hidden": false },
          { "type": "chore",    "section": ":wrench: Maintenance",     "hidden": false }
        ]
      }
    }],
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    "@semantic-release/npm",
    ["@semantic-release/git", {
      "assets": ["package.json", "CHANGELOG.md"],
      "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
    }]
  ]
}
```

No `@semantic-release/github` plugin — GitHub Releases are not created.

**No semantic-release devDependencies.** semantic-release and its plugins are installed by the GitHub Action at CI time (via `extra_plugins` or a pinned action wrapper). Keeps local installs lean and makes "does it release?" a CI-only question.

**`package.json` adjustments:**

- `"version": "0.0.0-semantic-release"` — semantic-release overwrites on publish.
- `"publishConfig": { "access": "public" }` — required for the scoped `@soda/...` name.
- No `semantic-release` npm script.

**Commit-message guardrails (optional, separate bead):** `@commitlint/cli` + `@commitlint/config-conventional` + `husky` `commit-msg` hook.

**README updates:**

- Add a "Contributing" section with a Conventional Commits cheat-sheet (type → release bump).
- Drop Travis CI / AppVeyor badges (both dead); add a GitHub Actions badge.
- Remove the stale `TODO: Make it compatible with node 4` line.

### Acceptance criteria

- `.releaserc` validates with `npx semantic-release --dry-run` (local run against a feature branch) without config errors.
- `package.json` version is `0.0.0-semantic-release` and `publishConfig.access` is `"public"`.
- README's Contributing section documents the conventional-commits convention and the release-rule mapping.

## Follow-up — Release workflow & first live publish (paired)

**Why this is a separate bead, not part of Slice 3:**

- Requires provisioning the `NPM_TOKEN` secret on the repo.
- Requires a live dry-run / first publish that benefits from pair-debugging.

### Scope (for reference — executed together with repo owner)

- `.github/workflows/release.yml`:
  - Trigger: `push` on `master`.
  - Permissions: `contents: write` (tag + changelog commit). `id-token: write` if npm provenance is desired.
  - Steps: checkout with `fetch-depth: 0` → setup-node → `npm ci` → run semantic-release via a GitHub Action that brings semantic-release + plugins as `extra_plugins`.
  - Secrets: `NPM_TOKEN`.
- Verification:
  - A `feat:` commit to `master` publishes `@soda/friendly-errors-webpack-plugin@<next>` to npm, commits `CHANGELOG.md` back, and creates the git tag. Confirm with `npm view @soda/friendly-errors-webpack-plugin` and `git ls-remote --tags`.
  - A `chore:` commit does **not** trigger a release (per `releaseRules`).

## Out of scope

- Migrating `.eslintrc.json` to ESLint 9 flat config.
- TypeScript rewrite or `.d.ts` declaration files.
- Webpack 6 forward-compat (not released yet).
- Any change to the public plugin API (constructor options, transformer/formatter contracts). The pipeline contract in `CLAUDE.md` stays intact — this is a compat + tooling release, not a feature release.
