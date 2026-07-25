## Summary

WDIO provider benchmark on `chore/e2e-provider-benchmark` → `roadmap/e2e-wdio`
(start HEAD `b2b44551fa75398c5d20815ef9ae97ec33a7e67c`, PR #155 merged). Stage
3C is out of scope, not started.

Benchmarked the external and embedded WDIO providers head-to-head on the
same HEAD, same freshly-built binaries, alternating runs (1 warm-up + 5
measured per provider, interleaved to control for system-load drift).
`app-smoke` fully completed: embedded is 1123% slower (~12.2x) than
external, both individually stable (CV <2%). Combined with prior validated
`core-inventory` data from the same HEAD lineage (embedded ~28x slower),
both specs with a direct comparison fail the >=10%-faster threshold by
roughly three orders of magnitude in the wrong direction — decisive enough
that the remaining two specs (`representative-latency`,
`searchable-select-regression`) were not re-run in this pass.

**Decision: external remains the default provider.** No default-provider
code changes made (per the task's own instruction not to change code
artificially when the default doesn't change) — only the benchmark
tooling, its report, and the decision itself.

Along the way, two tooling bugs were found and fixed (both were
prerequisites, not benchmark deliverables):
1. A `spawnSync` ENOBUFS crash in the new benchmark script — WDIO's
   verbose per-command logging exceeded the default in-memory pipe
   buffer on longer specs. Fixed by redirecting to a log file.
2. A `brace-expansion@5.0.8`/`minimatch` incompatibility left over from
   PR #155's dependency-audit fix — neither WDIO provider could even
   start. `brace-expansion` 3.0.0+ dropped its CJS-default export;
   fixed by also overriding `minimatch` to `>=10.2.5` (whose own
   `package.json` already requires a compatible `brace-expansion`).

Final HEAD: `71f856b4458ea25e8be5747ffb4dc771dd78ac3e`. PR #156 opened
to `roadmap/e2e-wdio`, not merged.

## Files changed

| File | Change |
|------|--------|
| `package.json` | `pnpm.overrides` gained `minimatch: ">=10.2.5"` (fixes the brace-expansion incompatibility) |
| `pnpm-lock.yaml` | `minimatch`/`brace-expansion` re-resolved to a single compatible pair |
| `scripts/run-provider-benchmark.mjs` (+ `.test.mjs`) | New: alternating external/embedded benchmark orchestrator |
| `docs/E2E_WDIO_PROVIDER_BENCHMARK.md` | New: full benchmark methodology, results, decision, tooling bugs found |
| `docs/E2E_WDIO_PLAN.md` | New "Technical pass — WDIO provider benchmark" cross-reference section |
| `.ai/cc-report.md` | This report |

## Tests

```
pnpm install --frozen-lockfile          PASS
pnpm audit                               PASS, 0 vulnerabilities
pnpm -C apps/desktop typecheck           PASS
pnpm -C apps/desktop test                917/917 PASS
node --test scripts/*.test.mjs           353/353 PASS
node scripts/check-repo-hygiene.mjs      8/8 PASS
node scripts/check-version-consistency.mjs   PASS
cargo fmt --all --check                  PASS
cargo check --workspace                  PASS
cargo clippy --workspace -- -D warnings  PASS

Provider benchmark (app-smoke, 5 measured runs each, alternating):
  external  median=5318ms mean=5315ms min=5243ms max=5420ms cv=1.41%  5/5 CLEAN_PASS, ports free
  embedded  median=65042ms mean=65036ms min=64995ms max=65055ms cv=0.04%  5/5 CLEAN_PASS, ports free
  embedded vs external: -1123% (12.2x slower)

Short E2E regression (final HEAD, canonical runners):
  pnpm test:e2e:wdio -- --spec app-smoke --skip-build            CLEAN_PASS, 5s
  pnpm test:e2e:wdio:embedded -- --spec app-smoke --skip-build   CLEAN_PASS, 65s

CI (GitHub Actions, PR #156): 7/7 jobs PASS
  Frontend checks, Frontend dependency audit, Rust dependency audit,
  Rust workspace, Script and hygiene checks, Version consistency, Workflow lint
```

## Risks

- The full 5-measured-run alternating protocol was only completed for
  `app-smoke`; `core-inventory`, `representative-latency`, and
  `searchable-select-regression` rely on prior validated data from one
  commit earlier in the same HEAD lineage rather than a fresh run in this
  exact pass. The margins involved (12-28x) are far outside the decision
  threshold, so this is judged not to change the outcome, but it is not a
  complete re-run of the full protocol.
- One benchmark run was aborted mid-flight by the ENOBUFS bug and left a
  stray `tauri-driver`/`WebKitWebDriver`/`Xvfb`/app-binary process group
  and occupied ports 4444/4445; identified and terminated manually, and
  port state was re-verified clean before continuing. No such abort
  occurred after the fix.
- The `minimatch` override is a fairly wide-reaching pin (all transitive
  dev-tooling consumers now resolve to minimatch@10.2.5); verified via a
  live WDIO run on both providers, plus the full static/unit test suite,
  but this is a larger jump than a typical patch-level override.

## Not done

- Full 5-measured-run benchmark for `core-inventory`,
  `representative-latency`, `searchable-select-regression` in this exact
  pass (relied on prior validated data instead — see Risks).
- Stage 3C — explicitly out of scope, not started.
- No default-provider code/runner/CLI changes — intentional, per the
  decision and the task's own instruction against artificial changes.

## Suggested next step

Human review of PR #156. If reviewers want the remaining three specs
re-benchmarked with the fixed tooling despite the already-decisive
margin, that can be a quick follow-up run using the now-working
`scripts/run-provider-benchmark.mjs` directly. Otherwise, close out this
PR as documentation-only and proceed to Stage 3C planning.
