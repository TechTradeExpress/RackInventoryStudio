# ChatGPT Code Review Context

## Review mode
You are a strict code reviewer. Review only this change. Focus on correctness, scope, tests, security, maintainability and operational risk.

Return:
- Status: Approve / Request changes / Needs human decision
- Summary
- Blocking issues
- Non-blocking suggestions
- Scope check
- Tests
- Risks
- Recommended next action

## Repository
- Repo: TechTradeExpress/RackInventoryStudio
- URL: https://github.com/TechTradeExpress/RackInventoryStudio

## Branch
- Current branch: feat/hide-technical-code-display-names
- Base branch: master
- Commits ahead of base: 4

## Pull request
No PR detected for current branch.

## Claude Code report
# CC Report — feat/hide-technical-code-display-names

## Branch

`feat/hide-technical-code-display-names` — PR E from the BETA1 follow-up plan.

## Summary

Hid technical `code` fields from all user-facing UI and changed device code generation to produce opaque random identifiers (`dev-XXXXXXXX`) instead of sequential predictable ones (`device-01`). CSV device import no longer accepts or uses a `code` column — codes are always auto-generated.

## Files changed

**Rust backend:**
- `crates/ris-application/src/session.rs` — `generate_device_code()` now produces `dev-XXXXXXXX` (UUID v4-derived 8-char hex); CSV import passes `code: None` to always trigger auto-generation
- `crates/ris-import/src/csv_reader.rs` — removed `"code"` from `KNOWN_COLUMNS`; removed `code` field from `CsvDeviceRowRaw`; CSV with a `code` column now triggers VAL-CSV-002 warning
- `crates/ris-import/src/validator.rs` — removed VAL-CSV-004/005/006 validators (code format/duplicate/exists); removed `dup_codes` computation; removed `CODE_RE` regex
- `crates/ris-import/src/preview.rs` — removed `code: Option<String>` from `CsvDeviceImportPreviewRow`
- `crates/ris-import/Cargo.toml` — removed now-unused `regex = "1"` dependency
- `apps/desktop/src-tauri/src/dto.rs` — removed `code` from `CsvImportPreviewRowDto`
- `apps/desktop/src-tauri/src/commands/repository.rs` — removed `code` from DTO mapping; removed `code` column from `DEVICE_IMPORT_SAMPLE_CSV`

**Frontend TypeScript:**
- `apps/desktop/src/api/tauriClient.ts` — removed `code` from `CsvImportPreviewRowDto` interface
- `apps/desktop/src/features/csvImport/csvSample.ts` — removed `code` column from sample CSV
- `apps/desktop/src/features/csvImport/CsvImportPanel.tsx` — removed Code column from preview table; updated schema panel; updated placeholder and help copy
- `apps/desktop/src/features/devices/DevicesPanel.tsx` — removed Code column; Name is now primary bold column with "Unnamed device" fallback; model shown by name
- `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` — removed Code column; Name is now primary
- `apps/desktop/src/features/locations/LocationsPanel.tsx` — removed Code column; Name is now primary
- `apps/desktop/src/features/racks/RacksPanel.tsx` — removed Code column; Name is now primary; location subtitle uses name only
- `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` — palette card shows `name ?? "Unnamed device"` instead of `code`
- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — renamed "Code / SN" column to "Serial"; column now shows only serial number
- `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` — removed "Code" and "Target code" KV rows; confirm dialog uses target name

**Docs:**
- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — marked item 10 / PR E as Implemented

**Tests updated:**
- `crates/ris-import/tests/csv_import_tests.rs` — removed VAL-CSV-004/005/006 tests; added `code_column_triggers_val_csv_002_warning_and_does_not_block_import`; fixed tests using bad code format to use invalid device_type instead
- `crates/ris-application/tests/application_tests.rs` — updated code-prefix assertion; replaced existing-code rejection test; updated VALID_CSV; import tests verify by serial instead of code
- `crates/ris-application/tests/mvp_smoke_tests.rs` — updated CSV sections; verify imported devices by name/id
- `apps/desktop/src/features/csvImport/csvSample.test.tsx` — updated EXPECTED_HEADERS; updated column count and index checks
- `apps/desktop/src/features/csvImport/csvImportSummary.test.ts` — removed `code` from test fixture
- `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` — updated column header test to expect "Serial"

## Tests

- `cargo test -p ris-import` → **43 passed, 0 failed**
- `cargo test -p ris-application` → **175+ passed across all test suites, 0 failed**
- `cargo build` (Tauri) → **clean**
- `npx vitest run` → **493 passed, 0 failed** (38 files)
- `npx tsc --noEmit` → **0 errors**

## Risks

- Devices created before this PR have sequential `device-XX` codes. Those codes are preserved unchanged (no migration). The new `dev-XXXXXXXX` format applies only to newly created devices.
- Existing CSVs with a `code` column will trigger a VAL-CSV-002 warning; import still proceeds and codes are ignored. This is intentionally non-breaking.
- "Unnamed device" fallback appears where name is blank. Users previously identified by code will need to assign a name.

## Not done

- No migration of existing device codes to opaque format (intentional — codes are stable internal identifiers)
- `code` is still present in API DTOs for devices/racks/locations/models — only hidden from display, not removed from the data layer

## Suggested next step

Implement PR F (Dirty repository guard) — warn users when closing or switching repos with unsaved changes.

## Changed files
M	.ai/cc-report.md
M	Cargo.lock
M	apps/desktop/src-tauri/src/commands/repository.rs
M	apps/desktop/src-tauri/src/dto.rs
M	apps/desktop/src/api/tauriClient.ts
M	apps/desktop/src/features/csvImport/CsvImportPanel.tsx
M	apps/desktop/src/features/csvImport/csvImportSummary.test.ts
M	apps/desktop/src/features/csvImport/csvSample.test.tsx
M	apps/desktop/src/features/csvImport/csvSample.ts
M	apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx
M	apps/desktop/src/features/devices/DevicesPanel.tsx
M	apps/desktop/src/features/locations/LocationsPanel.tsx
M	apps/desktop/src/features/racks/PlacementInspectorPanel.tsx
M	apps/desktop/src/features/racks/PlacementPalettePanel.tsx
M	apps/desktop/src/features/racks/RackUnitDiagram.test.tsx
M	apps/desktop/src/features/racks/RackUnitDiagram.tsx
M	apps/desktop/src/features/racks/RacksPanel.tsx
M	crates/ris-application/src/session.rs
M	crates/ris-application/tests/application_tests.rs
M	crates/ris-application/tests/mvp_smoke_tests.rs
M	crates/ris-import/Cargo.toml
M	crates/ris-import/src/csv_reader.rs
M	crates/ris-import/src/preview.rs
M	crates/ris-import/src/validator.rs
M	crates/ris-import/tests/csv_import_tests.rs
M	docs/BETA1_FOLLOWUP_PLAN_EN.md

## Diff stat
 .ai/cc-report.md                                   | 163 ++++++---------------
 Cargo.lock                                         |   1 -
 apps/desktop/src-tauri/src/commands/repository.rs  |  13 +-
 apps/desktop/src-tauri/src/dto.rs                  |   1 -
 apps/desktop/src/api/tauriClient.ts                |   1 -
 .../src/features/csvImport/CsvImportPanel.tsx      |  10 +-
 .../features/csvImport/csvImportSummary.test.ts    |   1 -
 .../src/features/csvImport/csvSample.test.tsx      |   9 +-
 apps/desktop/src/features/csvImport/csvSample.ts   |  13 +-
 .../features/deviceModels/DeviceModelsPanel.tsx    |  10 +-
 apps/desktop/src/features/devices/DevicesPanel.tsx |  33 ++---
 .../src/features/locations/LocationsPanel.tsx      |   6 +-
 .../src/features/racks/PlacementInspectorPanel.tsx |   4 +-
 .../src/features/racks/PlacementPalettePanel.tsx   |   8 +-
 .../src/features/racks/RackUnitDiagram.test.tsx    |   4 +-
 .../desktop/src/features/racks/RackUnitDiagram.tsx |   7 +-
 apps/desktop/src/features/racks/RacksPanel.tsx     |  14 +-
 crates/ris-application/src/session.rs              |   8 +-
 crates/ris-application/tests/application_tests.rs  |  51 ++++---
 crates/ris-application/tests/mvp_smoke_tests.rs    |  41 +++---
 crates/ris-import/Cargo.toml                       |   1 -
 crates/ris-import/src/csv_reader.rs                |   3 -
 crates/ris-import/src/preview.rs                   |   1 -
 crates/ris-import/src/validator.rs                 |  51 -------
 crates/ris-import/tests/csv_import_tests.rs        |  69 +++------
 docs/BETA1_FOLLOWUP_PLAN_EN.md                     |   2 +-
 26 files changed, 176 insertions(+), 349 deletions(-)

