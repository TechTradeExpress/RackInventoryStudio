## Summary

Stage 3F.5.9: closes the Windows Git-over-SSH fixture program (Stage
3F.5.4 through 3F.5.8A-R2) and opens the integration PR from
`feature/windows-ssh-fixture` to `development`. This is a documentation
and integration-audit stage — no application or test-infrastructure code
changed.

Program closure decision: the normal-host Linux container-provider
acceptance and the Linux default-provider switch are explicitly deferred
to a later program. They are not release blockers for the Windows-only
`v0.1.0-beta.4`. This does **not** retroactively make the missing Linux
E2E acceptance pass — Stage 3F.5.8A's `BLOCKED` record stays as written;
see `docs/E2E_WDIO_PLAN.md`'s Stage 3F.5.9 section for the full closure
decision, final platform contract, and deferred-follow-up checklist.

Final platform contract: Windows defaults to the container provider (all
three Git-over-SSH specs validated against it in Stage 3F.5.7, native
fallback also validated); Linux/macOS/other default to `native`
(unchanged); a Linux-native container backend implementation exists,
unit-tested and hardened, but its real-host WDIO acceptance is
unvalidated and it is not part of beta.4.

**Critical honesty note:** this stage's own NSP requires a fresh Windows
validation run (three unset-provider specs, explicit-native control,
`app-smoke`) on "the existing validated Windows + WSL2 + Docker host."
This session has no Windows host access — it runs in a Linux-only
sandbox. That validation was **not** re-executed here.

Stage 3F.5.7's 15/15-matrix (documented in `docs/E2E_WDIO_PLAN.md`)
remains valuable historical evidence for the pre-refactor implementation,
but it is **not** final acceptance evidence for the current PR HEAD:
Stage 3F.5.8A and its repair stages (R1/R2) refactored shared
container-host execution and process-handling code the Windows backend
itself runs through — introducing `ContainerHostBackend`, moving WSL2
Docker execution and distro/keep-alive state behind that object, routing
Windows `docker exec -i` through the shared `spawnWithStdin` helper, and
then changing that helper's structured errors, errno/exit-code
normalization, close-event finalization, EPIPE handling, and bounded
stderr accumulation. The Windows command contract is protected by
deterministic unit tests, and this refactor was intended to preserve
Windows behavior, but a refactor preserving intended semantics is not the
same claim as "runtime behavior unchanged" — the current PR HEAD has not
been rerun on a real Windows + WSL2 + Docker host. A fresh confirmation
run against this exact HEAD remains an outstanding precondition for
marking the PR ready for review.

**Stage 3F.5.10-WIN update (2026-08-05):** ran the outstanding Windows
validation on a real Windows 11 + WSL2 (Ubuntu) + Docker Engine 29.4.3
host, against `bc524a6` (the exact, unmodified PR #171 HEAD, reached by
fast-forwarding a stale local checkout — no unique local commits, no
reset/rebase/force-push used). All five required runs (`app-smoke`,
`git-remote-workflows`, `git-clone-workflows`, `git-diverged-pull` with
the provider genuinely unset, and `git-clone-workflows` with
`RIS_E2E_GIT_REMOTE_PROVIDER=native` explicitly set) **passed**, with
container/`windows-wsl2` backend resolution confirmed for the three
Git-over-SSH unset-provider-path runs (`git-remote-workflows`,
`git-clone-workflows`, `git-diverged-pull`), `native` backend confirmed
for the explicit-native run, and `app-smoke` passing as an
application-launch/WebView2 check that does not invoke the Git remote
provider at all (N/A, not container/windows-wsl2 — see Stage
3F.5.10-WIN-R1 below, which corrects an earlier misclassification of this
run). Fixture cleanup was conclusive on every run and independently
verified residue-free (no fixture container, no port-4444/4445 listener,
no lingering driver/application process) after each run. See
`docs/E2E_WDIO_PLAN.md`'s Stage 3F.5.10-WIN section for full per-run
evidence. This resolves the "No Windows host access" risk below for the
initial-acceptance pass. A mandatory final rerun against the exact HEAD
produced by this stage's own documentation-only closure commit
(`a10378c`) was subsequently performed and passed — see Stage
3F.5.10-WIN-R1 below for the durable evidence model this report now
follows for recording that kind of post-commit result.

