## Summary

Stage 3B.1: entity updates and work mode spec.

Branch: `feature/e2e-wdio-entity-updates-work-mode` → base: `roadmap/e2e-wdio`

Six MISSING workflows promoted to COVERED by one new spec:

1. **Work mode toggle** — Planning → On-site → Planning; `aria-pressed` verified on both
   `work-mode-planning` and `work-mode-onsite` testids; `after()` hook restores planning mode.

2. **Edit device** — name, status (planned→installed), serial; `device-form-submit`; persisted.

3. **Edit device model** — name, height (2→3), SKU; `model-form-submit`; device list reflects
   model rename; persisted.

4. **Edit rack** — name, height (14→18), row (A→B); `rack-form-submit`; persisted.

5. **Edit location** — name; `location-form-submit`; persisted.

6. **Persistence** — save + close + reopen cycle verifies all four entity updates survive.

No new selectors added to application source. Edit buttons use the existing
`aria-label="Edit <name>"` pattern. All form field testids and submit testids were
already present from prior stages.

`wdio.conf.ts` timeout bumped from 2 700 000 ms (45 min) to 3 600 000 ms (60 min):
the entity-updates-work-mode spec creates 5 entities, edits 4, and persists — wall-clock
~50 min, which exceeded the previous limit on first run.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts` | New spec: 9-part entity-update + work-mode coverage |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Bump `mochaOpts.timeout` 2 700 000 → 3 600 000 ms; update comment |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Promote 6 workflows MISSING→COVERED; update summary counts (COVERED 24→30, MISSING 12→6) |
| `docs/E2E_WDIO_PLAN.md` | Stage 3A → COMPLETED (PR #147, 40f6a12); Stage 3B split into 3B.1 IN REVIEW + 3B.2 PLANNED |

## Tests

### TypeScript

```
pnpm exec tsc --noEmit   → clean (0 errors)
```

### Vitest

```
Test Files  51 passed (51)
     Tests  844 passed (844)
  Duration  31.83s
```

### Tauri build

```
pnpm -C apps/desktop tauri build --no-bundle
Compiling rack-inventory-studio-desktop v0.1.0-beta.2
Finished `release` profile [optimized] target(s) in 46.53s
→ clean (0 errors, 0 warnings)
```

### Rust workspace

```
cargo fmt --all --check  → clean
cargo test --workspace   → all passed
cargo clippy --workspace -- -D warnings  → clean
cargo check --workspace  → clean
```

### Isolated spec × 2 (required gate)

Run 1 — **FAILED** (timeout): spec ran 45:03; hit the old 2 700 000 ms Mocha timeout
during Part I persistence verification. Root cause: spec creates 5 entities and edits 4,
which takes ~50 min; previous limit was 45 min.
Fix: `mochaOpts.timeout` raised to 3 600 000 ms in `wdio.conf.ts`.

Run 2 — **PASSED**: 49:41 · suffix=mrnu0gd2 · run root /tmp/ris-wdio-Iwbjhx (cleaned up).
All parts A–I complete; all persistence assertions passed.

Run 3 — **PASSED**: 49:39 · suffix=mrnvt5ez · run root /tmp/ris-wdio-GjnDP9 (cleaned up).
All parts A–I complete; all persistence assertions passed.

### Full WDIO suite (all 7 specs)

```
Spec Files:  7 passed, 7 total (100% completed) in 02:16:28
run root /tmp/ris-wdio-hp5ww2 (cleaned up)
```

## Risks

- Spec takes ~50 min per run due to `@wdio/tauri-service` external driver overhead in
  headless Xvfb — inherent to the current driver configuration.
- `browser.execute()` fires synthetic `click` (not full mousedown/mouseup sequence) for
  edit buttons and `<tr>` rows. Production IPC paths are still exercised.
- Work mode `after()` hook restores planning mode; hook error propagates rather than
  being swallowed.
- Playwright tests blocked by `libasound2t64` — pre-existing environment limitation.

## Not done

- Edit placement height U (Stage 3B.2)
- Remove placement via EditPlacementModal remove button (Stage 3B.2)
- PlacementInspectorPanel navigate to device / model (Stage 3B.2)
- Delete entity flows (Stage 3B.2)
- ConfirmDialog selector (Stage 3B.2)

## Suggested next step

Merge PR targeting roadmap/e2e-wdio. Plan Stage 3B.2 separately after Stage 3B.1 merge.
