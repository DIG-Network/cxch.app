# Contributing to cxch.app

Thanks for your interest in improving cxch.app. This project is a dApp built on the DIG Network and Chia blockchain — please read this before opening a PR.

## Reporting an issue

File it at [github.com/DIG-Network/cxch.app/issues](https://github.com/DIG-Network/cxch.app/issues) with:

- what you observed vs. what you expected,
- steps to reproduce,
- the environment (browser/OS/version if applicable).

## Prerequisites

- **Node >= 18** (the package's declared minimum).
- **Rust** with `wasm32-unknown-unknown` target (the `cmojo-core` WASM library must build).
- **wasm-pack** (installed automatically in CI; install locally with `cargo install wasm-pack`).

## Build & test

```bash
# Install dependencies (Node packages only)
npm install

# Build the WASM core library (required first, consumed by the app)
npm run build:wasm

# Run tests + coverage (>=80% gated in CI)
npm run coverage

# Build the production app
npm run build
```

The Rust `cmojo-core` workspace builds its own tests and produces a WASM package that the Node app consumes. See `cmojo-core/README.md` for Rust-specific details.

## The gate

CI runs these on every PR (`.github/workflows/ci.yml`); run them locally first:

### Rust core (`cmojo-core`)

```bash
cd cmojo-core
cargo nextest run --release --retries 2
wasm-pack build --release --target web --out-dir ../app/wasm-pkg
```

### Frontend (`app`)

```bash
cd app
npm install
npm run lint          # eslint
npx tsc --noEmit      # typecheck
npm run coverage      # vitest (fails below 80%)
npm run build         # next build
```

Separate required checks (`.github/workflows/`):

- **Commit format** (`.github/workflows/commitlint.yml`) — see below.
- **Version increment** (`.github/workflows/ensure-version-increment.yml`) — `package.json`'s `version` must be strictly greater than on `main`.

`main` is protected: every required check must be green, every review thread must be resolved (incl. CodeQL), and merges are squash-only.

## Commit conventions

Conventional Commits, enforced by `commitlint.config.mjs` in CI: `type(scope): summary`, where
`type` is one of `feat|fix|docs|style|refactor|perf|test|build|ci|chore`. A breaking change appends `!` and/or a `BREAKING CHANGE:` footer. The type drives the SemVer bump (`fix` → patch, `feat` → minor, `!`/`BREAKING CHANGE` → major) — bump `package.json`'s `version` before opening the PR.

## Pull requests

1. Branch from `main`.
2. Make the gate green locally (lint, typecheck, coverage, build).
3. Bump `package.json`'s `version` to match the change (patch/minor/major).
4. Run `npm install --package-lock-only` to update `package-lock.json`.
5. Open a PR with a clear description of what changed and why.
6. Resolve every review thread. On merge, the release workflow tags the commit `vX.Y.Z` and publishes to npm.

## License

Proprietary — see `LICENSE`.