## Diff
diff --git a/.ai/cc-report.md b/.ai/cc-report.md
index def7392..a02518f 100644
--- a/.ai/cc-report.md
+++ b/.ai/cc-report.md
@@ -1,139 +1,66 @@
-# CC Report — feat/rack-unplaced-devices-ux
+# CC Report — feat/hide-technical-code-display-names
 
 ## Branch
 
-`feat/rack-unplaced-devices-ux` — PR D from the BETA1 follow-up plan.
-
-### Review blocker fix (commit 2)
-
-**Blocker**: The inspector "Remove from rack" path called `onRemoveSuccess()` with no
-arguments. `RackDetailPanel.handleRemoveSuccess()` received no placement ID and could
-not update `recentlyUnplacedDeviceIds`, so the removed device was not prioritized in
-the palette.
-
-**Fix**: `onRemoveSuccess` signature changed to `(placementId: string) => void`.
-`PlacementInspectorPanel.executeRemove` passes `placement.id`. `handleRemoveSuccess` in
-`RackDetailPanel` looks up the placement in `detail`, appends the device ID to
-`recentlyUnplacedDeviceIds` if `target_kind === "device"`, then calls
-`refreshAfterMutation` — identical logic to the DnD path.
-
----
+`feat/hide-technical-code-display-names` — PR E from the BETA1 follow-up plan.
 
 ## Summary
 
-Implemented rack diagram unplaced devices UX improvements (Plan item 11):
-
-1. **Persistent unplace drop target** — a dedicated `unplace-drop-zone` element is always
-   rendered in the palette panel with a visible dashed border and "↩ Drop here to remove
-   from rack" copy. Available even when the unplaced list is empty.
-
-2. **Non-DnD unplace action** — "Remove placement…" in `PlacementInspectorPanel` renamed to
-   "Remove from rack" with neutral (non-danger) button styling. Confirm dialog copy updated
-   to clarify the device is not deleted — it returns to the unplaced list.
-
-3. **Palette cap (max 6)** — `PlacementPalettePanel` shows at most 6 unplaced devices.
-   When there are more, an overflow indicator shows "Showing 6 of N unplaced devices"
-   with a "Show all" button. Rack object models are not capped.
-
-4. **Session recency ordering** — `RackDetailPanel` maintains a `recentlyUnplacedDeviceIds`
-   list (appended on each unplace, reset on rack navigation). Passed to the palette to sort
-   the most recently unplaced device first in the visible 6.
-
----
+Hid technical `code` fields from all user-facing UI and changed device code generation to produce opaque random identifiers (`dev-XXXXXXXX`) instead of sequential predictable ones (`device-01`). CSV device import no longer accepts or uses a `code` column — codes are always auto-generated.
 
 ## Files changed
 
-| File | Change |
-|---|---|
-| `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` | Persistent drop zone, 6-item cap, Show all, recency sort |
-| `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` | Rename "Remove placement" → "Remove from rack", neutral styling, updated confirm copy; `onRemoveSuccess` now passes `placementId` |
-| `apps/desktop/src/features/racks/RackDetailPanel.tsx` | Track `recentlyUnplacedDeviceIds`; both DnD and inspector unplace paths now update it via `handleRemoveSuccess(placementId)` |
-| `apps/desktop/src/features/racks/PlacementPalettePanel.test.tsx` | Fully rewritten: 19 tests (persistent zone, drop, cap, Show all, recency, DnD) |
-| `apps/desktop/src/features/racks/PlacementInspectorPanel.test.tsx` | New: 6 tests including assertion that `onRemoveSuccess` is called with the placement ID |
-| `apps/desktop/src/features/racks/RackDetailPanel.test.tsx` | New: 2 integration tests — inspector unplace updates recency; rack_object removal does not pollute device recency |
-| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | Item 11 marked implemented; PR table updated |
-
----
-
-## Recency ordering decision
-
-**Implemented via frontend session state.** `DeviceDto` has no timestamp fields, so
-backend ordering cannot determine recency. `RackDetailPanel` tracks a
-`recentlyUnplacedDeviceIds: string[]` state (most recently unplaced = last element).
-When a device placement is removed, the device's `target_id` is looked up in the current
-`detail` state and appended. The list is reset on rack navigation. The palette sorts
-recently unplaced devices to the front of the visible 6. Devices with no recency signal
-retain stable backend order. No schema changes were made.
-
----
+**Rust backend:**
+- `crates/ris-application/src/session.rs` — `generate_device_code()` now produces `dev-XXXXXXXX` (UUID v4-derived 8-char hex); CSV import passes `code: None` to always trigger auto-generation
+- `crates/ris-import/src/csv_reader.rs` — removed `"code"` from `KNOWN_COLUMNS`; removed `code` field from `CsvDeviceRowRaw`; CSV with a `code` column now triggers VAL-CSV-002 warning
+- `crates/ris-import/src/validator.rs` — removed VAL-CSV-004/005/006 validators (code format/duplicate/exists); removed `dup_codes` computation; removed `CODE_RE` regex
+- `crates/ris-import/src/preview.rs` — removed `code: Option<String>` from `CsvDeviceImportPreviewRow`
+- `crates/ris-import/Cargo.toml` — removed now-unused `regex = "1"` dependency
+- `apps/desktop/src-tauri/src/dto.rs` — removed `code` from `CsvImportPreviewRowDto`
+- `apps/desktop/src-tauri/src/commands/repository.rs` — removed `code` from DTO mapping; removed `code` column from `DEVICE_IMPORT_SAMPLE_CSV`
+
+**Frontend TypeScript:**
+- `apps/desktop/src/api/tauriClient.ts` — removed `code` from `CsvImportPreviewRowDto` interface
+- `apps/desktop/src/features/csvImport/csvSample.ts` — removed `code` column from sample CSV
+- `apps/desktop/src/features/csvImport/CsvImportPanel.tsx` — removed Code column from preview table; updated schema panel; updated placeholder and help copy
+- `apps/desktop/src/features/devices/DevicesPanel.tsx` — removed Code column; Name is now primary bold column with "Unnamed device" fallback; model shown by name
+- `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` — removed Code column; Name is now primary
+- `apps/desktop/src/features/locations/LocationsPanel.tsx` — removed Code column; Name is now primary
+- `apps/desktop/src/features/racks/RacksPanel.tsx` — removed Code column; Name is now primary; location subtitle uses name only
+- `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` — palette card shows `name ?? "Unnamed device"` instead of `code`
+- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — renamed "Code / SN" column to "Serial"; column now shows only serial number
+- `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` — removed "Code" and "Target code" KV rows; confirm dialog uses target name
+
+**Docs:**
+- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — marked item 10 / PR E as Implemented
+
+**Tests updated:**
+- `crates/ris-import/tests/csv_import_tests.rs` — removed VAL-CSV-004/005/006 tests; added `code_column_triggers_val_csv_002_warning_and_does_not_block_import`; fixed tests using bad code format to use invalid device_type instead
+- `crates/ris-application/tests/application_tests.rs` — updated code-prefix assertion; replaced existing-code rejection test; updated VALID_CSV; import tests verify by serial instead of code
+- `crates/ris-application/tests/mvp_smoke_tests.rs` — updated CSV sections; verify imported devices by name/id
+- `apps/desktop/src/features/csvImport/csvSample.test.tsx` — updated EXPECTED_HEADERS; updated column count and index checks
+- `apps/desktop/src/features/csvImport/csvImportSummary.test.ts` — removed `code` from test fixture
+- `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` — updated column header test to expect "Serial"
 
 ## Tests
 
-```
-cargo fmt --all --check              — OK
-cargo check --workspace              — OK (0 warnings)
-cargo test --workspace               — all Rust tests passed
-cargo clippy --workspace -D warnings — 0 errors, 0 warnings
-tsc --noEmit                         — OK (0 errors)
-vitest run                           — 493 passed (38 test files, +3 new/updated)
-git diff --check                     — OK
-node check-version-consistency.mjs   — OK (all 0.1.0-beta.1)
-node --test scripts/*.test.mjs       — 17 passed, 0 failed
-node check-repo-hygiene.mjs          — 8 checks passed
-```
-
-New test files:
-- `PlacementInspectorPanel.test.tsx` (6 tests; asserts `onRemoveSuccess` called with ID)
-- `RackDetailPanel.test.tsx` (2 integration tests: inspector unplace → recency; rack_object does not affect device recency)
-
-Updated: `PlacementPalettePanel.test.tsx` (19 tests; drop tests migrated to `unplace-drop-zone`).
-
----
-
-## Manual QA checklist
-
-1. Open a repository with a rack and at least one placed device.
-2. Open the rack detail view.
-3. **Confirm unplace drop zone is always visible** — even with zero unplaced devices,
-   the dashed "↩ Drop here to remove from rack" box should appear in the palette panel.
-4. Drag a placed device card to the drop zone.
-5. Confirm the device is removed from the rack diagram and appears in the unplaced list.
-6. Repeat with only one or two unplaced devices — confirm the drop zone stays large and
-   easy to target.
-7. Click a placed device to select it (blue → inspector opens on the right).
-8. Click "Remove from rack" in the inspector panel.
-9. Confirm a dialog appears saying the device returns to the unplaced list.
-10. Confirm the action and verify the device is removed from the rack but not deleted
-    (it should appear in the unplaced list, not be gone entirely).
-11. Add more than 6 unplaced devices (place, then unplace several).
-12. Confirm the palette shows exactly 6 and the overflow indicator "Showing 6 of N" appears.
-13. Click "Show all" and confirm all devices are visible.
-14. Drag a device from the palette into a rack slot — confirm normal placement still works.
-15. Unplace a device and confirm it appears first in the visible 6 (recency ordering).
-
----
+- `cargo test -p ris-import` → **43 passed, 0 failed**
+- `cargo test -p ris-application` → **175+ passed across all test suites, 0 failed**
+- `cargo build` (Tauri) → **clean**
+- `npx vitest run` → **493 passed, 0 failed** (38 files)
+- `npx tsc --noEmit` → **0 errors**
 
 ## Risks
 
