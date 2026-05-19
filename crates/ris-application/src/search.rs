use crate::session::RepositorySession;

const MAX_RESULTS: usize = 50;
const MIN_QUERY_LEN: usize = 2;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchResultKind {
    Location,
    Rack,
    Device,
    DeviceModel,
    Placement,
}

/// Enough information for the frontend to navigate to the matched entity.
#[derive(Debug, Clone)]
pub struct SearchNavigation {
    pub location_id: Option<String>,
    pub rack_id: Option<String>,
    pub device_id: Option<String>,
    pub device_model_id: Option<String>,
    pub placement_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub kind: SearchResultKind,
    pub id: String,
    pub code: String,
    pub label: String,
    pub detail: Option<String>,
    pub score: u8,
    pub navigation: SearchNavigation,
}

// score: lower = better
// 0  exact code match
// 1  code starts-with
// 2  code contains
// 3  name/label exact
// 4  name/label starts-with
// 5  name/label contains
// 6  other field contains
fn score_field(haystack: &str, needle: &str, base_score: u8) -> Option<u8> {
    let h = haystack.to_lowercase();
    let n = needle.to_lowercase();
    if h == n {
        Some(base_score)
    } else if h.starts_with(&n) {
        Some(base_score + 1)
    } else if h.contains(&n) {
        Some(base_score + 2)
    } else {
        None
    }
}

fn best(a: Option<u8>, b: Option<u8>) -> Option<u8> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.min(y)),
        (Some(x), None) => Some(x),
        (None, Some(y)) => Some(y),
        (None, None) => None,
    }
}

