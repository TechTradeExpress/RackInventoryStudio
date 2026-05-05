use serde::Deserialize;

#[derive(Deserialize)]
pub struct YamlDeviceModelsFile {
    pub device_type: String,
    #[serde(default)]
    pub models: Vec<YamlDeviceModel>,
}

#[derive(Deserialize)]
pub struct YamlDeviceModel {
    pub id: String,
    pub code: String,
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub default_height_u: Option<u32>,
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}