-- Recency is session-only. If the user navigates away and returns, recently unplaced
-  devices will revert to stable backend order. This is intentional and documented.
-- "Show all" has no collapse mechanism. If the user clicks "Show all" and the list grows
-  very long, the panel may become tall. A future improvement could add "Show less".
-- The "Remove from rack" inspector button has a confirm dialog. The DnD path does not.
-  This is an intentional design difference: DnD is an explicit drag gesture;
-  clicking a button is more easily accidental.
-
----
+- Devices created before this PR have sequential `device-XX` codes. Those codes are preserved unchanged (no migration). The new `dev-XXXXXXXX` format applies only to newly created devices.
+- Existing CSVs with a `code` column will trigger a VAL-CSV-002 warning; import still proceeds and codes are ignored. This is intentionally non-breaking.
+- "Unnamed device" fallback appears where name is blank. Users previously identified by code will need to assign a name.
 
 ## Not done
 
-- Custom NSIS template for exact vendor-prefixed install path (PR G).
-- Hide technical `code` from UI (PR E).
-- Dirty repository guard (PR F).
-- "Show less" collapse for the expanded palette list.
-
----
+- No migration of existing device codes to opaque format (intentional — codes are stable internal identifiers)
+- `code` is still present in API DTOs for devices/racks/locations/models — only hidden from display, not removed from the data layer
 
 ## Suggested next step
 
-Merge PR D and implement PR E (Hide technical `code` from UI; device/model display names).
+Implement PR F (Dirty repository guard) — warn users when closing or switching repos with unsaved changes.
diff --git a/Cargo.lock b/Cargo.lock
index 1a110b0..e3ea1a1 100644
--- a/Cargo.lock
+++ b/Cargo.lock
@@ -2809,7 +2809,6 @@ name = "ris-import"
 version = "0.1.0"
 dependencies = [
  "csv",
- "regex",
  "ris-core",
  "ris-repository",
 ]
