## Summary

Stage 3F.0 per NSP, on `feature/git-workflow-audit` → `roadmap/e2e-wdio`
(base = current `roadmap/e2e-wdio` HEAD after PR #160/Stage 3E merged).
**Status: COMPLETE (audit + documentation only).**

Per the NSP's explicit instruction, this stage implements **no new
functionality and no new E2E tests**. It is a ground-up audit of every
git-related capability in the application — init, detection, status,
staged files, commit, branch, checkout, switch, create branch, merge,
rebase, stash, tags, remotes, fetch, pull, push, clone, `user.name`/
`user.email` config, credential handling, SSH, HTTPS, error handling,
libgit2 vs. system-git usage, UI locations, existing unit tests, existing
E2E tests, existing selectors — based strictly on current code, with no
assumptions carried forward from prior planning docs.

**Audit method:** read `crates/ris-git/src/lib.rs` (1927 lines, in full),
`crates/ris-git/Cargo.toml` (confirmed no `git2`/libgit2 dependency — all
git operations shell out to the system `git` binary via
`std::process::Command`), `apps/desktop/src-tauri/src/commands/git.rs`
(459 lines, full command surface), `apps/desktop/src-tauri/src/commands/
repository.rs` (clone command), `apps/desktop/src-tauri/src/
ssh_askpass.rs` (1233 lines, public API + 24 unit tests), and the full
`RepositoryPanel.tsx`, `SshPassphraseModal.tsx`, `CloneRepositoryForm.tsx`
frontend surface. Cross-checked every finding against
`safety-recovery.e2e.ts` (the only existing E2E spec touching git) and a
grep of all `data-testid` usage across the git-related components.

**Key findings** (full detail in `docs/E2E_WDIO_PLAN.md`'s new "Git
Workflow — foundation audit" section):
- Implemented and working: init, status (aggregate counts, no per-file
  UI), log, whole-tree commit, list/add remote, push, pull (`--ff-only`
  only), clone, a real SSH askpass subsystem (in-process self-re-exec
  helper, TCP passphrase bridge to the frontend via Tauri events,
  ssh-agent probing/guidance, repo-local `core.sshCommand` neutralisation
  applied to push/pull), and consistent credential redaction in error
  messages.
- Confirmed **not implemented anywhere** — product-scope boundaries, not
  test gaps: branch create/switch, merge beyond `--ff-only` pull, rebase,
  stash, tags, standalone fetch, selective/partial staging, `user.name`/
  `user.email` configuration UI, HTTPS credential management.
- UI selector coverage: only one `data-testid` exists on any git-related
  control (`ssh-passphrase-input`). Push and Pull each render as two
  simultaneous, functionally-identical button pairs (the "Safe publish"
  stepper and the Remote panel) invoking the same handlers — a real
  finding for future selector work, which must scope any new testid
  per-panel rather than adding one ambiguous shared id.
- `CloneRepositoryForm.tsx` already has full selector coverage (11
  testids) — Clone's only blocker for E2E is the network dependency
  itself for HTTPS, not selectors.
- Genuine product gap found (not a testing gap, not fixed at this stage):
  `clone_repository_cmd` uses the plain (non-askpass) clone path, so
  SSH-cloning a passphrase-protected private key has no in-app prompt at
  all today.
- `validate_remote_url()` rejects local filesystem paths by design
  (HTTPS/SSH-only allowlist), so a fully local push/pull/clone E2E
  fixture is not reachable through the app's own UI — any future stage
  attempting a real round-trip needs a remote-fixture strategy decision
  (local SSH daemon vs. disposable external target) as a prerequisite.
- Test coverage: 82 Rust unit tests in `ris-git`, 24 in `ssh_askpass.rs`,
  ~1857 lines of frontend unit tests across 8 files — unit-level coverage
  is already substantial. E2E coverage of actual git operations is zero;
  `safety-recovery.e2e.ts` only covers URL rejection and open-path
  recovery, no real git operation.

Documentation was updated to describe current state, existing
capabilities, identified gaps, and a proposed stage ordering — explicitly
**not** an implementation plan, per the NSP.

PR opened against `roadmap/e2e-wdio` (direct base per CLAUDE.md's
review-context policy table), not merged.

## Files changed

| File | Change |
|------|--------|
| `docs/E2E_WDIO_PLAN.md` | New "Git Workflow — foundation audit" section (Stage 3F.0 findings); prior single Stage 3F sketch replaced with two refined sections — "Stage 3F.1 — Local git workflows" and "Stage 3F.2 — Remote git over SSH"; Program status table and Future-stages coverage figure updated |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Git workflow section enriched with audit findings; new "SSH passphrase prompt" row (NEEDS SELECTOR); Clone DEFERRED-row reasons refined (HTTPS: selectors already present, blocked only by network; SSH: a real product gap, not just network-dependent); Summary counts recomputed (61/79, 77%) |
| `.ai/cc-report.md` | This report |

No application code, test files, or selectors were touched in this pass.

## Tests

```
git diff --check                     PASS
node scripts/check-repo-hygiene.mjs  PASS (8/8 checks)
```

No functional/test-suite run performed. This is intentional: the NSP
explicitly excludes new functionality and new E2E tests at this stage,
and nothing outside the two documentation files changed, so the
project's format/lint/unit/E2E suites have no surface to exercise. CI on
PR #161 additionally ran: Script and hygiene checks (PASS), Version
consistency (PASS), Workflow lint (PASS), Frontend checks (PASS), Rust
workspace (ran as part of standard PR CI regardless of change scope).

## Risks

- This stage's findings (especially the duplicate Push/Pull button pair
  and the SSH-clone-askpass gap) are read directly from source and are
  accurate as of this HEAD, but by nature of being audit findings rather
  than enforced-by-test facts, they can silently go stale if application
  code changes before Stage 3F.1/3F.2 begins implementation. Re-verify
  against current source before starting either stage.
- The proposed 3F.1/3F.2 split assumes a remote-fixture strategy will be
  chosen before 3F.2 starts; no such strategy exists yet and is called
  out as an open prerequisite, not a decision made by this audit.
- The SSH-clone-askpass gap identified is a genuine product behavior gap,
  not merely a test gap — it may warrant its own product/engineering
  decision before Stage 3F.2 can meaningfully test SSH clone of
  passphrase-protected keys.

## Not done

- No new E2E tests, selectors, or application code — explicitly out of
  scope for this stage per the NSP.
- No implementation planning for Stage 3F.1/3F.2 beyond the proposed
  scope split and its stated prerequisites — the NSP explicitly asks for
  audit and roadmap proposal only, not a stage-ready implementation plan.
- Rack export (NEEDS APPLICATION CHANGE, from Stage 3D) — unchanged,
  still requires a product decision, unrelated to this stage's scope.

## Suggested next step

Human review of PR #161. Once accepted, open a dedicated NSP for Stage
3F.1 (Local git workflows: init, validate/status, commit, add-remote,
push/pull disabled-state and error-path coverage — no real network
operations required) as the next fully-derivable, lowest-risk slice; hold
Stage 3F.2 (remote-over-SSH round-trip + SSH passphrase flow) until a
remote-fixture strategy is chosen, since it is a hard prerequisite called
out in this audit rather than an implementation detail to resolve
mid-stage.
