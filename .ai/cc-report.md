## Summary

Beta 4 Stage R1: prepares the `v0.1.0-beta.4` release candidate. Cut
`release/v0.1.0-beta.4` from the exact current `origin/development` HEAD
(`662eb68`, confirmed identical to PR #171's merge commit), bumped all four
canonical version sources to `0.1.0-beta.4`, reconciled `CHANGELOG.md` so
beta.3 is no longer represented as a shipped release (its full prepared
scope now lives under a `v0.1.0-beta.4 — Unreleased` heading, alongside
everything merged since — no calendar date assigned yet, per the
release-process date-freeze model documented in this stage), and prepared
beta.4 release notes, a beta.4 QA runbook overlay, updated release-process
documentation, and formal documentation of the one-time WDIO bootstrap
exception required because `wdio-e2e.yml` does not yet exist on `master`.

This is release-preparation only. No application code, fixture code, or
CI workflow file changed. No installer was built, no Windows QA was run,
no WDIO gate was dispatched, nothing was merged to `master`, and no tag or
GitHub Release was created — all explicitly out of scope for this stage.

## Files changed

- `package.json`, `apps/desktop/package.json`,
  `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/tauri.conf.json`
  — version bumped `0.1.0-beta.3` → `0.1.0-beta.4` via
  `pnpm bump:version 0.1.0-beta.4` (all four canonical sources, verified
  consistent via `pnpm check:version`).
- `Cargo.lock` — the local `rack-inventory-studio-desktop` package's own
  version entry updated to `0.1.0-beta.4` as a side effect of running
  `cargo fmt`/`clippy`/`test` after the bump (expected; no dependency
  version changed).
- `CHANGELOG.md` — removed the `v0.1.0-beta.3` heading as a normal
  shipped-version section (it was never shipped); its content (17 PRs:
  search/filter, searchable select, contextual rack object form,
  planning/on-site mode, create similar, autofill device type, clone
  repository flow, rack export SVG/PNG, CSV import for device models, list
  scrolling fix, daily log rotation, placement inspector fix, clone
  transport-safety hardening, export write restriction) now lives under a
  new `## v0.1.0-beta.4 — Unreleased` heading, with one new `Fixed` entry
  (the Windows clone UI-thread hang fix) and a new `Testing and
  reliability` note (Windows Git-over-SSH E2E validation — framed as test
  infrastructure, not an application feature, per this stage's own
  instruction). `Known issues` updated: manual QA now points at
  `BETA4_QA_RUNBOOK.md`; the WDIO-gate caveat now names the actual
  `wdio-e2e.yml`/`master` bootstrap gap instead of the older generic
  wording; added a Linux/macOS deferred-acceptance note (maintainer-facing,
  does not affect application behavior). No calendar date assigned.
- `docs/releases/v0.1.0-beta.4.md` (new) — release notes covering Summary,
  Highlights, Git and repository workflow improvements, Windows
  reliability, Security, Testing and validation (explicitly does **not**
  claim Windows QA, installer, or WDIO gates have passed — all marked
  outstanding), Known limitations, Upgrade/install notes.
- `docs/BETA4_QA_RUNBOOK.md` (new) — release-specific overlay, not a
  duplicate of the general Windows QA doc or the beta.3 checklist; both are
  referenced and remain required. Adds install/upgrade, version-string,
  clone-responsiveness regression, and Git-workflow-regression checks
  specific to beta.4. Requires only the packaged application — no E2E
  Docker fixture access.
- `docs/BETA_RELEASE_PROCESS_EN.md` — brought forward from beta.3 to
  beta.4 throughout (pre-release tag table, version-bump examples, branch
  examples, QA references, related-documents list). Corrected the
  CHANGELOG-workflow date-timing model: the release-candidate heading now
  stays `— Unreleased` through the entire preparation/validation process
  and only gets its date filled in immediately before tagging, so editing
  the changelog after RC validation never changes the already-validated
  release SHA. Added the full one-time beta.4 WDIO bootstrap exception
  procedure (pre-merge gates → bootstrap merge, untagged → post-merge
  exact-`master` WDIO gate → tag only after that passes → failure handling
  → exception expires after beta.4).
- `.ai/cc-report.md` — this file.

No application source file changed. No fixture implementation file
changed. No `.github/workflows/*.yml` file changed (`windows-installer.yml`
was audited, not modified — see Risks). `pnpm-lock.yaml` unchanged (no
dependency version changed).

## Tests

Full static validation suite re-run on the release branch after the
version bump — see the table below. No application/fixture test code
changed, so no new tests were added.

## Static validation

All run via `corepack pnpm` (repository-declared `pnpm@10.33.4`) or
`cargo`/`actionlint` directly:

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | clean |
| `pnpm check:version` | ✓ all four sources at `0.1.0-beta.4` |
| `pnpm check:hygiene` | ✓ 8/8 |
| `pnpm test:scripts` | ✓ 237/237 |
| `pnpm --filter @rack-inventory-studio/desktop typecheck` | clean |
| `pnpm --filter @rack-inventory-studio/desktop test` | ✓ 1313/1313 |
| `pnpm --filter @rack-inventory-studio/desktop build` | succeeded |
| `cargo fmt --all -- --check` | clean |
| `cargo clippy --workspace -- -D warnings` | clean |
| `cargo test --workspace` | ✓ all passed |
| `pnpm build:e2e:wdio-plugin` | succeeded |
| `actionlint` | clean, no findings |
| `git diff --check` | clean |

## Risks

- **`windows-installer.yml` not dispatched or otherwise exercised** in this
  stage (correctly out of scope) — the release branch inherits the
  modernized Node 24/composite-action version from `development`; `master`
  still has the older Node 22 raw-actions version. Confirmed by direct
  comparison, not modified. The first real dispatch of the modernized
  workflow will be against this release branch, in a later stage.
- **WDIO bootstrap gap remains genuinely unresolved** — this is a
  structural GitHub limitation (a `workflow_dispatch` workflow must exist
  on the default branch before it can be dispatched), not something this
  stage could close. The one-time bootstrap procedure is now formally
  documented (`docs/BETA_RELEASE_PROCESS_EN.md`), but has not been
  executed — no installer built, no Windows QA run, no WDIO dispatch, no
  merge to `master`.
- **Dependency state unchanged from Stage 3F.5.9's findings** — this
  release branch touches no dependency files. `quick-xml`'s two real
  vulnerabilities remain resolved (patched version already in the
  lockfile). Unmaintained/unsound Rust advisories (GTK3 bindings, `anyhow`,
  `glib`, `serde_yml`) and frontend `undici` advisories (WDIO dev-tooling
  only) persist, pre-existing on `development`, with no safe in-scope
  upgrade identified. No newly discovered exploitable shipped-runtime
  vulnerability — not a release blocker.
- **No release-blocking defect was discovered** during preparation, so no
  application-code repair was needed or made in this stage.

## Not done

- Installer build, Windows 11 manual QA, WDIO dispatch (blocked on the
  documented bootstrap procedure), merge to `master`, tag, or GitHub
  Release — all explicitly out of scope for this stage.
- Calendar release date not assigned to the `CHANGELOG.md`/release-notes
  heading — deliberately deferred to immediately before tagging.

## Suggested next step

Push the release branch, open the draft release PR to `master`, and once
its CI is green, proceed to the pre-merge gates (installer build, Windows
11 manual QA against `BETA3_QA_RUNBOOK.md` + `BETA4_QA_RUNBOOK.md`) before
attempting the one-time bootstrap merge documented in
`docs/BETA_RELEASE_PROCESS_EN.md`.
