## Summary

Beta 4 Stage R1-R1: documentation-only repair correcting two defects found
in Stage R1's release-preparation documentation, plus a status-wording
correction on PR #172.

**Review finding 1 — the release-date/immutable-RC-SHA model was
logically inconsistent.** Stage R1's documentation claimed the changelog
heading could stay `— Unreleased` through the entire validation process
(installer build, Windows QA, WDIO) and then have its date filled in
"immediately before tagging... so the release SHA does not change." This
is impossible: writing the date into a tracked file is itself a content
change, which necessarily creates a new commit and therefore a new SHA,
regardless of when it happens. A flow of "validate SHA A → add release
date → create SHA B → tag SHA B" would tag a commit that never itself
passed the exact-SHA release gates — only its parent did.

**Corrected model:** a distinct **RC freeze** step, before any release
candidate artifact (the Windows installer) is built. Preparation (branch
cut, version bump, changelog/release-note drafting, ordinary static CI)
may still move the branch tip. At RC freeze, the release date and any
other release-facing tracked content is written and committed once, in
its own commit — that commit becomes the **RC freeze SHA**, and it is
what the installer, Windows QA, and any pre-merge WDIO dispatch actually
validate. No tracked release-content change should occur after RC freeze
without treating it as an intentional invalidation requiring the affected
gates to be repeated. A third distinct SHA, the **merged `master` SHA**
(created by the bootstrap merge), is what the eventual tag and exact-
`master` WDIO gate target — it necessarily differs from the RC freeze SHA
as a commit ID (merging creates a new commit), so the correct check is
tree-content equality between the RC freeze SHA and the merged `master`
SHA, never commit-ID equality. Documented in full in
`docs/BETA_RELEASE_PROCESS_EN.md`'s new "A.1 RC freeze" section.

**Review finding 2 — release-note dependency wording was too broad.**
`docs/releases/v0.1.0-beta.4.md`'s Security section previously implied all
remaining advisories were confined to "transitive build/test-tooling
dependencies" and that none were known to be reachable through
application code. That is not accurate for three of the four "unsound"
Rust advisories: `anyhow` is pulled in directly via `tauri` itself,
`glib` via the GTK3 stack (`tauri → muda → gtk → glib`), and `serde_yml`
via this application's own `ris-application`/`ris-repository` crates
(real repository/YAML parsing) — all three are genuinely compiled into
the shipped application, unconditionally, not gated behind an unused
feature. Verified by `cargo tree -i <crate> --target all` for each.
Corrected wording no longer claims these are build/test-only or "not
reachable" — see Dependency Classification below for what is and isn't
actually established.

No application code, fixture code, dependency file, or CI workflow file
changed in this repair — documentation only.

## Corrected RC freeze model

See `docs/BETA_RELEASE_PROCESS_EN.md`'s "A.1 RC freeze" section (new) and
the corrected "CHANGELOG workflow" section for the full model. Summary:

```
preparation (SHA moves)
  → RC freeze commit (date + release docs finalized) = RC freeze SHA
  → Windows installer build from RC freeze SHA
  → Windows manual QA against that installer
  → remaining pre-merge release gates
  → bootstrap merge to master (new commit — tree-content check vs. RC freeze SHA, not commit-ID equality)
  → exact-master WDIO against the merged master SHA
  → tag the exact validated master SHA
  → GitHub Release
```

## Dependency classification (corrected)

- **`rkyv` 0.7.46, RUSTSEC-2026-0235** — reviewed, proven inactive.
  Reaches `Cargo.lock` only via `rust_decimal`'s own optional `rkyv`
  feature; this workspace activates only `rust_decimal`'s `std` feature
  (confirmed: `cargo tree -e features -i rust_decimal --target all` shows
  no `rkyv` edge; `cargo tree -i rkyv --target all` shows no activated
  edge at all). The vulnerable code is not compiled into the application
  under any feature combination this workspace uses. Not a beta.4 release
  blocker. This specific proof does not generalize to any other advisory.
- **Frontend audit findings** (`undici`, `ip-address`, `extract-zip`,
  `brace-expansion`, `js-yaml`, `nanoid`) — confirmed confined to
  development/build/E2E tooling (WebdriverIO/Puppeteer-browsers chain,
  Vite/PostCSS build chain), not the shipped Tauri application runtime.
- **Rust "unmaintained" warnings** (GTK3 bindings, `proc-macro-error`,
  `unic-*`) — maintenance-status warnings, not vulnerabilities; the
  advisories themselves don't claim otherwise.
- **Rust "unsound" advisories** (`anyhow`, `glib`, `serde_yml`) — genuinely
  compiled into the shipped application (verified via `cargo tree`, not
  build/test-only). Their affected API/code-path reachability has not
  been fully established — no claim of "not exploitable" or "not
  reachable" is made for these. No branch-introduced upgrade caused them,
  and no safe in-scope upgrade was identified during beta.4 preparation.

## Standard CI vs. Dependency Audit (PR #172)

Distinguished explicitly, not summarized as a single "PR CI green":
standard release PR CI (Version consistency, Workflow lint, Script and
hygiene checks, Frontend checks, Rust workspace) — 5/5 green. Dependency
Audit (Frontend dependency audit, Rust dependency audit) — both red,
reviewed and documented (see Dependency classification above and PR
#172's dependency-audit comment); not treated as a required-check
failure, not suppressed, not ignored, no workflow or dependency file
touched to make it green.

## Files changed

- `docs/BETA_RELEASE_PROCESS_EN.md` — added "A.1 RC freeze" section;
  corrected the "CHANGELOG workflow" section's date-timing model;
  clarified the bootstrap-merge tree-vs-commit-ID distinction; noted the
  installer build must target the RC freeze SHA specifically.
- `docs/releases/v0.1.0-beta.4.md` — corrected the Date line's
  explanation (date set in the next RC-freeze stage, not "after
  validation without changing the SHA"); corrected the Security section
  per the classification above.
- `.ai/cc-report.md` — this file.

`CHANGELOG.md` was inspected; its existing "No calendar release date is
assigned yet" wording does not encode the incorrect timing model, so it
was left unchanged. PR #172's body and its dependency-audit comment were
also updated (tracked on GitHub, not in this repository).

No application source file, fixture file, dependency file
(`Cargo.lock`/`pnpm-lock.yaml`), or workflow file changed.

## Tests

No test code changed. No application/fixture behavior changed, so no
functional test run was required beyond the documentation-appropriate
validation below.

## Static validation

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm check:version` | ✓ all four sources at `0.1.0-beta.4` (unchanged) |
| `pnpm check:hygiene` | ✓ 8/8 |
| `pnpm test:scripts` | ✓ 237/237 |
| `actionlint` | clean, no findings |

A full desktop/Cargo test run was not performed — correctly out of scope
for a docs-only repair with no code, dependency, or workflow file changes.

## Risks

- WDIO bootstrap gap remains structurally unresolved (unchanged from
  Stage R1) — not something a documentation repair can close.
- Dependency-audit findings remain open on `development`/this release
  branch, now classified precisely rather than broadly; no safe in-scope
  upgrade identified for the unsound/unmaintained advisories.

## Not done

- RC date has not been chosen or frozen — explicitly reserved for the
  next stage (Beta 4 Stage R2).
- Installer build, Windows QA, WDIO dispatch, merge, tag, GitHub Release —
  all explicitly out of scope for this repair.

## Suggested next step

Proceed to Beta 4 Stage R2: choose the release date, create the RC freeze
commit, then build the Windows installer from that exact commit and run
Windows 11 manual QA against it.
