use serde::Deserialize;

#[derive(Deserialize)]
pub struct YamlRacksFile {
    pub location_id: String,
    pub racks: Vec<YamlRack>,
}

#[derive(Deserialize)]
pub struct YamlRack {
    pub id: String,
    pub code: String,
    pub name: Option<String>,
    pub height_u: u32,
    pub row: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}
