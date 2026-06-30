## Summary

PR: harden(export): restrict export writes to SVG and PNG

Branch: `harden/beta3-export-write-allowlist` → base: `roadmap/beta3`

Audit finding F2: `write_export` in `repository.rs` accepted any file extension.
The path comes from the native Save dialog, so this is low-severity, but
defense-in-depth requires export commands to only write `.svg` and `.png` files.

Fix: added `validate_export_extension` helper that checks the file extension
(case-insensitively) before `std::fs::write`. Both `write_export_file` (SVG)
and `write_export_bytes` (PNG) are protected through the shared `write_export`
private function.

No version bump. No tags. No GitHub Release.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src-tauri/src/commands/repository.rs` | Added `validate_export_extension`, called inside `write_export`; added 8 new tests |
| `docs/BETA3_QA_RUNBOOK.md` | Added cases 9.10–9.11: backend extension rejection |
| `CHANGELOG.md` | Added security entry under Unreleased |

## Audit finding F2

`write_export` previously accepted any path extension. The native Save dialog
filters reduce the risk in normal usage, but the backend command accepted
arbitrary extensions (`.txt`, `.exe`, `.yaml`, etc.) and wrote arbitrary bytes.

## What changed in the export backend

Added `validate_export_extension(path: &Path) -> Result<(), String>`:
```rust
fn validate_export_extension(path: &std::path::Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some("svg") | Some("png") => Ok(()),
        _ => Err("Unsupported export file extension. Use .svg or .png.".to_string()),
    }
}
```

Called inside `write_export` after the blank/dir checks, before `fs::write`.

Validation order:
1. Empty path → error (unchanged)
2. Path is a directory → error (unchanged)
3. **Extension not .svg or .png → error (NEW)**
4. Parent directory missing → error (unchanged)
5. `std::fs::write` (unchanged)

## Allowed extensions

- `.svg` (and `.SVG`, `.Svg`, etc.)
- `.png` (and `.PNG`, `.Png`, etc.)

## Rejected examples

- `.txt`
- `.yaml`
- `.exe`
- `.json`
- `.pdf`
- (no extension)

## Frontend changes

None. Frontend already uses:
- `filters: [{ name: "SVG Files", extensions: ["svg"] }]` for SVG dialog
- `filters: [{ name: "PNG Files", extensions: ["png"] }]` for PNG dialog
- Default filenames `rack-{name}-{side}.svg` and `rack-{name}-{side}.png`

## Tests added

8 new tests in `commands::repository::tests`:

| Test name | What it covers |
|---|---|
| `write_export_allows_svg_extension` | `.svg` path accepted, file written |
| `write_export_allows_png_extension` | `.png` path accepted, file written |
| `write_export_extension_check_is_case_insensitive` | `.SVG` and `.Png` accepted |
| `write_export_rejects_unknown_extension` | `.txt`, `.yaml`, `.exe`, `.json`, `.pdf` rejected |
| `write_export_rejects_missing_extension` | no-extension path rejected |
| `validate_export_extension_accepts_svg_and_png` | pure helper: all case variants |
| `validate_export_extension_rejects_other_extensions` | pure helper: rejects 5 extensions |
| `validate_export_extension_rejects_no_extension` | pure helper: missing ext rejected |

Total src-tauri tests: 122 (was 114).

## Manual QA required

- Export SVG with default `.svg` filename → succeeds, file readable in browser
- Export PNG with default `.png` filename → succeeds, image opens correctly
- In SVG Save dialog: manually type `rack.txt`, confirm → error banner with "Unsupported export file extension"
- In PNG Save dialog: manually type `rack.json`, confirm → same error
- Cancel Save dialog → no error banner, no file written
- See `docs/BETA3_QA_RUNBOOK.md` cases 9.10–9.11

## Checks

```
cargo fmt --all --check                          → clean
cargo clippy --workspace -- -D warnings          → clean
cargo check --workspace                          → clean
cargo test --manifest-path src-tauri/Cargo.toml  → 122 passed
node scripts/check-version-consistency.mjs       → 0.1.0-beta.2, all match
node --test scripts/*.test.mjs                   → 19 passed
node scripts/check-repo-hygiene.mjs              → 8/8 checks passed
Frontend checks skipped locally — no frontend code changed.
```

## Risks

- Native Save dialog filters already restrict to `.svg`/`.png` in normal usage.
  The backend check adds defense-in-depth but is not reachable via normal UI
  flows unless the user manually types a different extension in the dialog.
- Case-insensitive matching (`to_ascii_lowercase`) handles common OS variations.
  Non-ASCII Unicode in the extension (edge case) would fail the `to_str()` call
  and be rejected as "missing extension" — this is the correct safe default.

## Confirmation

- No version bump ✓
- No tags created ✓
- No GitHub Release created ✓
- No `.ai/review-context-*.md` committed ✓

## Suggested next step

Manual QA of cases 9.10–9.11 in `docs/BETA3_QA_RUNBOOK.md` (extension
rejection), then prepare beta.3 release PR (version bump `0.1.0-beta.2` →
`0.1.0-beta.3`, CHANGELOG finalization, release notes).