**Stage 3F.5.10-WIN-R1 update (2026-08-05):** repair stage, no code
change. Corrected two evidence-record defects: (1) `app-smoke` was
incorrectly grouped with the container/windows-wsl2 backend-resolution
runs above even though that spec never invokes the Git remote provider;
(2) this report kept asserting the final exact-HEAD rerun was
"outstanding" after it had, in fact, already passed against `a10378c` —
stale because a tracked-document commit necessarily predates the rerun
against the exact HEAD it produces. Going forward, this report records
history and defines the readiness gate, but the authoritative, current
acceptance evidence for the PR's *current* HEAD lives in PR #171's
"Final Windows acceptance — current PR HEAD" comment, updated after each
exact-HEAD rerun; readiness holds only when that comment's SHA equals
the current `headRefOid`. PR #171 was returned to draft before this
repair's own documentation-only commit and remains in draft pending one
further exact-HEAD Windows reconfirmation.

## Files changed

- `docs/E2E_WDIO_PLAN.md` — added the Stage 3F.5.9 section: program
  closure decision, final platform contract (Windows/Linux/macOS), stage
  status reclassification, deferred Linux follow-up checklist, release
  workflow bootstrap gap note, branch audit, runtime application change
  writeup, test infrastructure summary, Windows-validation honesty note,
  optional Linux regression result, static validation table, security
  review. Added a forward-pointing status-update note to the Stage 3F.5
  parent heading (historical text left unchanged).
- `docs/BETA3_ROADMAP.md` — updated the superseded-release banner to note
  the Windows remote-shell defect is now fixed and validated, and that
  Stage 3F.5.9 has opened the integration PR.
- `docs/releases/v0.1.0-beta.3.md` — same update to its superseded banner.
- `CHANGELOG.md` — corrected the `## Unreleased` section's wording, which
  incorrectly said it "accumulates changes made after `v0.1.0-beta.3` is
  tagged" — beta.3 was never tagged. Now states changes accumulate after
  the abandoned beta.3 release-candidate preparation, expected to ship as
  part of `v0.1.0-beta.4` together with the prepared beta.3 content. No
  version bump, no beta.4 section created, no beta.3 history rewritten.
- `.ai/cc-report.md` — this file, rewritten for the closure stage (the
  detailed Stage 3F.5.8A-R1/R2 narrative is preserved in git history and
  `docs/E2E_WDIO_PLAN.md`, not reproduced here).

**Stage 3F.5.10-WIN update:** `docs/E2E_WDIO_PLAN.md` — added the Stage
3F.5.10-WIN section recording the initial Windows acceptance pass
(host/tool versions, all five run results, provider/backend evidence,
runner-classification-vs-fixture-cleanup distinction, residue
verification). `.ai/cc-report.md` — this update. No application code,
fixture code, or provider-resolution logic changed.

**Stage 3F.5.9-R1 update:** corrected three inaccuracies review found in
the above — a false claim that no Windows runtime code changed after
Stage 3F.5.7 (Stage 3F.5.8A's shared-backend refactor did change code the
Windows backend runs through, even though it was designed to preserve
behavior), a premature `PROGRAM COMPLETE — READY FOR DEVELOPMENT
INTEGRATION` status (corrected to `IMPLEMENTATION COMPLETE — WINDOWS
CONFIRMATION PENDING`), and PR #171's dependency-audit comment
incorrectly folding "unsound" advisories into a blanket "not exploitable"
characterization alongside "unmaintained" ones. See
`docs/E2E_WDIO_PLAN.md`'s Stage 3F.5.9-R1 section and PR #171 for the
corrected text. No code changed in this repair either.

No application code, test-infrastructure code, or CI workflow files
changed in this stage or its R1 repair.

## Tests

No test code changed. Full suites re-run to confirm the branch is still
green before opening the PR — see Static Validation below for the
authoritative results table.

Windows E2E validation (the three Git-over-SSH specs, explicit-native
control, `app-smoke`) was **not re-run** in Stage 3F.5.9 itself — no
Windows host was reachable from that sandbox. See the Summary's honesty
note and `docs/E2E_WDIO_PLAN.md`'s Stage 3F.5.9 "Final Windows
validation" section.

**Stage 3F.5.10-WIN update:** the above gap is now closed. All five
required Windows runs (three unset-provider Git-over-SSH specs,
explicit-native control, and `app-smoke` as an application-launch check
not itself exercising the Git provider) were executed on a real Windows
11 + WSL2 + Docker host against `bc524a6` and passed, and again against
the post-doc-commit exact HEAD `a10378c` — see `docs/E2E_WDIO_PLAN.md`'s
Stage 3F.5.10-WIN and 3F.5.10-WIN-R1 sections. Per Stage 3F.5.10-WIN-R1's
durable evidence model, the current authoritative result for whichever
SHA is the PR's *current* HEAD lives in PR #171's "Final Windows
acceptance — current PR HEAD" comment, not restated here as a point-in-time
claim.

