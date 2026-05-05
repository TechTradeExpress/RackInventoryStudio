use serde::Deserialize;

#[derive(Deserialize)]
pub struct YamlLocationsFile {
    pub locations: Vec<YamlLocation>,
}

#[derive(Deserialize)]
pub struct YamlLocation {
    pub id: String,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub address: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}
