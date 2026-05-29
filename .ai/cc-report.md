# CC Report — maint/followup-plan-and-actions-runtime

## Branch

`maint/followup-plan-and-actions-runtime` — two commits, no product code changes.

---

## Summary

### Commit 1 — `docs(plan): add post-beta follow-up items`

Updated `docs/BETA1_FOLLOWUP_PLAN_EN.md`:

- **Item 7 (dirty repository guard)**: expanded with bullet points; added
  Git panel dirty-state indicator as a preferred companion to the guard modal.
- **Item 8 (new)**: GitHub Actions maintenance — documents the Node.js 20
  deprecation in the Windows Installer workflow, the upgrade strategy, current
  implementation status, and which actions were intentionally left unchanged.
- **Item 9 (new)**: Windows installer polish — correct default install/logs
  directories (`Program Files` vs. `ProgramData` rationale), installer icon,
  Settings UI showing effective logs path, "Open logs folder" behaviour,
  reset-to-defaults behaviour.
- **Item 10 (new)**: Hide technical `code` from user-facing UI — use `name` as
  primary label, neutral fallbacks for unnamed records, keep `code` as internal
  stable key, regression test requirements.

### Commit 2 — `ci: update actions runtime dependencies`

Updated `.github/workflows/ci.yml` and `.github/workflows/windows-installer.yml`:

| Action | Before | After | Reason |
|---|---|---|---|
| `actions/checkout` | `@v5` | `@v6` | Latest stable major (both workflows) |
| `actions/upload-artifact` | `@v4` | `@v7` | Fixes Node.js 20 deprecation warning in Windows Installer workflow; v7 uses Node.js 24 |

---

## Exact workflow changes

### `windows-installer.yml`

```diff
-        uses: actions/checkout@v5
+        uses: actions/checkout@v6
...
-        uses: actions/upload-artifact@v4
+        uses: actions/upload-artifact@v7
```

### `ci.yml`

```diff
-        uses: actions/checkout@v5   # (4 occurrences across 4 jobs)
+        uses: actions/checkout@v6
```

---

## Actions intentionally left unchanged

| Action | Version kept | Reason |
|---|---|---|
| `Swatinem/rust-cache` | `@v2` | No v3 exists; `v2.9.1` already uses `node24` internally — not a source of Node.js 20 warnings |
| `dtolnay/rust-toolchain` | `@stable` | Tag-based reference; no Node.js runtime (pure shell); no upgrade needed |
| `pnpm/action-setup` | `@v6` | Already at latest stable major |
| `actions/setup-node` | `@v6` | Already at latest stable major |
| `raven-actions/actionlint` | `@v2` | Composite action — no Node.js runtime, no deprecation risk; v2.1.2 is the current latest (no v3 available) |

---

## Root cause of Node.js 20 warning

`actions/upload-artifact@v4` declares `using: 'node20'` in its `action.yml`.
All other actions in the Windows Installer workflow already use `node24` or are
runtime-free. Upgrading `upload-artifact` to `@v7` (which declares `using: 'node24'`)
resolves the deprecation warning.

`actions/checkout@v5` already uses `node24` — it was not the source of the
warning, but `@v6` is the latest stable major and was upgraded for currency.

---

## Checks run and results

```
git diff --check                    — OK (no whitespace errors)
node check-version-consistency.mjs  — OK (all versions 0.1.0-beta.1)
node --test scripts/*.test.mjs      — 17 passed, 0 failed
node check-repo-hygiene.mjs         — 8 checks passed
actionlint                          — NOT available locally; CI workflow-lint
                                      job runs raven-actions/actionlint@v2
                                      and will validate syntax on push
```

No Rust or frontend checks were run — workflow changes do not touch any package
or tool versions in the application itself.

---

## Risks

- `actions/upload-artifact@v7` introduced an ESM migration and default behaviour
  change for single-file artifacts (unzipped by default). The Windows Installer
  workflow uploads a glob (`target/release/bundle/nsis/*.exe`) which is not
  affected by single-file changes. Behaviour is equivalent.
- `actions/checkout@v6` persists credentials to a file under `$RUNNER_TEMP`
  rather than the local git config. This is transparent to all steps in both
  workflows that only read the checkout; no step modifies git credentials.

## Not done

- Installer icon (item 9 scope — separate PR).
- ProgramData logs path (item 9 scope — separate PR).
- Hide `code` from UI (item 10 scope — separate PR).
- Dirty repository guard implementation (item 7 scope — separate PR).

## Suggested next step

Trigger the Windows Installer workflow on this branch after merge to confirm the
build completes without Node.js 20 deprecation warnings and the installer
artifact is produced correctly.