Optional Linux regression (`RIS_E2E_GIT_REMOTE_PROVIDER=native`,
`git-clone-workflows`) was attempted and failed at WebDriver session
establishment — the same pre-existing, sandbox-specific `tauri-driver`
limitation documented in Stage 3F.5.8A-R1/R2. Per this stage's own scope,
this is optional/informational and does not block the PR.

## Static validation

All run individually through `corepack pnpm` (repository-declared
`pnpm@10.33.4`; the sandbox's unrelated global `pnpm@9.15.9` was not
used):

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm install --frozen-lockfile` | clean — lockfile already up to date |
| `pnpm check:version` | ✓ versions and toolchain declarations match |
| `pnpm check:hygiene` | ✓ 8/8 |
| `pnpm test:scripts` | ✓ 237/237 |
| `pnpm --filter @rack-inventory-studio/desktop typecheck` | clean |
| `pnpm --filter @rack-inventory-studio/desktop test` | ✓ 1313/1313 |
| `pnpm --filter @rack-inventory-studio/desktop build` | succeeded |
| `cargo fmt --all -- --check` | clean |
| `cargo clippy --workspace -- -D warnings` | clean |
| `cargo test --workspace` | ✓ all passed |
| `pnpm build:e2e:wdio-plugin` | succeeded |
| `actionlint` (all workflow files, binary at `/tmp/actionlint-bin/actionlint`) | clean, no findings |

## Risks

- **No Windows host access in this sandbox (Stage 3F.5.9).** Resolved by
  Stage 3F.5.10-WIN's initial acceptance pass: all five required runs
  executed and passed on a real Windows 11 + WSL2 + Docker host against
  `bc524a6`, confirming `ContainerHostBackend`/`spawnWithStdin`'s R1/R2
  changes did not regress real Windows behavior. See
  `docs/E2E_WDIO_PLAN.md`'s Stage 3F.5.10-WIN section.
- **This repair (Stage 3F.5.10-WIN-R1) itself requires one further
  exact-HEAD rerun.** Its own documentation-only commit changes the PR's
  HEAD SHA again, so — per the durable evidence model it introduces — PR
  #171 stays in draft and the existing acceptance comment stays
  unauthoritative for the new SHA until that one rerun passes and the
  comment is updated in place.
- **`.github/workflows/wdio-e2e.yml` does not exist on `master`.** GitHub
  requires a workflow to exist on the default branch before
  `workflow_dispatch` can target it, so the documented release process
  cannot dispatch the Linux WDIO gate against a release branch until
  after a first `master` merge carries the workflow. Not solved in this
  stage; recorded as a beta.4-preparation blocker in
  `docs/E2E_WDIO_PLAN.md`.
- **Real-host Linux container-provider acceptance remains unvalidated** —
  by explicit project decision, deferred rather than pursued further in
  this sandbox. See the deferred-follow-up checklist.
- **Known historical dependency-audit finding** — must be re-verified
  against the current lockfile/advisory database as part of PR CI
  inspection, not waived automatically (see PR CI handling in the final
  report).

## Not done

- Fresh Windows E2E validation — **done**, twice (initial pass against
  `bc524a6`, final pass against `a10378c`), both passing. This repair's
  own one required exact-HEAD rerun (against the SHA this repair commit
  produces) is not yet done as of this update.
- Real-host Linux container-provider acceptance (explicitly deferred by
  project decision, not this stage's scope).
- Any application/fixture/provider code change — this and Stage
  3F.5.10-WIN/3F.5.10-WIN-R1 remain documentation/acceptance stages only.
- Merging the PR, creating `release/v0.1.0-beta.4`, bumping the version,
  modifying `master`, or building/tagging a release — all explicitly out
  of scope per this stage's NSP.

## Suggested next step

Push this repair's documentation-only commit, run the one required
five-spec exact-HEAD acceptance pass against it, update PR #171's
existing "Final Windows acceptance — current PR HEAD" comment and body
with that SHA's results once green, wait for PR CI, and mark PR #171
ready for review again. Separately, resolve the
`.github/workflows/wdio-e2e.yml`/`master` bootstrap gap as part of
`v0.1.0-beta.4` preparation, before marking this PR ready for
review or beginning release-branch work.
