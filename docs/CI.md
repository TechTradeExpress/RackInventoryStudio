# CI Architecture

Single source of truth for what runs in GitHub Actions, why it's organized
this way, and how to debug a failure. For the release checklist itself see
[`docs/BETA_RELEASE_PROCESS_EN.md`](BETA_RELEASE_PROCESS_EN.md); for the WDIO
E2E program's scope and stage history see
[`docs/E2E_WDIO_PLAN.md`](E2E_WDIO_PLAN.md).

## Workflows

| File | Trigger | Purpose | Required check? |
|---|---|---|---|
| `ci.yml` | `pull_request`, `push` to `main`/`master`/`development`/`roadmap/**` | Rust workspace, version consistency, script/hygiene checks, frontend (typecheck/Vitest/build), workflow lint | Yes — every PR |
| `dependency-audit.yml` | weekly schedule, `workflow_dispatch`, PRs touching dependency files | `cargo audit` (advisory, non-blocking) and `pnpm audit` (blocking) | Only when dependency files change |
| `windows-installer.yml` | `workflow_dispatch` only | Builds an unsigned Windows NSIS installer artifact | No — on-demand build |
| `wdio-e2e.yml` | `workflow_dispatch` only | Runs the desktop WDIO E2E suite (one spec or all 22) against a real compiled Tauri binary | No — see "Desktop E2E execution policy" below |

All workflows set `permissions: contents: read` at the workflow level
(least privilege — none of them need to write to the repo, comment on PRs,
or manage releases) and a `concurrency` group keyed on
`${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`,
so pushing again to the same PR/branch cancels the now-stale run instead of
letting both finish.

### Desktop E2E execution policy

Full WDIO desktop E2E is an integration/release gate, not a per-commit gate
— see `docs/E2E_WDIO_PLAN.md`'s "Desktop E2E execution policy" section for
the full policy and its promotion path. `wdio-e2e.yml` currently implements
promotion step 1 only (manual `workflow_dispatch`, non-blocking). It is not
a required check on any branch.

## Composite actions

Three composite actions under `.github/actions/` remove setup duplication
that used to be copy-pasted across every workflow that needed it:

| Action | What it does | Used by |
|---|---|---|
| `setup-node-pnpm` | `pnpm/action-setup` → `actions/setup-node` (with pnpm store caching) → `pnpm install --frozen-lockfile` | `ci.yml` (frontend), `dependency-audit.yml` (frontend-audit), `windows-installer.yml`, `wdio-e2e.yml` |
| `setup-rust` | `dtolnay/rust-toolchain@stable` → `Swatinem/rust-cache@v2`. Takes a `cache-key-suffix` input so a build using a non-default `CARGO_TARGET_DIR` (the wdio-plugin binary, built into `target-wdio-plugin/`) doesn't collide with the regular `target/` cache on the same runner OS. | `ci.yml` (rust), `dependency-audit.yml` (rust-audit), `windows-installer.yml`, `wdio-e2e.yml` (build-binary) |
| `install-linux-system-deps` | Installs the Tauri/WebKitGTK build dependencies (`libwebkit2gtk-4.1-dev` etc.). Takes an `extra-packages` input for callers that also need to *run* the compiled binary (`webkit2gtk-driver xvfb openssh-server` for WDIO). | `ci.yml` (rust), `wdio-e2e.yml` (both jobs) |

