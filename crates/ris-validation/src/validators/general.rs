use std::collections::HashMap;

use ris_core::{ValidationIssue, ValidationLevel};
use ris_repository::RawRepositoryData;

use crate::helpers::{issue_f, issue_for_f};

static UUID_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
static CODE_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();

fn uuid_re() -> &'static regex::Regex {
    UUID_RE.get_or_init(|| {
        regex::Regex::new(
            r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        )
        .unwrap()
    })
}

fn code_re() -> &'static regex::Regex {
    CODE_RE.get_or_init(|| regex::Regex::new(r"^[a-z0-9][a-z0-9._-]*$").unwrap())
}

struct Entry<'a> {
    kind: &'static str,
    id: Option<&'a str>,
    code: Option<&'a str>,
    file_path: &'a str,
    tags_malformed: bool,
}

pub fn validate(raw: &RawRepositoryData) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let entries = collect_entries(raw);

    for e in &entries {
        let id = e.id.unwrap_or("");
        let code_str = e.code.unwrap_or("");

        // VAL-GEN-001 / VAL-GEN-002
        if e.id.is_none() {
            issues.push(issue_f(
                "VAL-GEN-001",
                ValidationLevel::Error,
                &format!("{} is missing required field 'id'", e.kind),
                e.file_path,
            ));
        } else if id.is_empty() {
            issues.push(issue_for_f(
                "VAL-GEN-001",
                ValidationLevel::Error,
                &format!("{} has an empty id", e.kind),
                e.kind,
                id,
                code_str,
                e.file_path,
            ));
        } else if !uuid_re().is_match(id) {
            issues.push(issue_for_f(
                "VAL-GEN-002",
                ValidationLevel::Error,
                &format!("{} id '{}' is not a valid UUID", e.kind, id),
                e.kind,
                id,
                code_str,
                e.file_path,
            ));
        }

        // VAL-GEN-003 / VAL-GEN-004 / VAL-GEN-005
        if e.code.is_none() {
            issues.push(issue_f(
                "VAL-GEN-003",
                ValidationLevel::Error,
                &format!("{} is missing required field 'code'", e.kind),
                e.file_path,
            ));
        } else if code_str.is_empty() {
            issues.push(issue_for_f(
                "VAL-GEN-004",
                ValidationLevel::Error,
                &format!("{} has an empty code", e.kind),
                e.kind,
                id,
                code_str,
                e.file_path,
            ));
        } else if !code_re().is_match(code_str) {
            issues.push(issue_for_f(
                "VAL-GEN-005",
                ValidationLevel::Error,
                &format!(
                    "{} code '{}' does not match ^[a-z0-9][a-z0-9._-]*$",
                    e.kind, code_str
                ),
                e.kind,
                id,
                code_str,
                e.file_path,
            ));
        }

        // VAL-GEN-008: tags must be a list of strings
        if e.tags_malformed {
            issues.push(issue_for_f(
                "VAL-GEN-008",
                ValidationLevel::Error,
                &format!("{} has invalid tags (must be a list of strings)", e.kind),
                e.kind,
                id,
                code_str,
                e.file_path,
            ));
        }
    }

    // VAL-GEN-006: globally unique id
    let mut id_seen: HashMap<&str, &str> = HashMap::new();
    for e in &entries {
        let id = match e.id {
            Some(s) if !s.is_empty() => s,
            _ => continue,
        };
        if let Some(prev_kind) = id_seen.insert(id, e.kind) {
            issues.push(issue_f(
                "VAL-GEN-006",
                ValidationLevel::Error,
                &format!(
                    "duplicate id '{}' found in {} and {}",
                    id, prev_kind, e.kind
                ),
                e.file_path,
            ));
        }
    }

    // VAL-GEN-007: code unique within object type
    let type_groups: &[&str] = &["location", "rack", "device_model", "device", "placement"];
    for kind in type_groups {
        let mut code_seen: HashMap<&str, &str> = HashMap::new();
        for e in entries.iter().filter(|e| e.kind == *kind) {
            let code_str = match e.code {
                Some(s) if !s.is_empty() => s,
                _ => continue,
            };
            let id = e.id.unwrap_or("");
            if let Some(prev_id) = code_seen.insert(code_str, id) {
                issues.push(issue_f(
                    "VAL-GEN-007",
                    ValidationLevel::Error,
                    &format!(
                        "duplicate {} code '{}' (ids: '{}', '{}')",
                        kind, code_str, prev_id, id
                    ),
                    e.file_path,
                ));
            }
        }
    }

    issues
}

fn collect_entries<'a>(raw: &'a RawRepositoryData) -> Vec<Entry<'a>> {
    let mut entries = Vec::new();

    if let Some(lf) = &raw.locations_file {
        for loc in &lf.locations {
            entries.push(Entry {
                kind: "location",
                id: loc.id.as_deref(),
                code: loc.code.as_deref(),
                file_path: &lf.file_path,
                tags_malformed: loc.tags_malformed,
            });
        }
    }

    for rf in &raw.rack_files {
        for rack in &rf.racks {
            entries.push(Entry {
                kind: "rack",
                id: rack.id.as_deref(),
                code: rack.code.as_deref(),
                file_path: &rf.file_path,
                tags_malformed: rack.tags_malformed,
            });
        }
    }

    for mf in &raw.device_model_files {
        for m in &mf.models {
            entries.push(Entry {
                kind: "device_model",
                id: m.id.as_deref(),
                code: m.code.as_deref(),
                file_path: &mf.file_path,
                tags_malformed: m.tags_malformed,
            });
        }
    }

    for df in &raw.device_files {
        for d in &df.devices {
            entries.push(Entry {
                kind: "device",
                id: d.id.as_deref(),
                code: d.code.as_deref(),
                file_path: &df.file_path,
                tags_malformed: d.tags_malformed,
            });
        }
    }

    for pf in &raw.placement_files {
        for p in pf.front.iter().chain(pf.rear.iter()) {
            entries.push(Entry {
                kind: "placement",
                id: p.id.as_deref(),
                code: p.code.as_deref(),
                file_path: &pf.file_path,
                tags_malformed: p.tags_malformed,
            });
        }
    }

    entries
}
