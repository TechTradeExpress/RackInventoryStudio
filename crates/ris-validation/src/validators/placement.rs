use ris_core::{PlacementTargetKind, ValidationIssue, ValidationLevel};
use ris_repository::{RepositoryData, RepositoryIndex};

use crate::helpers::issue_for;

pub fn validate(data: &RepositoryData, index: &RepositoryIndex) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    for pf in &data.placement_files {
        // VAL-PLC-001: rack_id must exist
        let rack = match index.racks_by_id.get(&pf.rack_id) {
            Some(r) => r,
            None => {
                issues.push(issue_for(
                    "VAL-PLC-002",
                    ValidationLevel::Error,
                    &format!("placement file references unknown rack_id '{}'", pf.rack_id),
                    "placement_file",
                    &pf.rack_id,
                    "",
                ));
                continue;
            }
        };

        let sides = [("front", &pf.front), ("rear", &pf.rear)];
        for (side_name, placements) in &sides {
            let mut ranges: Vec<(ris_core::PlacementRange, &str, &str)> = Vec::new();

            for p in placements.iter() {
                // VAL-PLC-007: target_id must exist
                match p.target_kind {
                    PlacementTargetKind::Device => {
                        if !index.devices_by_id.contains_key(&p.target_id) {
                            issues.push(issue_for(
                                "VAL-PLC-007",
                                ValidationLevel::Error,
                                &format!(
                                    "placement '{}' references unknown device '{}'",
                                    p.code, p.target_id
                                ),
                                "placement",
                                &p.id,
                                &p.code,
                            ));
                        }
                    }
                    PlacementTargetKind::DeviceModel => {
                        if !index.device_models_by_id.contains_key(&p.target_id) {
                            issues.push(issue_for(
                                "VAL-PLC-007",
                                ValidationLevel::Error,
                                &format!(
                                    "placement '{}' references unknown device_model '{}'",
                                    p.code, p.target_id
                                ),
                                "placement",
                                &p.id,
                                &p.code,
                            ));
                        }
                    }
                }

                // Resolve effective height
                let model = if p.target_kind == PlacementTargetKind::DeviceModel {
                    index.device_models_by_id.get(&p.target_id)
                } else {
                    // device → find its model
                    index
                        .devices_by_id
                        .get(&p.target_id)
                        .and_then(|d| d.device_model_id.as_ref())
                        .and_then(|mid| index.device_models_by_id.get(mid))
                };

                let effective_h = p.effective_height_u(model);

                let h = match effective_h {
                    Some(h) => h,
                    None => {
                        issues.push(issue_for(
                            "VAL-PLC-011",
                            ValidationLevel::Error,
                            &format!(
                                "placement '{}': cannot determine effective height (no height_u and no model default)",
                                p.code
                            ),
                            "placement",
                            &p.id,
                            &p.code,
                        ));
                        continue;
                    }
                };

                let range = match ris_core::PlacementRange::try_new(p.start_u, h) {
                    Some(r) => r,
                    None => {
                        issues.push(issue_for(
                            "VAL-PLC-009",
                            ValidationLevel::Error,
                            &format!(
                                "placement '{}': start_u={} or height_u={h} is invalid (must be >= 1)",
                                p.code, p.start_u
                            ),
                            "placement",
                            &p.id,
                            &p.code,
                        ));
                        continue;
                    }
                };

                // VAL-PLC-012: must fit within rack
                if range.end_u > rack.height_u {
                    issues.push(issue_for(
                        "VAL-PLC-012",
                        ValidationLevel::Error,
                        &format!(
                            "placement '{}' ({side_name}) occupies U{}-U{} but rack '{}' is only {}U",
                            p.code, range.start_u, range.end_u, rack.code, rack.height_u
                        ),
                        "placement",
                        &p.id,
                        &p.code,
                    ));
                }

                // VAL-PLC-013: collision on same side
                for (other_range, other_id, other_code) in &ranges {
                    if range.overlaps(other_range) {
                        issues.push(issue_for(
                            "VAL-PLC-013",
                            ValidationLevel::Error,
                            &format!(
                                "placement '{}' collides with '{}' on {side_name} side of rack '{}'",
                                p.code, other_code, rack.code
                            ),
                            "placement",
                            &p.id,
                            &p.code,
                        ));
                        issues.push(issue_for(
                            "VAL-PLC-013",
                            ValidationLevel::Error,
                            &format!(
                                "placement '{other_code}' collides with '{}' on {side_name} side of rack '{}'",
                                p.code, rack.code
                            ),
                            "placement",
                            other_id,
                            other_code,
                        ));
                    }
                }

                ranges.push((range, &p.id, &p.code));
            }
        }
    }

    issues
}