Each caller still passes its own `node-version` explicitly (rather than
relying on the composite's default) so
`scripts/check-version-consistency.mjs`'s cross-workflow Node-version drift
check keeps working unchanged — it greps every `.github/workflows/*.yml`
file for `node-version:` declarations.

## `wdio-e2e.yml` — architecture

```
        ┌──────┐        ┌───────────────┐
        │ plan │        │ build-binary  │
        └──┬───┘        └───────┬───────┘
           │  outputs: specs[]  │  artifact: wdio-build
           └─────────┬──────────┘   (app binary + tauri-driver)
                      ▼
              wdio-spec (matrix)
              one job per spec, fail-fast: false
```

- **`plan`** resolves the `workflow_dispatch` `spec` input ("all" or one
  name) into a JSON array consumed by the matrix job — the same workflow
  serves both "debug one spec" and "run the full 22-spec program" without
  two separate workflow files.
- **`build-binary`** compiles the `wdio-plugin` test binary
  (`pnpm build:e2e:wdio-plugin`, the same script used locally) and installs
  a version-pinned `tauri-driver` (cached by version across runs) **once**,
  then uploads both as a single artifact.
- **`wdio-spec`** is a matrix over spec names. Every matrix job downloads
  the prebuilt artifact instead of compiling Rust itself — no Rust
  toolchain is installed in this job at all. Each job runs the project's
  own canonical runner unmodified:
  ```
  pnpm test:e2e:wdio -- --spec <name> --repeat <n> --skip-build \
    --binary <downloaded binary> --expect-plugin present
  ```
  This is deliberate: CI exercises exactly the same script a developer runs
  locally (`docs/E2E_WDIO_PLAN.md`'s canonical runner, with its own
  port-contract and PID-safe-cleanup guarantees), not a CI-only
  reimplementation of the invocation.

Building once and fanning out to N spec jobs — rather than each matrix job
building its own binary, or one job looping over all specs serially — is
the main performance decision here: it turns "N × (build + run)" into
"1 × build + N × run", and the N runs execute in parallel.

### Why `openssh-server` is installed for every spec job

Three of the 22 specs — `git-remote-workflows`, `git-clone-workflows`, and
`git-diverged-pull` — start a local, unprivileged `sshd` fixture
(`support/git-remote.ts`); `git-detection-init` and `git-local-workflows`
cover local-only Git and don't need it. Installing `openssh-server` only
for those three would need a second matrix dimension or per-spec
conditionals for a few seconds of saved install time — not worth the added
complexity, so it's installed unconditionally for all 22.

## Debugging a failed WDIO run

No re-run should be needed to diagnose a failure. Each `wdio-spec` job
uploads, unconditionally where applicable:

- **`wdio-log-<spec>`** — the full stdout/stderr of the run (WDIO's own
  reporter output plus the Tauri binary's own log lines, which
  `@wdio/tauri-service` forwards at `info` level per `wdio.conf.ts`).
  Uploaded on every outcome (`if: always()`), so a passing run's log is
  available too.
- **`wdio-tempdir-<spec>`** — the isolated run root (`/tmp/ris-wdio-*`),
  preserved on failure only via `RIS_E2E_KEEP_TEMP=1`. Contains whatever
  the app wrote during the run (repository files, app-generated logs).
- The job's **GitHub Actions summary** gets one line per spec with its
  outcome, so a full-suite run's pass/fail shape is visible without opening
  every job.

## Running WDIO locally

See `apps/desktop/e2e-wdio/wdio.conf.ts`'s module doc comment for full
prerequisites and options. Short version:

```bash
cargo install tauri-driver
sudo apt-get install -y webkit2gtk-driver xvfb openssh-server   # Linux
pnpm test:e2e:wdio -- --spec core-inventory
```

## Known limitations

- `wdio-e2e.yml` is Linux-only. Windows validation remains manual (see
  `docs/E2E_WDIO_PLAN.md`'s "Risks and open questions" and promotion step
  5) — pending a Windows matrix, not implemented here.
- The 22-spec matrix is a static, explicitly-maintained list in the
  workflow's `workflow_dispatch` input `options:` and in `plan`'s `ALL`
  array. A new spec file needs both updated deliberately; this is an
  intentional opt-in, not an oversight — see the review-context conventions
  in `CLAUDE.md` for why new E2E coverage is expected to be reviewed
  explicitly rather than auto-discovered.
