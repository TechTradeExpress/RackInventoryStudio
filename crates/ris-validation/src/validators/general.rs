use std::collections::HashMap;

use ris_core::{ValidationIssue, ValidationLevel};

use crate::helpers::issue_for;
use ris_repository::RepositoryData;

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
    id: &'a str,
    code: &'a str,
}

pub fn validate(data: &RepositoryData) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    let entries: Vec<Entry<'_>> = data
        .locations
        .iter()
        .map(|x| Entry {
            kind: "location",
            id: &x.id,
            code: &x.code,
        })
        .chain(data.racks.iter().map(|x| Entry {
            kind: "rack",
            id: &x.id,
            code: &x.code,
        }))
        .chain(data.device_models.iter().map(|x| Entry {
            kind: "device_model",
            id: &x.id,
            code: &x.code,
        }))
        .chain(data.devices.iter().map(|x| Entry {
            kind: "device",
            id: &x.id,
            code: &x.code,
        }))
        .chain(data.placement_files.iter().flat_map(|pf| {
            pf.front.iter().chain(pf.rear.iter()).map(|p| Entry {
                kind: "placement",
                id: &p.id,
                code: &p.code,
            })
        }))
        .collect();

    // UUID validity + code format
    for e in &entries {
        if !uuid_re().is_match(e.id) {
            issues.push(issue_for(
                "VAL-GEN-001",
                ValidationLevel::Error,
                &format!("{} id '{}' is not a valid UUID", e.kind, e.id),
                e.kind,
                e.id,
                e.code,
            ));
        }
        if !code_re().is_match(e.code) {
            issues.push(issue_for(
                "VAL-GEN-003",
                ValidationLevel::Error,
                &format!(
                    "{} code '{}' does not match ^[a-z0-9][a-z0-9._-]*$",
                    e.kind, e.code
                ),
                e.kind,
                e.id,
                e.code,
            ));
        }
    }

    // Globally unique IDs
    let mut id_seen: HashMap<&str, &str> = HashMap::new();
    for e in &entries {
        if let Some(prev_kind) = id_seen.insert(e.id, e.kind) {
            issues.push(issue_for(
                "VAL-GEN-002",
                ValidationLevel::Error,
                &format!(
                    "duplicate id '{}' found in {} and {}",
                    e.id, prev_kind, e.kind
                ),
                e.kind,
                e.id,
                e.code,
            ));
        }
    }

    // Unique codes within each type
    let type_groups: &[(&str, Vec<(&str, &str)>)] = &[
        (
            "location",
            data.locations
                .iter()
                .map(|x| (x.id.as_str(), x.code.as_str()))
                .collect(),
        ),
        (
            "rack",
            data.racks
                .iter()
                .map(|x| (x.id.as_str(), x.code.as_str()))
                .collect(),
        ),
        (
            "device_model",
            data.device_models
                .iter()
                .map(|x| (x.id.as_str(), x.code.as_str()))
                .collect(),
        ),
        (
            "device",
            data.devices
                .iter()
                .map(|x| (x.id.as_str(), x.code.as_str()))
                .collect(),
        ),
    ];
    for (kind, items) in type_groups {
        let mut code_seen: HashMap<&str, &str> = HashMap::new();
        for (id, code) in items {
            if let Some(prev_id) = code_seen.insert(code, id) {
                issues.push(issue_for(
                    "VAL-GEN-004",
                    ValidationLevel::Error,
                    &format!("duplicate {kind} code '{code}' (ids: {prev_id}, {id})"),
                    kind,
                    id,
                    code,
                ));
            }
        }
    }

    issues
}
