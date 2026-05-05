use serde::Deserialize;

#[derive(Deserialize)]
pub struct YamlPlacementsFile {
    pub rack_id: String,
    pub placements: YamlPlacementSides,
}

#[derive(Deserialize, Default)]
pub struct YamlPlacementSides {
    #[serde(default)]
    pub front: Vec<YamlPlacement>,
    #[serde(default)]
    pub rear: Vec<YamlPlacement>,
}

#[derive(Deserialize)]
pub struct YamlPlacement {
    pub id: String,
    pub code: String,
    pub target_kind: String,
    pub target_id: String,
    pub start_u: u32,
    pub height_u: Option<u32>,
    pub note: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}