diff --git a/apps/desktop/src-tauri/src/commands/repository.rs b/apps/desktop/src-tauri/src/commands/repository.rs
index ae2af29..1fcf056 100644
--- a/apps/desktop/src-tauri/src/commands/repository.rs
+++ b/apps/desktop/src-tauri/src/commands/repository.rs
@@ -742,7 +742,6 @@ pub fn preview_device_csv_import_cmd(
         .iter()
         .map(|r| CsvImportPreviewRowDto {
             row_number: r.row_number,
-            code: r.code.clone(),
             device_type: r.device_type.clone(),
             name: r.name.clone(),
             device_model_code: r.device_model_code.clone(),
@@ -919,13 +918,13 @@ pub const MAX_CSV_BYTES: u64 = 10 * 1024 * 1024; // 10 MB
 
 /// Fixed sample CSV used for the "Download sample CSV" feature.
 /// Columns mirror KNOWN_COLUMNS / REQUIRED_COLUMNS in crates/ris-import/src/csv_reader.rs.
-/// rack_object is not a valid device_type for CSV import.
+/// Device codes are auto-generated; rack_object is not a valid device_type for CSV import.
 pub const DEVICE_IMPORT_SAMPLE_CSV: &str = "\
-device_type,name,device_model_code,serial_number,asset_tag,external_ref,status,tags,code\n\
-server,Demo Server 1,,SN-DEMO-001,ASSET-DEMO-001,REF-DEMO-001,in_stock,production,\n\
-server,Demo Server 2,,,,,planned,staging,\n\
-network,Demo Switch 1,,,,,in_stock,access;switch,\n\
-other,Demo Other Device,,,,,unknown,,\n\
+device_type,name,device_model_code,serial_number,asset_tag,external_ref,status,tags\n\
+server,Demo Server 1,,SN-DEMO-001,ASSET-DEMO-001,REF-DEMO-001,in_stock,production\n\
+server,Demo Server 2,,,,,planned,staging\n\
+network,Demo Switch 1,,,,,in_stock,access;switch\n\
+other,Demo Other Device,,,,,unknown,\n\
 ";
 
 /// Reads a file as UTF-8 text, enforcing a size limit.
diff --git a/apps/desktop/src-tauri/src/dto.rs b/apps/desktop/src-tauri/src/dto.rs
index ade08df..df6edf1 100644
--- a/apps/desktop/src-tauri/src/dto.rs
+++ b/apps/desktop/src-tauri/src/dto.rs
@@ -236,7 +236,6 @@ pub struct CsvImportSummaryDto {
 #[derive(Debug, Serialize, Deserialize)]
 pub struct CsvImportPreviewRowDto {
     pub row_number: usize,
-    pub code: Option<String>,
     pub device_type: Option<String>,
     pub name: Option<String>,
     pub device_model_code: Option<String>,
diff --git a/apps/desktop/src/api/tauriClient.ts b/apps/desktop/src/api/tauriClient.ts
index 917cc82..a2ae23a 100644
--- a/apps/desktop/src/api/tauriClient.ts
+++ b/apps/desktop/src/api/tauriClient.ts
@@ -380,7 +380,6 @@ export interface CsvImportSummaryDto {
 
 export interface CsvImportPreviewRowDto {
   row_number: number;
-  code: string | null;
   device_type: string | null;
   name: string | null;
   device_model_code: string | null;
diff --git a/apps/desktop/src/features/csvImport/CsvImportPanel.tsx b/apps/desktop/src/features/csvImport/CsvImportPanel.tsx
index 4500ad3..2cea9b5 100644
--- a/apps/desktop/src/features/csvImport/CsvImportPanel.tsx
+++ b/apps/desktop/src/features/csvImport/CsvImportPanel.tsx
@@ -203,7 +203,7 @@ export function CsvImportPanel({ onRepositoryMutated }: Props) {
                     style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 11.5, resize: "vertical" }}
                     rows={6}
                     value={csvContent}
-                    placeholder={"code,device_type,status,name\nsrv-new,server,planned,New Server"}
+                    placeholder={"device_type,status,name\nserver,planned,New Server"}
                     onChange={(e) => {
                       setCsvContent(e.target.value);
                       setPreview(null); setImportSuccess(null); setImportError(null);
@@ -284,7 +284,6 @@ export function CsvImportPanel({ onRepositoryMutated }: Props) {
                     <tr>
                       <th style={{ width: 36 }}>#</th>
                       <th style={{ width: 80 }}>Status</th>
-                      <th className="tbl-mono">Code</th>
                       <th>Type</th>
                       <th>Name</th>
                       <th className="tbl-mono">Model</th>
@@ -297,9 +296,6 @@ export function CsvImportPanel({ onRepositoryMutated }: Props) {
                       <tr key={row.row_number}>
                         <td className="tbl-mono" style={{ color: "var(--tx-3)" }}>{row.row_number}</td>
                         <td>{rowBadge(row)}</td>
-                        <td className="tbl-mono">
-                          {row.code ?? <span style={{ color: "var(--st-err-tx)" }}>—</span>}
-                        </td>
                         <td className="tbl-mono">{row.device_type ?? "—"}</td>
                         <td>{row.name ?? <span style={{ color: "var(--tx-4)" }}>—</span>}</td>
                         <td className="tbl-mono">{row.device_model_code ?? "—"}</td>
@@ -322,7 +318,7 @@ export function CsvImportPanel({ onRepositoryMutated }: Props) {
                 <div>
                   <div className="eyebrow" style={{ marginBottom: 6 }}>Required columns</div>
                   <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
-                    {["code", "device_type", "status"].map((c) => <span key={c} className="tag">{c}</span>)}
+                    {["device_type", "status"].map((c) => <span key={c} className="tag">{c}</span>)}
                   </div>
                 </div>
                 <div>
@@ -335,7 +331,7 @@ export function CsvImportPanel({ onRepositoryMutated }: Props) {
                 </div>
                 <p style={{ fontSize: 11, color: "var(--tx-3)", margin: 0, lineHeight: 1.5 }}>
                   Tags use <span className="code">;</span> as separator.
-                  Duplicate codes are skipped (update-existing is not supported).
+                  Device codes are generated automatically — do not include a <span className="code">code</span> column.
                 </p>
               </div>
             </Panel>
diff --git a/apps/desktop/src/features/csvImport/csvImportSummary.test.ts b/apps/desktop/src/features/csvImport/csvImportSummary.test.ts
index e26da78..989c655 100644
--- a/apps/desktop/src/features/csvImport/csvImportSummary.test.ts
+++ b/apps/desktop/src/features/csvImport/csvImportSummary.test.ts
@@ -8,7 +8,6 @@ function makeRow(
 ): CsvImportPreviewRowDto {
   return {
     row_number: 1,
-    code: "dev-001",
     device_type: "server",
     name: null,
     device_model_code: null,
diff --git a/apps/desktop/src/features/csvImport/csvSample.test.tsx b/apps/desktop/src/features/csvImport/csvSample.test.tsx
index 700e9da..f9fbab4 100644
--- a/apps/desktop/src/features/csvImport/csvSample.test.tsx
+++ b/apps/desktop/src/features/csvImport/csvSample.test.tsx
@@ -28,7 +28,6 @@ describe("SAMPLE_CSV_FILENAME", () => {
 // ── content ───────────────────────────────────────────────────────────────────
 
 const EXPECTED_HEADERS = [
-  "code",
   "device_type",
   "name",
   "device_model_code",
@@ -62,7 +61,7 @@ describe("SAMPLE_CSV_CONTENT", () => {
   });
 
   it("all data rows have the correct number of columns", () => {
-    // Quick check: each non-empty row should have 8 commas (9 fields)
+    // Quick check: each non-empty row should have 7 commas (8 fields, no code column)
     for (const line of lines.slice(1)) {
       // Count top-level commas (not inside quotes)
       let commas = 0;
@@ -71,14 +70,14 @@ describe("SAMPLE_CSV_CONTENT", () => {
         if (ch === '"') inQuotes = !inQuotes;
         else if (ch === "," && !inQuotes) commas++;
       }
-      expect(commas).toBe(8);
+      expect(commas).toBe(7);
     }
   });
 
   it("data rows use valid device types (not rack_object)", () => {
     const validTypes = new Set(["server", "network", "storage", "ups", "appliance", "other"]);
     for (const line of lines.slice(1)) {
-      const deviceType = line.split(",")[1];
+      const deviceType = line.split(",")[0];
       expect(validTypes.has(deviceType)).toBe(true);
     }
   });
@@ -88,7 +87,7 @@ describe("SAMPLE_CSV_CONTENT", () => {
       "planned", "in_stock", "installed", "to_remove", "removed", "disposed", "unknown",
     ]);
     for (const line of lines.slice(1)) {
-      const status = line.split(",")[7];
+      const status = line.split(",")[6];
       expect(validStatuses.has(status)).toBe(true);
     }
   });
diff --git a/apps/desktop/src/features/csvImport/csvSample.ts b/apps/desktop/src/features/csvImport/csvSample.ts
index 09d776a..d529943 100644
--- a/apps/desktop/src/features/csvImport/csvSample.ts
+++ b/apps/desktop/src/features/csvImport/csvSample.ts
@@ -16,15 +16,16 @@ function csvRow(fields: string[]): string {
 }
 
 // Columns mirror KNOWN_COLUMNS / REQUIRED_COLUMNS in crates/ris-import/src/csv_reader.rs.
-// Required: code, device_type, status
+// Required: device_type, status
 // Optional: name, device_model_code, serial_number, asset_tag, external_ref, tags
+// Codes are auto-generated; a "code" column is not supported and will trigger a warning.
 // Tags use ";" as separator. rack_object is not a valid device_type for CSV import.
 const SAMPLE_ROWS: string[][] = [
-  ["code", "device_type", "name", "device_model_code", "serial_number", "asset_tag", "external_ref", "status", "tags"],
-  ["srv-demo-01", "server",  "Demo Server 1",       "", "SN-DEMO-001", "ASSET-DEMO-001", "REF-DEMO-001", "in_stock", "production"],
-  ["srv-demo-02", "server",  "Demo Server 2",       "", "SN-DEMO-002", "",              "",             "planned",  "staging"],
-  ["sw-demo-01",  "network", "Demo Switch 1",       "", "",            "",              "",             "in_stock", "access;switch"],
-  ["device-demo-01", "other", "Demo Other Device",  "", "",            "",              "",             "unknown",  ""],
+  ["device_type", "name", "device_model_code", "serial_number", "asset_tag", "external_ref", "status", "tags"],
+  ["server",  "Demo Server 1",       "", "SN-DEMO-001", "ASSET-DEMO-001", "REF-DEMO-001", "in_stock", "production"],
+  ["server",  "Demo Server 2",       "", "SN-DEMO-002", "",              "",             "planned",  "staging"],
+  ["network", "Demo Switch 1",       "", "",            "",              "",             "in_stock", "access;switch"],
+  ["other",   "Demo Other Device",   "", "",            "",              "",             "unknown",  ""],
 ];
 
 export const SAMPLE_CSV_CONTENT: string =
diff --git a/apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx b/apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx
index 6199ce1..6ad19c9 100644
--- a/apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx
+++ b/apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx
@@ -80,7 +80,7 @@ export function DeviceModelsPanel({
   function handleSaved() {
     setReloadToken((t) => t + 1);
     onRepositoryMutated();
-    const label = editingModel ? editingModel.code : "Device model";
+    const label = editingModel ? editingModel.name : "Device model";
     setSuccessMsg(editingModel ? `"${label}" updated.` : "Device model added.");
   }
 
@@ -147,9 +147,8 @@ export function DeviceModelsPanel({
             <table className="tbl">
               <thead>
                 <tr>
-                  <th className="tbl-mono">Code</th>
-                  <th>Type</th>
                   <th>Name</th>
+                  <th>Type</th>
                   <th>Vendor</th>
                   <th className="tbl-mono">Model / SKU</th>
                   <th className="tbl-num">Height</th>
@@ -167,8 +166,8 @@ export function DeviceModelsPanel({
                         : undefined
                     }
                   >
-                    <td className="tbl-mono">
-                      <strong>{m.code}</strong>
+                    <td>
+                      <strong>{m.name}</strong>
                     </td>
                     <td>
                       <Badge
@@ -177,7 +176,6 @@ export function DeviceModelsPanel({
                         {m.device_type}
                       </Badge>
                     </td>
-                    <td>{m.name}</td>
                     <td>
                       {m.vendor ?? (
                         <span style={{ color: "var(--tx-4)" }}>—</span>
diff --git a/apps/desktop/src/features/devices/DevicesPanel.tsx b/apps/desktop/src/features/devices/DevicesPanel.tsx
index 3a02ff5..7d326d8 100644
--- a/apps/desktop/src/features/devices/DevicesPanel.tsx
+++ b/apps/desktop/src/features/devices/DevicesPanel.tsx
@@ -119,7 +119,7 @@ export function DevicesPanel({
   function handleSaved() {
     setReloadToken((t) => t + 1);
     onRepositoryMutated();
-    const label = editingDevice ? editingDevice.code : "Device";
+    const label = editingDevice ? (editingDevice.name ?? "Unnamed device") : "Device";
     setSuccessMsg(editingDevice ? `"${label}" updated.` : "Device added.");
   }
 
@@ -215,9 +215,8 @@ export function DevicesPanel({
               <thead>
                 <tr>
                   <th style={{ width: 20 }} />
-                  <th className="tbl-mono">Code</th>
-                  <th>Type</th>
                   <th>Name</th>
+                  <th>Type</th>
                   <th>Status</th>
                   <th>Placed</th>
                   <th>Model</th>
@@ -227,7 +226,10 @@ export function DevicesPanel({
                 </tr>
               </thead>
               <tbody>
-                {filtered.map((dev) => (
+                {filtered.map((dev) => {
+                  const devName = dev.name ?? "Unnamed device";
+                  const modelName = models.find((m) => m.id === dev.device_model_id)?.name ?? null;
+                  return (
                   <tr
                     key={dev.id}
                     data-dev-id={dev.id}
@@ -238,17 +240,12 @@ export function DevicesPanel({
                     <td style={{ color: "var(--tx-3)" }}>
                       {typeIcon(dev.device_type)}
                     </td>
-                    <td className="tbl-mono">
-                      <strong>{dev.code}</strong>
+                    <td>
+                      <strong>{devName}</strong>
                     </td>
                     <td className="tbl-mono" style={{ color: "var(--tx-3)" }}>
                       {dev.device_type}
                     </td>
-                    <td>
-                      {dev.name ?? (
-                        <span style={{ color: "var(--tx-4)" }}>—</span>
-                      )}
-                    </td>
                     <td>{deviceStatusBadge(dev.status)}</td>
                     <td>
                       {dev.is_placed ? (
@@ -258,14 +255,13 @@ export function DevicesPanel({
                       )}
                     </td>
                     <td
-                      className="tbl-mono"
                       style={{
-                        color: dev.device_model_code
+                        color: modelName
                           ? undefined
                           : "var(--st-warn-tx)",
                       }}
                     >
-                      {dev.device_model_code ?? "no model"}
+                      {modelName ?? "no model"}
                     </td>
                     <td className="tbl-mono">{dev.serial_number ?? "—"}</td>
                     <td className="tbl-mono">{dev.asset_tag ?? "—"}</td>
@@ -273,7 +269,7 @@ export function DevicesPanel({
                       <button
                         className="btn btn-ghost btn-sm btn-icon"
                         title="Edit"
-                        aria-label={`Edit ${dev.code}`}
+                        aria-label={`Edit ${devName}`}
                         onClick={() => openEdit(dev)}
                       >
                         <IcEdit size={12} />
@@ -281,7 +277,7 @@ export function DevicesPanel({
                       <button
                         className="btn btn-ghost btn-sm btn-icon"
                         title="Delete"
-                        aria-label={`Delete ${dev.code}`}
+                        aria-label={`Delete ${devName}`}
                         onClick={() => setPendingDelete(dev)}
                         style={{ color: "var(--st-err-tx)" }}
                       >
@@ -289,7 +285,8 @@ export function DevicesPanel({
                       </button>
                     </td>
                   </tr>
-                ))}
+                  );
+                })}
               </tbody>
             </table>
           )}
@@ -306,7 +303,7 @@ export function DevicesPanel({
 
       <ConfirmDialog
         open={pendingDelete !== null}
-        title={`Delete "${pendingDelete?.code}"?`}
+        title={`Delete "${pendingDelete?.name ?? "Unnamed device"}"?`}
         body="This will remove the device from the repository on the next save. Placed devices must be unplaced before they can be deleted."
         confirmLabel="Delete device"
         cancelLabel="Cancel"
diff --git a/apps/desktop/src/features/locations/LocationsPanel.tsx b/apps/desktop/src/features/locations/LocationsPanel.tsx
index 3f0ce47..fdca26a 100644
--- a/apps/desktop/src/features/locations/LocationsPanel.tsx
+++ b/apps/desktop/src/features/locations/LocationsPanel.tsx
@@ -72,7 +72,7 @@ export function LocationsPanel({
       const updated = await listLocations();
       setLocations(updated);
       onRepositoryMutated();
-      const label = editingLocation ? editingLocation.code : "Location";
+      const label = editingLocation ? editingLocation.name : "Location";
       setSuccessMsg(editingLocation ? `"${label}" updated.` : "Location added.");
     } catch (e) {
       setError(String(e));
@@ -134,7 +134,6 @@ export function LocationsPanel({
             <table className="tbl">
               <thead>
                 <tr>
-                  <th className="tbl-mono">Code</th>
                   <th>Name</th>
                   <th>Address</th>
                   <th>Description</th>
@@ -164,8 +163,7 @@ export function LocationsPanel({
                       onManageRacks?.(loc);
                     }}
                   >
-                    <td className="tbl-mono"><strong>{loc.code}</strong></td>
-                    <td>{loc.name}</td>
+                    <td><strong>{loc.name}</strong></td>
                     <td>{loc.address ?? <span style={{ color: "var(--tx-4)" }}>—</span>}</td>
                     <td style={{ color: "var(--tx-3)" }}>{loc.description ?? "—"}</td>
                     <td className="tbl-num tbl-mono">{loc.rack_count}</td>
diff --git a/apps/desktop/src/features/racks/PlacementInspectorPanel.tsx b/apps/desktop/src/features/racks/PlacementInspectorPanel.tsx
index 314d79c..528855a 100644
--- a/apps/desktop/src/features/racks/PlacementInspectorPanel.tsx
+++ b/apps/desktop/src/features/racks/PlacementInspectorPanel.tsx
@@ -56,10 +56,8 @@ export function PlacementInspectorPanel({
   }
 
   const rows: [string, string | number | null | undefined, boolean?][] = [
-    ["Code",            placement.code,                  true],
     ["Side",            side,                            false],
     ["Target type",     placement.target_kind,           false],
-    ["Target code",     placement.target_code,           true],
     ["Target name",     placement.target_name,           false],
     ["Device type",     placement.device_type,           false],
     ["Start U",         placement.start_u,               true],
@@ -91,7 +89,7 @@ export function PlacementInspectorPanel({
         title="Remove from rack?"
         body={
           <p style={{ margin: 0, fontSize: 13 }}>
-            Remove <strong>{placement.code}</strong> from this rack?
+            Remove <strong>{placement.target_name ?? placement.target_code ?? placement.code}</strong> from this rack?
             The device is not deleted — it returns to the unplaced list.
             This is an in-memory change until Save is used.
           </p>
diff --git a/apps/desktop/src/features/racks/PlacementPalettePanel.tsx b/apps/desktop/src/features/racks/PlacementPalettePanel.tsx
index f84de87..92c8058 100644
--- a/apps/desktop/src/features/racks/PlacementPalettePanel.tsx
+++ b/apps/desktop/src/features/racks/PlacementPalettePanel.tsx
@@ -203,10 +203,10 @@ export function PlacementPalettePanel({
                     writeDragData(e.dataTransfer, encodeDndPayload(payload));
                   }}
                   onDragEnd={() => setActiveDragPayload(null)}
-                  title={`Drag to place ${d.code}${modelHeight ? ` (${modelHeight}U)` : ""}`}
+                  title={`Drag to place ${d.name ?? d.code}${modelHeight ? ` (${modelHeight}U)` : ""}`}
                 >
                   <span className="pc-drag">⠿</span>
-                  <span className="pc-name">{d.code}</span>
+                  <span className="pc-name">{d.name ?? "Unnamed device"}</span>
                   {modelHeight ? (
                     <span className="pc-meta">{modelHeight}U</span>
                   ) : (
@@ -216,8 +216,8 @@ export function PlacementPalettePanel({
                     className="btn btn-sm"
                     type="button"
                     style={{ marginLeft: "auto" }}
-                    title={`Place ${d.code}…`}
-                    aria-label={`Place ${d.code}`}
+                    title={`Place ${d.name ?? d.code}…`}
+                    aria-label={`Place ${d.name ?? d.code}`}
                     data-testid={`place-btn-device-${d.id}`}
                     onClick={() => onPlaceDevice(d.id)}
                   >
diff --git a/apps/desktop/src/features/racks/RackUnitDiagram.test.tsx b/apps/desktop/src/features/racks/RackUnitDiagram.test.tsx
index d4ad199..4cb3d10 100644
--- a/apps/desktop/src/features/racks/RackUnitDiagram.test.tsx
+++ b/apps/desktop/src/features/racks/RackUnitDiagram.test.tsx
@@ -48,10 +48,10 @@ describe("RackUnitDiagram — column layout", () => {
     expect(screen.getByTestId("diagram-col-name").textContent?.trim()).toBe("Name");
   });
 
-  it('has "Model" and "Code / SN" column headers', () => {
+  it('has "Model" and "Serial" column headers', () => {
     render(<RackUnitDiagram {...BASE_PROPS} />);
     expect(screen.getByTestId("diagram-col-model").textContent?.trim()).toBe("Model");
-    expect(screen.getByTestId("diagram-col-code").textContent?.includes("Code")).toBe(true);
+    expect(screen.getByTestId("diagram-col-code").textContent?.trim()).toBe("Serial");
   });
 
   it('has an "Asset tag" column header', () => {
diff --git a/apps/desktop/src/features/racks/RackUnitDiagram.tsx b/apps/desktop/src/features/racks/RackUnitDiagram.tsx
index c185c49..9484f7c 100644
--- a/apps/desktop/src/features/racks/RackUnitDiagram.tsx
+++ b/apps/desktop/src/features/racks/RackUnitDiagram.tsx
@@ -239,7 +239,7 @@ export function RackUnitDiagram({
             >
               <div style={headerCell(2, 100)} data-testid="diagram-col-name">Name</div>
               <div style={headerCell(1, 80)} data-testid="diagram-col-model">Model</div>
-              <div style={headerCell(1, 80)} data-testid="diagram-col-code">Code / SN</div>
+              <div style={headerCell(1, 80)} data-testid="diagram-col-code">Serial</div>
               <div style={{ ...headerCell(1, 80), borderRight: "none" }} data-testid="diagram-col-asset">Asset tag</div>
             </div>
 
@@ -261,10 +261,7 @@ export function RackUnitDiagram({
                 const hoveredInvalid = isInRange(startU) && hovered !== null && !hovered.valid;
 
                 const modelLabel = label.model ?? "—";
-                const codeLabel =
-                  p.target_code ??
-                  (p.target_serial ? `SN: ${p.target_serial}` : null) ??
-                  "—";
+                const codeLabel = p.target_serial ?? "—";
                 const assetLabel = p.target_asset_tag ?? "—";
 
                 return (
diff --git a/apps/desktop/src/features/racks/RacksPanel.tsx b/apps/desktop/src/features/racks/RacksPanel.tsx
index 20300cf..e8081f9 100644
--- a/apps/desktop/src/features/racks/RacksPanel.tsx
+++ b/apps/desktop/src/features/racks/RacksPanel.tsx
@@ -171,7 +171,7 @@ export function RacksPanel({
     if (!destRack) return false;
     setPendingNavigation({
       placementId,
-      message: `Moved to rack ${destRack.code} in memory. Use Save to persist changes.`,
+      message: `Moved to rack ${destRack.name ?? destRack.code} in memory. Use Save to persist changes.`,
     });
     setRecentlyNavigatedRackId(destRack.id);
     onSelectRack(destRack);
@@ -192,7 +192,7 @@ export function RacksPanel({
 
   function handleSaved() {
     handleRepositoryMutated();
-    const label = editingRack ? editingRack.code : "Rack";
+    const label = editingRack ? (editingRack.name ?? editingRack.code) : "Rack";
     setSuccessMsg(editingRack ? `"${label}" updated.` : "Rack added.");
   }
 
@@ -251,13 +251,13 @@ export function RacksPanel({
   // Location-scoped list view
   const visibleRacks = racks.filter((r) => r.location_id === selectedLocation.id);
 
-  const locationLabel = `${selectedLocation.code} — ${selectedLocation.name}`;
+  const locationLabel = selectedLocation.name;
 
   return (
     <>
       <PageHeader
         title="Racks"
-        subtitle={`Racks in ${selectedLocation.name} (${selectedLocation.code})`}
+        subtitle={`Racks in ${selectedLocation.name}`}
         actions={
           <button className="btn btn-primary" onClick={openAdd}>
             <IcPlus size={12} /> Add rack
@@ -294,7 +294,6 @@ export function RacksPanel({
             <table className="tbl">
               <thead>
                 <tr>
-                  <th className="tbl-mono">Code</th>
                   <th>Name</th>
                   <th className="tbl-mono">Row</th>
                   <th className="tbl-num">Height</th>
@@ -320,10 +319,9 @@ export function RacksPanel({
                       className={`tbl-clickable${isNavHighlight ? " tbl-selected" : ""}`}
                       onClick={() => handleRowClick(rack)}
                     >
-                      <td className="tbl-mono">
-                        <strong>{rack.code}</strong>
+                      <td>
+                        <strong>{rack.name ?? rack.code}</strong>
                       </td>
-                      <td>{rack.name}</td>
                       <td className="tbl-mono">{rack.row ?? "—"}</td>
                       <td className="tbl-num tbl-mono">{rack.height_u}U</td>
                       <td>
diff --git a/crates/ris-application/src/session.rs b/crates/ris-application/src/session.rs
index e3bef3c..0130b08 100644
--- a/crates/ris-application/src/session.rs
+++ b/crates/ris-application/src/session.rs
@@ -201,13 +201,13 @@ fn generate_device_model_code(
 }
 
 fn generate_device_code(index: &ris_repository::RepositoryIndex) -> String {
-    for n in 1u32.. {
-        let code = format!("device-{n:02}");
+    loop {
+        let hex = format!("{}", uuid::Uuid::new_v4().simple());
+        let code = format!("dev-{}", &hex[..8]);
         if !index.devices_by_code.contains_key(&code) {
             return code;
         }
     }
-    unreachable!()
 }
 
 impl RepositorySession {
@@ -981,7 +981,7 @@ impl RepositorySession {
             self.add_device(AddDeviceInput {
                 id: None,
                 device_type,
-                code: row.code.clone(),
+                code: None,
                 name: row.name.clone(),
                 device_model_id: row.resolved_device_model_id.clone(),
                 device_model_code: None,
diff --git a/crates/ris-application/tests/application_tests.rs b/crates/ris-application/tests/application_tests.rs
index ebda713..29ee10b 100644
--- a/crates/ris-application/tests/application_tests.rs
+++ b/crates/ris-application/tests/application_tests.rs
@@ -640,7 +640,7 @@ fn add_device_save_reload_preserves_device() {
 #[test]
 fn csv_preview_valid_row_returns_create_action() {
     let session = open_repository(&fixture("valid-repository")).unwrap();
-    let csv = "code,device_type,status,name\nnew-srv-01,server,in_stock,New Server\n";
+    let csv = "device_type,status,name\nserver,in_stock,New Server\n";
     let preview = session.preview_devices_csv(csv);
     assert_eq!(preview.rows.len(), 1);
     assert_eq!(preview.rows[0].action, CsvRowAction::Create);
@@ -648,13 +648,13 @@ fn csv_preview_valid_row_returns_create_action() {
 }
 
 #[test]
-fn csv_preview_existing_code_returns_error() {
+fn csv_preview_duplicate_serial_returns_error() {
+    // duplicate serial number in CSV triggers VAL-CSV-015 ERROR
     let session = open_repository(&fixture("valid-repository")).unwrap();
-    // srv-01 already exists in the repository
-    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Duplicate\n";
+    let csv = "device_type,status,serial_number\nserver,in_stock,SN-DUPE\nserver,in_stock,SN-DUPE\n";
     let preview = session.preview_devices_csv(csv);
-    assert_eq!(preview.rows.len(), 1);
-    assert_eq!(preview.rows[0].action, CsvRowAction::SkipDueToError);
+    assert_eq!(preview.rows.len(), 2);
+    assert!(preview.rows.iter().any(|r| r.action == CsvRowAction::SkipDueToError));
 }
 
 #[test]
@@ -1027,8 +1027,8 @@ fn add_device_without_code_generates_unique_code() {
     let device = session.index.devices_by_id.get(&id).unwrap();
     assert!(!device.code.is_empty(), "generated code must be non-empty");
     assert!(
-        device.code.starts_with("device-"),
-        "generated device code should start with 'device-'"
+        device.code.starts_with("dev-"),
+        "generated device code should start with 'dev-'"
     );
 }
 
@@ -2470,9 +2470,9 @@ fn placement_counts_after_cross_rack_move() {
 
 // ── import_devices_csv ────────────────────────────────────────────────────────
 
-const VALID_CSV: &str = "code,device_type,status,name,serial_number\n\
-srv-import-01,server,in_stock,Import Server One,SN-IMP-001\n\
-srv-import-02,server,planned,Import Server Two,SN-IMP-002\n";
+const VALID_CSV: &str = "device_type,status,name,serial_number\n\
+server,in_stock,Import Server One,SN-IMP-001\n\
+server,planned,Import Server Two,SN-IMP-002\n";
 
 const INVALID_CSV_MISSING_HEADER: &str = "code,status,name\nsrv-x,in_stock,No Type\n";
 
@@ -2486,8 +2486,12 @@ fn import_devices_csv_valid_creates_devices() {
     let result = session.import_devices_csv(VALID_CSV).unwrap();
     assert_eq!(result.created_count, 2);
     assert_eq!(session.data.devices.len(), before + 2);
-    assert!(session.index.get_device_by_code("srv-import-01").is_some());
-    assert!(session.index.get_device_by_code("srv-import-02").is_some());
+    // Codes are auto-generated (dev-XXXXXXXX format); verify by serial number instead.
+    assert!(session.data.devices.iter().any(|d| d.serial_number.as_deref() == Some("SN-IMP-001")));
+    assert!(session.data.devices.iter().any(|d| d.serial_number.as_deref() == Some("SN-IMP-002")));
+    // Auto-generated codes must start with "dev-"
+    let new_devices: Vec<_> = session.data.devices.iter().skip(before).collect();
+    assert!(new_devices.iter().all(|d| d.code.starts_with("dev-")));
 }
 
 #[test]
@@ -2499,8 +2503,8 @@ fn import_devices_csv_save_reload_persists_devices() {
     session.import_devices_csv(VALID_CSV).unwrap();
     session.save().unwrap();
     let reloaded = open_repository(&dst).unwrap();
-    assert!(reloaded.index.get_device_by_code("srv-import-01").is_some());
-    assert!(reloaded.index.get_device_by_code("srv-import-02").is_some());
+    assert!(reloaded.data.devices.iter().any(|d| d.serial_number.as_deref() == Some("SN-IMP-001")));
+    assert!(reloaded.data.devices.iter().any(|d| d.serial_number.as_deref() == Some("SN-IMP-002")));
 }
 
 #[test]
@@ -2540,14 +2544,19 @@ fn import_devices_csv_rejects_error_row() {
 }
 
 #[test]
-fn import_devices_csv_rejects_existing_code() {
+fn import_devices_csv_ignores_code_column_and_creates_device() {
+    // The "code" column is now unknown; its value is ignored and a new code is auto-generated.
+    // A CSV that previously would have been rejected due to duplicate code now succeeds.
     let mut session = open_repository(&fixture("valid-repository")).unwrap();
-    // srv-01 already exists in the fixture
-    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Dup\n";
+    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Imported With Old Code\n";
     let before = session.data.devices.len();
-    let err = session.import_devices_csv(csv).unwrap_err();
-    assert!(err.to_string().contains("errors"), "{err}");
-    assert_eq!(session.data.devices.len(), before);
+    let result = session.import_devices_csv(csv).unwrap();
+    assert_eq!(result.created_count, 1);
+    assert_eq!(session.data.devices.len(), before + 1);
+    // The newly created device has an auto-generated code, not "srv-01"
+    let new_dev = session.data.devices.last().unwrap();
+    assert_ne!(new_dev.code, "srv-01");
+    assert!(new_dev.code.starts_with("dev-"));
 }
 
 #[test]
diff --git a/crates/ris-application/tests/mvp_smoke_tests.rs b/crates/ris-application/tests/mvp_smoke_tests.rs
index 69def70..398dde7 100644
--- a/crates/ris-application/tests/mvp_smoke_tests.rs
+++ b/crates/ris-application/tests/mvp_smoke_tests.rs
@@ -145,9 +145,9 @@ fn mvp_smoke_full_workflow() {
 
     // ── 7. Preview valid CSV (2 new devices) ──────────────────────────────────
     let csv = concat!(
-        "code,device_type,status,name\n",
-        "smoke-csv-01,server,in_stock,Smoke CSV Server 01\n",
-        "smoke-csv-02,network,planned,Smoke CSV Switch 01\n",
+        "device_type,status,name\n",
+        "server,in_stock,Smoke CSV Server 01\n",
+        "network,planned,Smoke CSV Switch 01\n",
     );
     let preview = session.preview_devices_csv(csv);
     assert_eq!(preview.rows.len(), 2);
@@ -163,15 +163,20 @@ fn mvp_smoke_full_workflow() {
     let import_result = session.import_devices_csv(csv).unwrap();
     assert_eq!(import_result.created_count, 2);
     assert_eq!(session.list_devices().len(), initial_devices + 3);
-    assert!(session.index.get_device_by_code("smoke-csv-01").is_some());
-    assert!(session.index.get_device_by_code("smoke-csv-02").is_some());
-    // imported devices are unplaced
+    // Codes are auto-generated; verify by name instead
     let csv01_id = session
-        .index
-        .get_device_by_code("smoke-csv-01")
-        .unwrap()
-        .id
-        .clone();
+        .data
+        .devices
+        .iter()
+        .find(|d| d.name.as_deref() == Some("Smoke CSV Server 01"))
+        .map(|d| d.id.clone())
+        .expect("CSV server 01 must exist");
+    assert!(session
+        .data
+        .devices
+        .iter()
+        .any(|d| d.name.as_deref() == Some("Smoke CSV Switch 01")));
+    // imported devices are unplaced
     assert!(session
         .get_unplaced_devices()
         .iter()
@@ -321,8 +326,9 @@ fn mvp_smoke_full_workflow() {
         .is_some());
     assert!(s2.index.get_device_model_by_code("smoke-patch").is_some());
     assert!(s2.index.get_device_by_code("smoke-srv-01").is_some());
-    assert!(s2.index.get_device_by_code("smoke-csv-01").is_some());
-    assert!(s2.index.get_device_by_code("smoke-csv-02").is_some());
+    // CSV-imported devices have auto-generated codes; verify by name
+    assert!(s2.data.devices.iter().any(|d| d.name.as_deref() == Some("Smoke CSV Server 01")));
+    assert!(s2.data.devices.iter().any(|d| d.name.as_deref() == Some("Smoke CSV Switch 01")));
 
     // placement state persists:
     // front: 1 (patch), rear: 1 (srv-01 at U1)
@@ -346,13 +352,12 @@ fn mvp_smoke_full_workflow() {
         "removed placement must not reappear after reload"
     );
 
-    // csv-01 device is still present but unplaced
-    assert!(s2.index.get_device_by_code("smoke-csv-01").is_some());
-    let csv01_dev = s2.index.get_device_by_code("smoke-csv-01").unwrap();
+    // csv-01 device is still present but unplaced (identified by the saved id)
+    assert!(s2.data.devices.iter().any(|d| d.id == csv01_id));
     let unplaced2: Vec<_> = s2.get_unplaced_devices();
     assert!(
-        unplaced2.iter().any(|d| d.id == csv01_dev.id),
-        "smoke-csv-01 should be unplaced after reload"
+        unplaced2.iter().any(|d| d.id == csv01_id),
+        "csv server 01 should be unplaced after reload"
     );
 }
 
diff --git a/crates/ris-import/Cargo.toml b/crates/ris-import/Cargo.toml
index 13634f8..ff69abd 100644
--- a/crates/ris-import/Cargo.toml
+++ b/crates/ris-import/Cargo.toml
@@ -8,4 +8,3 @@ description = "CSV import and import preview."
 ris-core = { path = "../ris-core" }
 ris-repository = { path = "../ris-repository" }
 csv = "1"
-regex = "1"
diff --git a/crates/ris-import/src/csv_reader.rs b/crates/ris-import/src/csv_reader.rs
index e9dc8f5..7528ce8 100644
--- a/crates/ris-import/src/csv_reader.rs
+++ b/crates/ris-import/src/csv_reader.rs
@@ -1,7 +1,6 @@
 use std::collections::HashMap;
 
 pub(crate) const KNOWN_COLUMNS: &[&str] = &[
-    "code",
     "device_type",
     "name",
     "device_model_code",
@@ -16,7 +15,6 @@ pub(crate) const REQUIRED_COLUMNS: &[&str] = &["device_type", "status"];
 
 pub(crate) struct CsvDeviceRowRaw {
     pub row_number: usize,
-    pub code: Option<String>,
     pub device_type: Option<String>,
     pub name: Option<String>,
     pub device_model_code: Option<String>,
@@ -84,7 +82,6 @@ pub(crate) fn parse_csv(content: &str) -> Result<ParsedCsv, String> {
 
         rows.push(CsvDeviceRowRaw {
             row_number,
-            code: get_field(&record, &col_index, "code"),
             device_type: get_field(&record, &col_index, "device_type"),
             name: get_field(&record, &col_index, "name"),
             device_model_code: get_field(&record, &col_index, "device_model_code"),
diff --git a/crates/ris-import/src/preview.rs b/crates/ris-import/src/preview.rs
index 5e9faea..0051262 100644
--- a/crates/ris-import/src/preview.rs
+++ b/crates/ris-import/src/preview.rs
@@ -21,7 +21,6 @@ pub struct CsvImportSummary {
 #[derive(Debug, Clone)]
 pub struct CsvDeviceImportPreviewRow {
     pub row_number: usize,
-    pub code: Option<String>,
     pub device_type: Option<String>,
     pub name: Option<String>,
     pub device_model_code: Option<String>,
diff --git a/crates/ris-import/src/validator.rs b/crates/ris-import/src/validator.rs
index 3167945..90f48f5 100644
--- a/crates/ris-import/src/validator.rs
+++ b/crates/ris-import/src/validator.rs
@@ -8,14 +8,6 @@ use crate::preview::{
     CsvDeviceImportPreview, CsvDeviceImportPreviewRow, CsvImportSummary, CsvRowAction,
 };
 
-// ── regex ────────────────────────────────────────────────────────────────────
-
-static CODE_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
-
-fn code_re() -> &'static regex::Regex {
-    CODE_RE.get_or_init(|| regex::Regex::new(r"^[a-z0-9][a-z0-9._-]*$").unwrap())
-}
-
 // ── issue helpers ─────────────────────────────────────────────────────────────
 
 fn csv_file_issue(code: &str, level: ValidationLevel, message: &str) -> ValidationIssue {
@@ -100,7 +92,6 @@ fn find_duplicates<'a>(values: impl Iterator<Item = &'a str>) -> HashSet<String>
 fn validate_row(
     raw: &CsvDeviceRowRaw,
     context: &CsvImportContext,
-    dup_codes: &HashSet<String>,
     dup_serials: &HashSet<String>,
     dup_asset_tags: &HashSet<String>,
     dup_external_refs: &HashSet<String>,
@@ -108,45 +99,6 @@ fn validate_row(
     let row = raw.row_number;
     let mut issues: Vec<ValidationIssue> = Vec::new();
 
-    // Code is now optional; when present, validate format and uniqueness.
-    if let Some(code_val) = raw.code.as_deref() {
-        // VAL-CSV-004: code format
-        if !code_re().is_match(code_val) {
-            issues.push(csv_row_issue(
-                "VAL-CSV-004",
-                ValidationLevel::Error,
-                &format!(
-                    "code '{}' does not match required format ^[a-z0-9][a-z0-9._-]*$",
-                    code_val
-                ),
-                row,
-                "code",
-            ));
-        }
-
-        // VAL-CSV-005: duplicate code in CSV
-        if dup_codes.contains(code_val) {
-            issues.push(csv_row_issue(
-                "VAL-CSV-005",
-                ValidationLevel::Error,
-                &format!("code '{}' appears more than once in the CSV", code_val),
-                row,
-                "code",
-            ));
-        }
-
-        // VAL-CSV-006: code already exists in repository
-        if context.has_device_code(code_val) {
-            issues.push(csv_row_issue(
-                "VAL-CSV-006",
-                ValidationLevel::Error,
-                &format!("code '{}' already exists in the repository", code_val),
-                row,
-                "code",
-            ));
-        }
-    }
-
     // VAL-CSV-007: at least one of name, serial_number, asset_tag, external_ref
     let has_name = raw.name.is_some();
     let has_sn = raw.serial_number.is_some();
@@ -378,7 +330,6 @@ fn validate_row(
 
     CsvDeviceImportPreviewRow {
         row_number: raw.row_number,
-        code: raw.code.clone(),
         device_type: raw.device_type.clone(),
         name: raw.name.clone(),
         device_model_code: raw.device_model_code.clone(),
@@ -466,7 +417,6 @@ pub fn preview_csv_import(csv_content: &str, context: &CsvImportContext) -> CsvD
 
     // ── pre-scan for in-CSV duplicates ────────────────────────────────────────
 
-    let dup_codes = find_duplicates(parsed.rows.iter().filter_map(|r| r.code.as_deref()));
     let dup_serials = find_duplicates(
         parsed
             .rows
@@ -486,7 +436,6 @@ pub fn preview_csv_import(csv_content: &str, context: &CsvImportContext) -> CsvD
             validate_row(
                 raw,
                 context,
-                &dup_codes,
                 &dup_serials,
                 &dup_asset_tags,
                 &dup_external_refs,
diff --git a/crates/ris-import/tests/csv_import_tests.rs b/crates/ris-import/tests/csv_import_tests.rs
index 7aa1f2c..0fca969 100644
--- a/crates/ris-import/tests/csv_import_tests.rs
+++ b/crates/ris-import/tests/csv_import_tests.rs
@@ -144,12 +144,16 @@ fn all_issues(preview: &ris_import::CsvDeviceImportPreview) -> Vec<ris_core::Val
 
 #[test]
 fn valid_csv_headers_pass() {
-    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Server One\n";
+    let csv = "device_type,status,name\nserver,in_stock,Server One\n";
     let preview = ris_import::preview_csv_import(csv, &empty_context());
     assert!(
         !has_code(&preview.issues, "VAL-CSV-001"),
         "unexpected VAL-CSV-001 with valid headers"
     );
+    assert!(
+        preview.issues.is_empty(),
+        "no warnings expected with known-only headers"
+    );
 }
 
 #[test]
@@ -184,60 +188,22 @@ fn unknown_column_reports_val_csv_002_warning() {
     assert_eq!(preview.rows.len(), 1);
 }
 
-// ── code validation ───────────────────────────────────────────────────────────
+// ── code column is now ignored ────────────────────────────────────────────────
 
 #[test]
-fn blank_code_cell_produces_no_error() {
-    // blank code is treated as absent → will be auto-generated at import time
-    let csv = "code,device_type,status,name\n,server,in_stock,Server One\n";
+fn code_column_triggers_val_csv_002_warning_and_does_not_block_import() {
+    // "code" is no longer a known column; CSVs that include it get a VAL-CSV-002
+    // warning but the rows are still processed normally.
+    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Server One\n";
     let preview = ris_import::preview_csv_import(csv, &empty_context());
-    let issues = all_issues(&preview);
     assert!(
-        !issues.iter().any(|i| i.level == ValidationLevel::Error),
-        "blank code should produce no error"
+        has_code_level(&preview.issues, "VAL-CSV-002", ValidationLevel::Warning),
+        "expected VAL-CSV-002 Warning for 'code' column"
     );
+    assert_eq!(preview.rows.len(), 1);
     assert_eq!(preview.rows[0].action, CsvRowAction::Create);
 }
 
-#[test]
-fn invalid_code_format_reports_val_csv_004() {
-    let csv = "code,device_type,status,name\nBad Code!,server,in_stock,Server One\n";
-    let preview = ris_import::preview_csv_import(csv, &empty_context());
-    let issues = all_issues(&preview);
-    assert!(has_code(&issues, "VAL-CSV-004"), "expected VAL-CSV-004");
-}
-
-#[test]
-fn duplicate_code_in_csv_reports_val_csv_005() {
-    let csv =
-        "code,device_type,status,name\nsrv-01,server,in_stock,Srv A\nsrv-01,server,in_stock,Srv B\n";
-    let preview = ris_import::preview_csv_import(csv, &empty_context());
-    let issues = all_issues(&preview);
-    assert!(has_code(&issues, "VAL-CSV-005"), "expected VAL-CSV-005");
-    // Both rows with the duplicate should be flagged
-    let dup_rows = preview
-        .rows
-        .iter()
-        .filter(|r| has_code(&r.issues, "VAL-CSV-005"))
-        .count();
-    assert_eq!(dup_rows, 2, "both duplicate rows should have VAL-CSV-005");
-}
-
-#[test]
-fn code_exists_in_repo_reports_val_csv_006() {
-    let ctx = context_with_devices(vec![make_device(
-        "aaaa0001-0000-0000-0000-000000000001",
-        "srv-01",
-        DeviceType::Server,
-        None,
-        None,
-    )]);
-    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Server One\n";
-    let preview = ris_import::preview_csv_import(csv, &ctx);
-    let issues = all_issues(&preview);
-    assert!(has_code(&issues, "VAL-CSV-006"), "expected VAL-CSV-006");
-}
-
 // ── name/sn/asset_tag validation ──────────────────────────────────────────────
 
 #[test]
@@ -612,8 +578,8 @@ fn valid_row_has_action_create() {
 
 #[test]
 fn row_with_error_has_action_skip_due_to_error() {
-    // invalid code format triggers VAL-CSV-004 ERROR
-    let csv = "code,device_type,status,name\nBad!,server,in_stock,Server One\n";
+    // invalid device_type triggers VAL-CSV-011 ERROR
+    let csv = "device_type,status,name\nturbojet,in_stock,Server One\n";
     let preview = ris_import::preview_csv_import(csv, &empty_context());
     assert_eq!(preview.rows.len(), 1);
     assert_eq!(preview.rows[0].action, CsvRowAction::SkipDueToError);
@@ -652,9 +618,8 @@ fn preview_does_not_mutate_repository_context() {
 
 #[test]
 fn summary_counts_are_correct() {
-    // Row 1: valid; Row 2: invalid (bad code format)
-    let csv =
-        "code,device_type,status,name\nsrv-01,server,in_stock,Good\nBad!,server,in_stock,Bad\n";
+    // Row 1: valid; Row 2: invalid (bad device_type → VAL-CSV-011)
+    let csv = "device_type,status,name\nserver,in_stock,Good\nturbojet,in_stock,Bad\n";
     let preview = ris_import::preview_csv_import(csv, &empty_context());
     assert_eq!(preview.summary.total_rows, 2);
     assert_eq!(preview.summary.valid_rows, 1);
diff --git a/docs/BETA1_FOLLOWUP_PLAN_EN.md b/docs/BETA1_FOLLOWUP_PLAN_EN.md
index 2e3f258..ff05ffc 100644
--- a/docs/BETA1_FOLLOWUP_PLAN_EN.md
+++ b/docs/BETA1_FOLLOWUP_PLAN_EN.md
@@ -373,6 +373,6 @@ The remaining follow-up items are grouped into five PRs for focused review:
 |---|---|---|---|
 | C | Windows installer polish and ProgramData logs | Item 9 | Implemented |
 | D | Rack diagram unplaced devices UX | Item 11 | Implemented |
-| E | Hide technical `code` from UI; device/model display names | Item 10 | Planned |
+| E | Hide technical `code` from UI; device/model display names | Item 10 | Implemented |
 | F | Dirty repository guard | Item 7 | Planned |
 | G | Release/signing/versioning hardening (custom NSIS path, code signing) | — | Planned |