impl RepositorySession {
    pub fn search(&self, query: &str) -> Vec<SearchResult> {
        let q = query.trim();
        if q.len() < MIN_QUERY_LEN {
            return vec![];
        }
        let needle = &q.to_lowercase();

        let mut results: Vec<SearchResult> = Vec::new();

        // Locations
        for loc in self.data.locations.iter() {
            let mut sc = score_field(&loc.code, needle, 0);
            sc = best(sc, score_field(&loc.name, needle, 3));
            if let Some(d) = &loc.description {
                sc = best(sc, score_field(d, needle, 6));
            }
            if let Some(a) = &loc.address {
                sc = best(sc, score_field(a, needle, 6));
            }
            for t in &loc.tags {
                sc = best(sc, score_field(t, needle, 6));
            }
            if let Some(score) = sc {
                results.push(SearchResult {
                    kind: SearchResultKind::Location,
                    id: loc.id.clone(),
                    code: loc.code.clone(),
                    label: loc.name.clone(),
                    detail: loc.address.clone(),
                    score,
                    navigation: SearchNavigation {
                        location_id: Some(loc.id.clone()),
                        rack_id: None,
                        device_id: None,
                        device_model_id: None,
                        placement_id: None,
                    },
                });
            }
        }

        // Racks
        for rack in self.data.racks.iter() {
            let mut sc = score_field(&rack.code, needle, 0);
            sc = best(sc, score_field(&rack.name, needle, 3));
            if let Some(d) = &rack.description {
                sc = best(sc, score_field(d, needle, 6));
            }
            if let Some(r) = &rack.row {
                sc = best(sc, score_field(r, needle, 6));
            }
            for t in &rack.tags {
                sc = best(sc, score_field(t, needle, 6));
            }
            if let Some(score) = sc {
                let loc_code = self
                    .index
                    .get_location_by_id(&rack.location_id)
                    .map(|l| l.code.as_str())
                    .unwrap_or("");
                results.push(SearchResult {
                    kind: SearchResultKind::Rack,
                    id: rack.id.clone(),
                    code: rack.code.clone(),
                    label: rack.name.clone(),
                    detail: Some(format!("{}U @ {}", rack.height_u, loc_code)),
                    score,
                    navigation: SearchNavigation {
                        location_id: Some(rack.location_id.clone()),
                        rack_id: Some(rack.id.clone()),
                        device_id: None,
                        device_model_id: None,
                        placement_id: None,
                    },
                });
            }
        }

        // Devices
        for device in self.data.devices.iter() {
            let mut sc = score_field(&device.code, needle, 0);
            if let Some(n) = &device.name {
                sc = best(sc, score_field(n, needle, 3));
            }
            if let Some(sn) = &device.serial_number {
                sc = best(sc, score_field(sn, needle, 6));
            }
            if let Some(at) = &device.asset_tag {
                sc = best(sc, score_field(at, needle, 6));
            }
            if let Some(er) = &device.external_ref {
                sc = best(sc, score_field(er, needle, 6));
            }
            if let Some(d) = &device.description {
                sc = best(sc, score_field(d, needle, 6));
            }
            let type_str = format!("{:?}", device.device_type).to_lowercase();
            sc = best(sc, score_field(&type_str, needle, 6));
            for t in &device.tags {
                sc = best(sc, score_field(t, needle, 6));
            }
            if let Some(score) = sc {
                results.push(SearchResult {
                    kind: SearchResultKind::Device,
                    id: device.id.clone(),
                    code: device.code.clone(),
                    label: device.name.clone().unwrap_or_else(|| device.code.clone()),
                    detail: device.serial_number.clone(),
                    score,
                    navigation: SearchNavigation {
                        location_id: None,
                        rack_id: None,
                        device_id: Some(device.id.clone()),
                        device_model_id: None,
                        placement_id: None,
                    },
                });
            }
        }

        // Device models
        for dm in self.data.device_models.iter() {
            let mut sc = score_field(&dm.code, needle, 0);
            sc = best(sc, score_field(&dm.name, needle, 3));
            if let Some(v) = &dm.vendor {
                sc = best(sc, score_field(v, needle, 6));
            }
            if let Some(m) = &dm.model {
                sc = best(sc, score_field(m, needle, 6));
            }
            if let Some(d) = &dm.description {
                sc = best(sc, score_field(d, needle, 6));
            }
            let type_str = format!("{:?}", dm.device_type).to_lowercase();
            sc = best(sc, score_field(&type_str, needle, 6));
            for t in &dm.tags {
                sc = best(sc, score_field(t, needle, 6));
            }
            if let Some(score) = sc {
                results.push(SearchResult {
                    kind: SearchResultKind::DeviceModel,
                    id: dm.id.clone(),
                    code: dm.code.clone(),
                    label: dm.name.clone(),
                    detail: dm.vendor.clone(),
                    score,
                    navigation: SearchNavigation {
                        location_id: None,
                        rack_id: None,
                        device_id: None,
                        device_model_id: Some(dm.id.clone()),
                        placement_id: None,
                    },
                });
            }
        }

        // Placements (search code, note, tags)
        for indexed in self.index.placements_by_id.values() {
            let p = &indexed.placement;
            let mut sc = score_field(&p.code, needle, 0);
            if let Some(note) = &p.note {
                sc = best(sc, score_field(note, needle, 6));
            }
            for t in &p.tags {
                sc = best(sc, score_field(t, needle, 6));
            }
            if let Some(score) = sc {
                results.push(SearchResult {
                    kind: SearchResultKind::Placement,
                    id: p.id.clone(),
                    code: p.code.clone(),
                    label: p.code.clone(),
                    detail: Some(format!("U{}", p.start_u)),
                    score,
                    navigation: SearchNavigation {
                        location_id: None,
                        rack_id: Some(indexed.rack_id.clone()),
                        device_id: None,
                        device_model_id: None,
                        placement_id: Some(p.id.clone()),
                    },
                });
            }
        }

        results.sort_by(|a, b| a.score.cmp(&b.score).then(a.code.cmp(&b.code)));
        results.truncate(MAX_RESULTS);
        results
    }
}
