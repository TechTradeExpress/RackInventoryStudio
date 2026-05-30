# CC Report — PR H: Beta readiness — richer demo repository and QA fixtures

## Summary

Expanded `examples/example-repository/` from a minimal skeleton (1 location,
2 racks, 9 models, 8 devices) to a realistic multi-site demo repository
(3 locations, 6 racks, 17+ models, 50+ devices) suitable for manual beta QA.
Added a Rust integration test that loads the example repository and verifies
structural counts and validity. Added `docs/BETA_DEMO_REPOSITORY_EN.md` with
manual QA scenarios.

---

## Findings — current demo/sample mechanism

| Question | Finding |
|---|---|
| Where is demo data? | `examples/example-repository/` — plain YAML files |
| How is it generated? | Hand-authored YAML; no code generator |
| How does user open it? | File → Open Repository → navigate to `examples/example-repository/` |
| Tests that rely on demo data? | `ris-repository/tests/loader_tests.rs` — existed, updated |
| Existing fixture builders | `create_repository()` creates empty scaffold; no demo builder |
| Validation fixtures | Separate in `tests/fixtures/val-*/` — not touched |

The `tests/fixtures/valid-repository/` fixture is intentionally minimal (1 loc,
1 rack, 1 device) to support unit tests that assert exact counts. It was NOT
changed.

---

## Files changed

### New files
- `examples/example-repository/inventory/racks/gdansk-branch.yaml` — 2 Gdańsk racks
- `examples/example-repository/inventory/racks/backup-dr.yaml` — 1 DR rack
- `examples/example-repository/inventory/placements/rack-gdansk-01.yaml` — 10 front + 1 rear placement
- `examples/example-repository/inventory/placements/rack-gdansk-02.yaml` — sparse 24U rack
- `examples/example-repository/inventory/placements/rack-hq-b01.yaml` — HQ B01 rack placements
- `examples/example-repository/inventory/placements/rack-dr-01.yaml` — DR rack placements
- `crates/ris-application/tests/example_repo_tests.rs` — 8 structural tests
- `docs/BETA_DEMO_REPOSITORY_EN.md` — manual QA guide

### Modified files
- `examples/example-repository/inventory/locations.yaml` — 1 → 3 locations
- `examples/example-repository/inventory/racks/warsaw-serverroom-a.yaml` — added rack-hq-b01
- `examples/example-repository/inventory/device-models/servers.yaml` — +dell-r750, +lenovo-sr650
- `examples/example-repository/inventory/device-models/network.yaml` — +cisco-asr1001x, +patch-panel-24p
- `examples/example-repository/inventory/device-models/storage.yaml` — +synology-rs1221p
- `examples/example-repository/inventory/device-models/ups.yaml` — +eaton-9px-3000
- `examples/example-repository/inventory/device-models/appliances.yaml` — +kvm-16port, +pdu-basic-1u
- `examples/example-repository/inventory/device-models/other.yaml` — +generic-2u-appliance
- `examples/example-repository/inventory/device-models/rack-objects.yaml` — +patch-panel-48p; English names
- `examples/example-repository/inventory/devices/servers.yaml` — 3 → 25+ devices (HQ + Gdańsk + DR + staging/edge cases)
- `examples/example-repository/inventory/devices/network.yaml` — 2 → 11 devices
- `examples/example-repository/inventory/devices/storage.yaml` — 1 → 4 devices
- `examples/example-repository/inventory/devices/ups.yaml` — 1 → 4 devices
- `examples/example-repository/inventory/devices/appliances.yaml` — 0 → 4 devices
- `examples/example-repository/inventory/placements/rack-a01.yaml` — expanded (8 → ~25 placements)
- `examples/example-repository/inventory/placements/rack-a02.yaml` — was empty, now 3 placements
- `examples/example-repository/inventory/examples/devices-import-example.csv` — updated to non-conflicting codes/serials
- `examples/example-repository/README.md` — updated counts and structure table
- `crates/ris-repository/tests/loader_tests.rs` — updated 4 assertions for new structure
- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — added PR H entry

---

## Tests

```
cargo fmt --all --check           PASS
cargo check --workspace           PASS
cargo clippy --workspace          PASS (0 warnings)
cargo test --workspace            PASS (all suites, 0 failures)
  - example_repo_tests.rs         8/8 pass
  - loader_tests.rs               19/19 pass (4 updated)
./node_modules/.bin/tsc --noEmit  PASS
./node_modules/.bin/vitest run    534/534 pass
node scripts/check-version-consistency.mjs  PASS
node --test scripts/*.test.mjs    17/17 pass
node scripts/check-repo-hygiene.mjs         PASS (8/8 checks)
```

---

## Risks

- All UUIDs, serial numbers, and asset tags are unique within the example
  repository. Verified by visual inspection; no automated uniqueness check.
- The example repository is hand-authored YAML. Any future schema change will
  require manual updates to all six racks and all device files.
- `devices/other.yaml` intentionally contains a device with no `device_model_id`
  — this exercises an edge case but could cause confusion if users inspect the
  raw YAML.

---

## Not done

- No CSV import test that actually loads the example CSV against the running
  app (manual QA only, covered in `BETA_DEMO_REPOSITORY_EN.md`).
- No automated uniqueness check for serial numbers / asset tags across all
  device files (would require a new hygiene script).

---

## Suggested next step

Run the full manual QA checklist in `docs/BETA_DEMO_REPOSITORY_EN.md` against
a local build to confirm the demo repository renders correctly in the UI,
including the rack diagram for the dense rack-a01, the sparse rack-gdansk-02,
and the edge-case devices (to_remove, planned, no-serial, duplicate names).
