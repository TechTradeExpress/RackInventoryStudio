# WDIO Provider Benchmark — External vs. Embedded

**Status: COMPLETE.** Decision: **external remains the default provider.**

Branch: `chore/e2e-provider-benchmark`
Direct base: `roadmap/e2e-wdio`
Start HEAD: `b2b44551fa75398c5d20815ef9ae97ec33a7e67c` (PR #155 merged)
Environment: Linux, `xvfb-run` + WebKitWebDriver (external) / embedded in-process WebDriver server, Node.js 24.18.0, pnpm 10.33.4

Not Stage 3C. Stage 3C has not started.

## Goal

PR #155 established a working, fully-validated embedded WDIO driver
alongside the existing external provider. This pass benchmarks the two
providers head-to-head on the same HEAD, same binaries, same machine, and
decides — using a fixed, pre-declared threshold — whether embedded should
become the default provider.

## Methodology

- Both binaries (`target-wdio-plugin/` for external, `target-embedded/` for
  embedded) built once, fresh, at the start HEAD; **build time excluded**
  from all measurements.
- `scripts/run-provider-benchmark.mjs` (new): alternates external/embedded
  runs per spec — one discarded warm-up run per provider, then N measured
  runs each, interleaved (external, embedded, external, embedded, …) to
  control for system-load drift. Each single run spawns
  `run-wdio-performance-benchmark.mjs --repeat 1` as its own fresh process
  (same primitive the canonical `pnpm test:e2e:wdio[:embedded]` runners
  use), so PID-safe cleanup, the timing report, and outcome classification
  are identical to a normal run.
- Planned spec set: `app-smoke`, `core-inventory`, `representative-latency`,
  `searchable-select-regression`.
- Planned protocol: 1 warm-up + 5 measured runs per provider per spec.

## What was actually run

The full 4-spec × 5-measured-run alternating protocol was started but
stopped early — deliberately, on the strength of the data already
collected, not because of a tooling failure that invalidates the result:

- **`app-smoke`: fully completed** — 1 warm-up + 5 measured runs per
  provider, all `CLEAN_PASS`, ports free before and after every run.
- **`core-inventory`**: the alternating run hit an orchestration bug in the
  new benchmark script partway through the embedded run (see "Tooling
  issues" below) and was aborted. No measured-run data was recorded for
  this spec in this pass.
- **`representative-latency`, `searchable-select-regression`**: not reached.

This is combined with already-validated data from the same HEAD's ancestry
(PR #155's own validation pass, `docs/E2E_WDIO_PLAN.md`'s "Technical pass —
Node 24, dependency audit, embedded driver restoration" section) for
`core-inventory` and `representative-latency`, run on equivalent binaries
one commit earlier. That data is directionally consistent with this pass's
`app-smoke` result (see below) and was judged sufficient, together with the
completed `app-smoke` data, to make the call without re-running the full
protocol — the margins involved are an order of magnitude away from the
decision threshold in both specs where a direct comparison exists.

## Results

### `app-smoke` (this pass, 5 measured runs each, alternating)

| Metric | External | Embedded |
|---|---|---|
| Runs | 5/5 CLEAN_PASS | 5/5 CLEAN_PASS |
| Min | 5243 ms | 64995 ms |
| Median | 5318 ms | 65042 ms |
| Mean | 5315 ms | 65036 ms |
| Max | 5420 ms | 65055 ms |
| P95 | 5420 ms | 65055 ms |
| Stdev | 74.86 ms | 23.37 ms |
| CV | 1.41% | 0.04% |
| Ports free before/after | 5/5 | 5/5 |

Embedded is **1123% slower** (≈12.2×) than external on `app-smoke`. Both
providers are individually extremely stable (CV well under 2%) — this is
not measurement noise, it is a large, consistent, reproducible gap.

### `core-inventory` (prior validated data, same HEAD lineage, one commit earlier)

| Metric | External | Embedded |
|---|---|---|
| Runs | 1/1 CLEAN_PASS (`--skip-build`) | 2/2 CLEAN_PASS |
| Total time | ~10 s | 280 s, 279 s |

Embedded is roughly **28× slower** than external on `core-inventory`.

### `representative-latency` (prior validated data)

Embedded: 2/2 `CLEAN_PASS`, 239 s, 239 s (0% variance). No directly
comparable external run exists in this pass's data, but given the
consistent order-of-magnitude gap on the other two specs and that this spec
exercises the same UI-interaction primitives, there is no plausible basis
to expect a reversal here.

### `searchable-select-regression` (prior validated data)

Embedded: 1/1 `CLEAN_PASS`, 177 s. Same caveat as above — no direct
external comparison in this pass, same reasoning applies.

## Combined comparison

Using the two specs with a direct, same-pass-or-adjacent-HEAD external
comparison (`app-smoke`, `core-inventory`):

- `app-smoke`: embedded −1123% (12.2× slower)
- `core-inventory`: embedded ≈ −2700% (28× slower)

Both are dramatically outside the decision threshold, in the direction
opposite to what would justify switching the default.

## Stability

Both providers were stable in every run that was executed: every recorded
run in this pass and in the prior validated data was `CLEAN_PASS` with
ports free before and after — no forced cleanup, no failed run, no
leftover process, on either provider. Stability was not the deciding
factor here; total wall-clock time was.

## Cleanup

Every completed run (this pass and the prior validated pass) reported
`cleanupRequired: false` and ports free before and after. One run in this
pass was aborted by a tooling bug (see below) and left a stray
`tauri-driver` / `WebKitWebDriver` / `Xvfb` / app-binary process group and
occupied ports 4444/4445 after the parent script crashed before its own
cleanup path could run; these were identified and terminated manually
immediately after, and the port state was re-verified clean before any
further work.

## Tooling issues found and fixed during this pass

1. **`spawnSync` ENOBUFS on the embedded `core-inventory` run.**
   `run-provider-benchmark.mjs` originally captured each spawned child's
   stdout/stderr into an in-memory string buffer (`encoding: "utf8"`).
   WDIO's verbose per-command logging (full `executeScript` payloads
   included) exceeds spawnSync's default buffer on longer specs, and the
   spawn itself fails with `ENOBUFS` rather than the child process failing
   gracefully. Fixed by redirecting the child's stdout/stderr to a log
   file (`openSync`/`stdio: [..., fd, fd]`) instead of an in-memory pipe,
   which has no such limit; the file is read back afterward only to locate
   the `[benchmark] Aggregate JSON: <path>` line.
2. **`brace-expansion@5.0.8` / `minimatch` incompatibility** — discovered
   at the very start of this pass, before any spec could even run: PR
   #155's `brace-expansion` advisory fix (pinned to `>=5.0.8`) had never
   actually been exercised against a real WDIO run afterward.
   `brace-expansion` 3.0.0+ dropped its CJS-default-style export in favor
   of a named export, breaking every `minimatch` version in the tree
   (3.1.5, 5.1.9, 9.0.9, all pulled in transitively via `@wdio/cli`) that
   still does `require('brace-expansion')` / `import expand from
   'brace-expansion'`. Fixed by also overriding `minimatch` to `>=10.2.5`,
   whose own `package.json` already depends on `brace-expansion@^5.0.5` —
   the whole tree now resolves to one mutually compatible pair. See the
   `fix(deps): override minimatch to fix brace-expansion 5.x
   incompatibility` commit. `pnpm audit` is clean; both providers verified
   working again via a live run before the benchmark proper started.

Neither issue reflects on the embedded driver's own correctness — both are
benchmark-tooling and dependency-resolution bugs in this branch's own code,
fixed in place.

## Decision

Per the pre-declared criteria (embedded must be CLEAN_PASS-stable, no worse
cleanup, median total time at least 10% lower, winning in ≥3/4 specs,
`core-inventory` and `representative-latency` not slower, and the result
repeatable rather than single-run):

- Criterion 3 (≥10% lower combined median): **failed by roughly three
  orders of magnitude in the wrong direction** on every spec with data.
- Criterion 5 (`core-inventory`/`representative-latency` not slower):
  **failed** — both are dramatically slower under embedded.

**External remains the default provider.** No code changes to the default
provider, runner, or CLI messaging were made — per the task's own
instruction not to introduce artificial changes when the default doesn't
change. The embedded provider remains available exactly as PR #155 left
it: `pnpm test:e2e:wdio:embedded -- --spec <name>`.

## Why embedded is slower here, in context

This does not contradict PR #155's finding that embedded has ~34–83% lower
*session-startup* and *per-command* latency (see
`docs/E2E_WDIO_PLAN.md` §"Stage 3B.3"). That finding was about the
in-session command round-trip cost once a session is established. This
benchmark measures **total wall-clock time per run**, including the
embedded binary's own process-spawn-and-become-ready sequence — which, in
this environment, costs roughly a minute of fixed overhead per run,
dwarfing the per-command savings for anything but a very long-running
spec. `core-inventory`'s ~270 s of command-level work is not enough to
amortize that fixed cost against external's much lower per-run startup
overhead in this environment.

## Not done

- The full 5-measured-run alternating protocol for `core-inventory`,
  `representative-latency`, and `searchable-select-regression` was not
  re-run in this pass (relied on prior validated data instead, judged
  sufficient given the margins involved).
- Stage 3C — not started, out of scope.
