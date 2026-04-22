# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->

## Build & Test

No build step — the package ships `src/` and `index.js` as-is (see `package.json` `files`).

```bash
yarn install                         # install deps (CI uses yarn; npm install also works)
npm test                             # lint (excluding test/) + jest
npx jest test/integration.spec.js    # run one test file
npx jest -t "integration : success"  # run one test by name

# Manual smoke test against a live webpack build (intentional errors are baked in):
cd _sandbox && node watch.js
```

`npm test` runs `eslint --ignore-pattern "test/**" . && jest --testEnvironment node`. Lint failures block the test run — fix lint before investigating Jest failures. Node ≥ 8; peer dep is `webpack ^4 || ^5`.

## Architecture Overview

The plugin taps `compiler.hooks.done` and `compiler.hooks.invalid` (with a fallback to the pre-webpack-4 `compiler.plugin(...)` API) and runs webpack's errors through a four-phase pipeline. All four phases are extensible via the `additionalTransformers` / `additionalFormatters` constructor options.

1. **Extract** — `src/core/extractWebpackError.js` normalizes each raw webpack error into `{ message, file, origin, name, severity: 0, webpackError, originalStack }`. Uses `webpack/lib/RequestShortener` to shorten module paths relative to `process.cwd()`.
2. **Transform** — `src/core/transformErrors.js` applies each transformer (`WebpackError => AnnotatedError`) in sequence. Transformers recognize a known error class and attach a `type`, a numeric `severity`, and a rewritten `message`. Defaults live in `src/transformers/` (`babelSyntax`, `moduleNotFound`, `esLintError`).
3. **Prioritize** — `getMaxSeverityErrors` in `src/friendly-errors-plugin.js` keeps only the errors at the highest severity level. The plugin shows **one category at a time** on purpose; this is why new transformers must set a meaningful `severity`.
4. **Format** — `src/core/formatErrors.js` passes the surviving errors to each formatter (`(errors, errorType) => string[]`) and concatenates the results into the lines written via `output.log`. Defaults live in `src/formatters/` (`moduleNotFound`, `eslintError`, `defaultError`).

### Other key modules

- **`src/output.js`** is a singleton `Debugger` wrapping `console.log` with chalk-colored titles. It supports a **capture mode** (`output.capture()` / `output.endCapture()` / `output.capturedMessages`) used by the integration tests to assert on exact lines. In `NODE_ENV=test` the trailing timestamp is suppressed; `clearConsole()` is a no-op unless `stdout.isTTY` and `CI` is unset.
- **Multi-compiler handling** lives in `friendly-errors-plugin.js`: `isMultiStats`, `getMultiStatsCompileTime` (takes the max, since sub-compilers run in parallel), and the recursive `findErrorsRecursive` which walks into `compilation.children` when a parent compilation has no direct errors. Errors are deduped across children by message via `utils.uniqueBy`.
- **`src/utils/index.js`** exports `concat` (flattening concat that drops null/undefined — used to merge user-supplied transformers with defaults) and `uniqueBy`.

### Tests

- `test/integration.spec.js` drives real webpack against fixture configs in `test/fixtures/<name>/webpack.config.js`, writes output to `memory-fs`, and asserts on the captured log lines. Adding a new error class usually means adding a fixture plus an integration assertion.
- `test/unit/{plugin,transformers,formatters,utils}/*.spec.js` exercise individual pieces in isolation.

## Conventions & Patterns

- **Don't break the pipeline contract.** A transformer must return the same `AnnotatedError` shape it received (use `Object.assign({}, error, { ... })` — see `src/transformers/moduleNotFound.js`) and pass through untouched errors it doesn't handle. A formatter must return `string[]` (or a falsy value, which is treated as empty).
- **Assign `severity` deliberately.** The highest-severity bucket wins and hides the rest (e.g. `moduleNotFound` uses `900`). Too high masks other errors; too low gets masked.
- **Tests capture exact output.** Many integration assertions compare full strings including whitespace. When changing formatter output, expect to update fixture expectations — and remember that `NODE_ENV=test` suppresses timestamps so that equality holds.
- **Webpack 4 + 5 dual support.** The `compiler.hooks` / `compiler.plugin(...)` fork in `apply()` exists to support both. Don't collapse it without a release note.
- **`_sandbox/`** is a scratch area for manual verification — not covered by tests or lint and may contain intentional errors.
