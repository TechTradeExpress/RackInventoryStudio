# CC Report — PR L: Supply/dependency visibility (SUPPLY-01)

## Summary

PR L adds automated dependency visibility before wider beta distribution:
Dependabot configuration for three ecosystems, a new `dependency-audit` CI
workflow (cargo-audit + pnpm audit), and a plan-doc reorder that moves TEST-01
to "before beta release checklist" rather than treating it as the next numbered
implementation PR.

## Files changed

| File | Change |
|---|---|
| `.github/dependabot.yml` | New — Dependabot for github-actions, cargo, npm (pnpm) |
| `.github/workflows/dependency-audit.yml` | New — weekly + PR-triggered cargo-audit and pnpm audit jobs |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | PR L row in table; SUPPLY-01 in hardening backlog; TEST-01 moved to "Before beta release checklist" section; Section 16 added |
| `.ai/cc-report.md` | This file |

## Plan reorder summary

- PR L (SUPPLY-01) row added to the PR table and "Should fix before wider beta"
  hardening table.
- TEST-01 moved from the "Should fix before wider beta" row (implying it is a PR
  task) to a dedicated "Before beta release checklist" section. TEST-01 is a
  manual/semi-automated gate for the release engineer, not an implementation PR.
- "Can wait" list: removed "Dependency audit" entry (now implemented). Remaining
  post-beta.2 items unchanged.
- Section 16 added describing Dependabot setup, workflow design, blocking/non-blocking
  rationale.

## Dependency visibility implementation

### Dependabot (`.github/dependabot.yml`)

- `github-actions` at `/` — weekly Monday
- `cargo` at `/` — weekly Monday; minor/patch updates grouped
- `npm` at `/apps/desktop` — weekly Monday; minor/patch updates grouped

No auto-merge configured. Commit prefixes: `ci` (actions), `chore(deps)` (cargo/npm).

### Audit workflow (`.github/workflows/dependency-audit.yml`)

Triggers:
- `schedule`: weekly Monday 06:00 UTC
- `workflow_dispatch`: manual
- `pull_request` on paths: `Cargo.lock`, `**/Cargo.toml`, `pnpm-lock.yaml`,
  `**/package.json`, `.github/workflows/dependency-audit.yml`

Jobs:
- `rust-audit`: `dtolnay/rust-toolchain@stable` + `Swatinem/rust-cache@v2` +
  `cargo install cargo-audit --locked` + `cargo audit`
- `frontend-audit`: pnpm install + `pnpm audit --audit-level moderate`
  (working-directory: `apps/desktop`)

### Blocking vs non-blocking

Both jobs use `continue-on-error: true`. Rationale: the current audit state
cannot be verified locally (neither `cargo-audit` nor `pnpm` are available in
the development environment). Making jobs non-blocking on introduction is the
safe default — findings are always visible in the workflow log. Once any
pre-existing findings are resolved, `continue-on-error` can be removed to make
the jobs blocking.

## Tests

```
git diff --check
```
Clean.

```
node scripts/check-version-consistency.mjs
```
Pass — 0.1.0-beta.1 consistent.

```
node --test scripts/*.test.mjs
```
17/17 pass.

```
node scripts/check-repo-hygiene.mjs
```
All 8 checks pass.

```
cargo fmt --all --check
```
Clean (no Rust code changes).

```
cargo check --workspace
```
Pass.

```
cargo test --workspace
```
All pass, 0 failures.

```
cargo clippy --workspace -- -D warnings
```
Clean.

```
npx tsc --noEmit
```
No type errors.

```
npx vitest run
```
42 test files, 539 tests — all pass.

The `dependency-audit` workflow was validated by actionlint (runs in CI as part
of the existing `workflow-lint` job).

**First GitHub Actions run results** (PR #100):

- `rust-audit` — **pass**. No Rust advisories found.
- `frontend-audit` — **fail (expected/visible)**. `pnpm audit` ran correctly and
  found 2 moderate advisories:

| Advisory | Package | Installed | Vulnerable | Patched | Path | Ref |
|---|---|---|---|---|---|---|
| esbuild dev server SSRF | `esbuild` | 0.21.5 | ≤0.24.2 | ≥0.25.0 | `apps__desktop>vite>esbuild` | GHSA-67mh-4wv8-2f99 |
| Vite path traversal in `.map` | `vite` | 5.4.21 | ≤6.4.1 | ≥6.4.2 | `apps__desktop>vite` | GHSA-4w7w-66w2-5vf9 |

**Assessment**: Both advisories are development-server vulnerabilities. They
affect the Vite dev server (`pnpm dev`) and have no impact on the production
Tauri desktop binary. Exploitation requires a malicious website to target a
developer's running dev server.

**Fixing these advisories requires upgrading `vite` from `^5.4.0` to `>=6.4.2`**
(major version bump 5→6). This is a significant change that requires testing
the full build pipeline and is out of scope for this CI hygiene PR.

**Intended behavior**: `continue-on-error: true` is in place on the
`frontend-audit` job. The job check shows "fail" (findings are visible in CI)
but the overall `Dependency Audit` workflow run succeeds, and the main `CI`
workflow (which gates merging) is unaffected. This is the intended visibility
behaviour. The `continue-on-error` flag can be removed once vite is upgraded.

**Recommended follow-up**: Open a dedicated `chore(deps): upgrade vite to v6`
PR (or let Dependabot open it), test the build pipeline, and remove
`continue-on-error: true` from `frontend-audit` after verification.

## Risks

- **Non-blocking audit jobs**: `continue-on-error: true` means a failing audit
  does not block CI. This is intentional for first introduction; tighten after
  initial findings are reviewed.
- **cargo-audit install time**: `cargo install cargo-audit --locked` downloads
  and compiles the tool on each run. The `Swatinem/rust-cache@v2` caches the
  compiled binary across runs. Cold install may take 2-4 minutes.
- **pnpm audit coverage**: `pnpm audit` checks only packages with known advisories
  in the npm advisory database. It does not replace a full SCA tool.
- **Dependabot pnpm support**: Dependabot uses `package-ecosystem: npm` for pnpm
  projects. It reads `pnpm-lock.yaml` and can open update PRs, but some pnpm
  workspace features may not be fully understood.

## Not done

- `serde_yaml` → `serde_yml` migration
- Content-Security-Policy hardening
- GitHub Actions SHA pinning
- Askpass token constant-time comparison
- TEST-01 e2e smoke test (scheduled before beta release checklist, not a PR)

## Remaining items before beta release

1. **vite upgrade** — upgrade `vite` from `^5.4.0` to `>=6.4.2` to resolve
   the 2 moderate frontend audit findings (dev-server only, not production risk).
   Can be done in a follow-up PR or via Dependabot.
2. **TEST-01** — manual smoke test (before release checklist, not a PR).
3. Post-beta.2: serde_yaml migration, CSP, SHA pinning, askpass CT comparison.

## Suggested next step

Generate review context and attach to ChatGPT for sign-off before merging PR L.
