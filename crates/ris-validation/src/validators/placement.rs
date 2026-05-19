use std::collections::{HashMap, HashSet};

use ris_core::{PlacementRange, ValidationIssue, ValidationLevel};
use ris_repository::RawRepositoryData;

use crate::helpers::{issue_f, issue_for_placement_f};

pub fn validate(raw: &RawRepositoryData) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    // rack_id → height_u (only racks with a valid height_u)
    let rack_heights: HashMap<&str, u32> = raw
        .rack_files
        .iter()
        .flat_map(|rf| {
            rf.racks
                .iter()
                .filter_map(|r| r.id.as_deref().zip(r.height_u))
        })
        .collect();

    // model_id → default_height_u
    let model_heights: HashMap<&str, u32> = raw
        .device_model_files
        .iter()
        .flat_map(|mf| {
            mf.models
                .iter()
                .filter_map(|m| m.id.as_deref().zip(m.default_height_u))
        })
        .collect();

    // all valid model ids
    let all_model_ids: HashSet<&str> = raw
        .device_model_files
        .iter()
        .flat_map(|mf| mf.models.iter().filter_map(|m| m.id.as_deref()))
        .collect();

    // rack_object model ids
    let rack_object_model_ids: HashSet<&str> = raw
        .device_model_files
        .iter()
        .filter(|mf| mf.device_type.as_deref() == Some("rack_object"))
        .flat_map(|mf| mf.models.iter().filter_map(|m| m.id.as_deref()))
        .collect();

    // all valid device ids
    let all_device_ids: HashSet<&str> = raw
        .device_files
        .iter()
        .flat_map(|df| df.devices.iter().filter_map(|d| d.id.as_deref()))
        .collect();

    // device_id → model's default_height_u
    let device_model_height: HashMap<&str, u32> = raw
        .device_files
        .iter()
        .flat_map(|df| {
            df.devices.iter().filter_map(|d| {
                let did = d.id.as_deref()?;
                let mid = d.device_model_id.as_deref()?;
                let h = model_heights.get(mid).copied()?;
                Some((did, h))
            })
        })
        .collect();

    // device_ids that are placed more than once (for VAL-PLC-014)
    let mut device_occurrence: HashMap<&str, u32> = HashMap::new();
    for pf in &raw.placement_files {
        for p in pf.front.iter().chain(pf.rear.iter()) {
            if p.target_kind.as_deref() == Some("device") {
                if let Some(tid) = p.target_id.as_deref() {
                    *device_occurrence.entry(tid).or_insert(0) += 1;
                }
            }
        }
    }
    let multi_placed_device_ids: HashSet<&str> = device_occurrence
        .into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(id, _)| id)
        .collect();

    for pf in &raw.placement_files {
        // VAL-PLC-001: rack_id must be present
        if pf.rack_id.is_none() {
            issues.push(issue_f(
                "VAL-PLC-001",
                ValidationLevel::Error,
                &format!(
                    "placement file '{}' is missing required field 'rack_id'",
                    pf.file_path
                ),
                &pf.file_path,
            ));
        }

        // VAL-PLC-002: rack_id must reference existing rack
        let rack_height: Option<u32> = match &pf.rack_id {
            Some(rid) => match rack_heights.get(rid.as_str()) {
                Some(&h) => Some(h),
                None => {
                    issues.push(issue_f(
                        "VAL-PLC-002",
                        ValidationLevel::Error,
                        &format!(
                            "placement file '{}' references unknown rack_id '{}'",
                            pf.file_path, rid
                        ),
                        &pf.file_path,
                    ));
                    None
                }
            },
            None => None,
        };

        // VAL-PLC-003: placements root key must exist
        if !pf.placements_key_present {
            issues.push(issue_f(
                "VAL-PLC-003",
                ValidationLevel::Error,
                &format!(
                    "placement file '{}' is missing the root 'placements' key",
                    pf.file_path
                ),
                &pf.file_path,
            ));
            continue;
        }

        // VAL-PLC-004: at least one of front / rear must be present
        if !pf.front_key_present && !pf.rear_key_present {
            issues.push(issue_f(
                "VAL-PLC-004",
                ValidationLevel::Error,
                &format!(
                    "placement file '{}' has 'placements' key but neither 'front' nor 'rear' are present",
                    pf.file_path
                ),
                &pf.file_path,
            ));
            continue;
        }

        for (side_name, placements) in [("front", &pf.front), ("rear", &pf.rear)] {
            let mut ranges: Vec<(PlacementRange, String, String)> = Vec::new();

            for p in placements.iter() {
                let id = p.id.as_deref().unwrap_or("");
                let code = p.code.as_deref().unwrap_or("");

                // VAL-PLC-005: required fields (target_kind, target_id, start_u)
                let missing: Vec<&str> = [
                    p.target_kind.is_none().then_some("target_kind"),
                    p.target_id.is_none().then_some("target_id"),
                    (p.start_u.is_none() && !p.start_u_bad).then_some("start_u"),
                ]
                .into_iter()
                .flatten()
                .collect();
                if !missing.is_empty() {
                    issues.push(issue_for_placement_f(
                        "VAL-PLC-005",
                        ValidationLevel::Error,
                        &format!(
                            "placement is missing required field(s): {}",
                            missing.join(", ")
                        ),
                        id,
                        code,
                        &pf.file_path,
                        pf.rack_id.as_deref(),
                    ));
                }

                // VAL-PLC-006: target_kind must be valid enum
                let target_kind_valid = match p.target_kind.as_deref() {
                    Some("device") | Some("device_model") => true,
                    Some(tk) => {
                        issues.push(issue_for_placement_f(
                            "VAL-PLC-006",
                            ValidationLevel::Error,
                            &format!("placement '{}' has invalid target_kind '{}'", code, tk),
                            id,
                            code,
                            &pf.file_path,
                            pf.rack_id.as_deref(),
                        ));
                        false
                    }
                    None => false,
                };

                // VAL-PLC-007: target_id must reference existing entity
                let target_exists = if target_kind_valid {
                    match (p.target_kind.as_deref(), p.target_id.as_deref()) {
                        (Some("device"), Some(tid)) => {
                            if !all_device_ids.contains(tid) {
                                issues.push(issue_for_placement_f(
                                    "VAL-PLC-007",
                                    ValidationLevel::Error,
                                    &format!(
                                        "placement '{}' references unknown device '{}'",
                                        code, tid
                                    ),
                                    id,
                                    code,
                                    &pf.file_path,
                                    pf.rack_id.as_deref(),
                                ));
                                false
                            } else {
                                true
                            }
                        }
                        (Some("device_model"), Some(tid)) => {
                            if !all_model_ids.contains(tid) {
                                issues.push(issue_for_placement_f(
                                    "VAL-PLC-007",
                                    ValidationLevel::Error,
                                    &format!(
                                        "placement '{}' references unknown device_model '{}'",
                                        code, tid
                                    ),
                                    id,
                                    code,
                                    &pf.file_path,
                                    pf.rack_id.as_deref(),
                                ));
                                false
                            } else {
                                true
                            }
                        }
                        _ => false,
                    }
                } else {
                    false
                };

                // VAL-PLC-008: target_kind=device_model is only valid for rack_object models
                if p.target_kind.as_deref() == Some("device_model") {
                    if let Some(tid) = p.target_id.as_deref() {
                        if all_model_ids.contains(tid) && !rack_object_model_ids.contains(tid) {
                            issues.push(issue_for_placement_f(
                                "VAL-PLC-008",
                                ValidationLevel::Error,
                                &format!(
                                    "placement '{}' uses device_model target '{}' which is not a rack_object",
                                    code, tid
                                ),
                                id,
                        code,
                        &pf.file_path,
                        pf.rack_id.as_deref(),
                    ));
                        }
                    }
                }

                // VAL-PLC-009: start_u must be a positive integer
                if p.start_u_bad {
                    issues.push(issue_for_placement_f(
                        "VAL-PLC-009",
                        ValidationLevel::Error,
                        &format!(
                            "placement '{}' has invalid start_u; must be a positive integer",
                            code
                        ),
                        id,
                        code,
                        &pf.file_path,
                        pf.rack_id.as_deref(),
                    ));
                } else if p.start_u == Some(0) {
                    issues.push(issue_for_placement_f(
                        "VAL-PLC-009",
                        ValidationLevel::Error,
                        &format!("placement '{}' has start_u=0; must be >= 1", code),
                        id,
                        code,
                        &pf.file_path,
                        pf.rack_id.as_deref(),
                    ));
                }

                // VAL-PLC-010: height_u override must be a positive integer if provided
                if p.height_u_bad {
                    issues.push(issue_for_placement_f(
                        "VAL-PLC-010",
                        ValidationLevel::Error,
                        &format!(
                            "placement '{}' has invalid height_u; must be a positive integer",
                            code
                        ),
                        id,
                        code,
                        &pf.file_path,
                        pf.rack_id.as_deref(),
                    ));
                } else if p.height_u == Some(0) {
                    issues.push(issue_for_placement_f(
                        "VAL-PLC-010",
                        ValidationLevel::Error,
                        &format!(
                            "placement '{}' has height_u=0; must be >= 1 if provided",
                            code
                        ),
                        id,
                        code,
                        &pf.file_path,
                        pf.rack_id.as_deref(),
                    ));
                }

                // VAL-PLC-014: device placed multiple times
                if p.target_kind.as_deref() == Some("device") {
                    if let Some(tid) = p.target_id.as_deref() {
                        if multi_placed_device_ids.contains(tid) {
                            issues.push(issue_for_placement_f(
                                "VAL-PLC-014",
                                ValidationLevel::Error,
                                &format!("device '{}' is placed in multiple placements", tid),
                                id,
                                code,
                                &pf.file_path,
                                pf.rack_id.as_deref(),
                            ));
                        }
                    }
                }

                // VAL-PLC-015: height_u override differs from model's default_height_u (WARNING)
                if target_exists {
                    if let Some(hu) = p.height_u.filter(|&h| h > 0) {
                        let model_default = match p.target_kind.as_deref() {
                            Some("device") => p
                                .target_id
                                .as_deref()
                                .and_then(|tid| device_model_height.get(tid).copied()),
                            Some("device_model") => p
                                .target_id
                                .as_deref()
                                .and_then(|tid| model_heights.get(tid).copied()),
                            _ => None,
                        };
                        if let Some(default) = model_default {
                            if hu != default {
                                issues.push(issue_for_placement_f(
                                    "VAL-PLC-015",
                                    ValidationLevel::Warning,
                                    &format!(
                                        "placement '{}' height_u={} differs from model default {}",
                                        code, hu, default
                                    ),
                                    id,
                                    code,
                                    &pf.file_path,
                                    pf.rack_id.as_deref(),
                                ));
                            }
                        }
                    }
                }

                // For collision detection: need valid start_u > 0
                let start_u = match p.start_u {
                    Some(su) if su > 0 => su,
                    _ => continue,
                };

                if matches!(p.height_u, Some(0)) {
                    continue;
                }

                if !target_exists {
                    continue;
                }

                let effective_h = if let Some(hu) = p.height_u {
                    Some(hu)
                } else {
                    match p.target_kind.as_deref() {
                        Some("device") => p
                            .target_id
                            .as_deref()
                            .and_then(|tid| device_model_height.get(tid).copied()),
                        Some("device_model") => p
                            .target_id
                            .as_deref()
                            .and_then(|tid| model_heights.get(tid).copied()),
                        _ => None,
                    }
                };

                let h = match effective_h {
                    Some(h) => h,
                    None => {
                        // VAL-PLC-011: cannot determine effective height
                        issues.push(issue_for_placement_f(
                            "VAL-PLC-011",
                            ValidationLevel::Error,
                            &format!(
                                "placement '{}': cannot determine effective height (no height_u and no model default)",
                                code
                            ),
                            id,
                        code,
                        &pf.file_path,
                        pf.rack_id.as_deref(),
                    ));
                        continue;
                    }
                };

                let range = match PlacementRange::try_new(start_u, h) {
                    Some(r) => r,
                    None => continue,
                };

                // VAL-PLC-012: placement must fit within rack
                if let Some(rack_h) = rack_height {
                    if range.end_u > rack_h {
                        issues.push(issue_for_placement_f(
                            "VAL-PLC-012",
                            ValidationLevel::Error,
                            &format!(
                                "placement '{}' ({side_name}) occupies U{}-U{} but rack is only {}U",
                                code, range.start_u, range.end_u, rack_h
                            ),
                            id,
                        code,
                        &pf.file_path,
                        pf.rack_id.as_deref(),
                    ));
                    }
                }

                // VAL-PLC-013: collision on same side
                for (other_range, other_id, other_code) in &ranges {
                    if range.overlaps(other_range) {
                        issues.push(issue_for_placement_f(
                            "VAL-PLC-013",
                            ValidationLevel::Error,
                            &format!(
                                "placement '{}' collides with '{}' on {side_name} side",
                                code, other_code
                            ),
                            id,
                            code,
                            &pf.file_path,
                            pf.rack_id.as_deref(),
                        ));
                        issues.push(issue_for_placement_f(
                            "VAL-PLC-013",
                            ValidationLevel::Error,
                            &format!(
                                "placement '{other_code}' collides with '{}' on {side_name} side",
                                code
                            ),
                            other_id,
                            other_code,
                            &pf.file_path,
                            pf.rack_id.as_deref(),
                        ));
                    }
                }

                ranges.push((range, id.to_string(), code.to_string()));
            }
        }
    }

    issues
}
