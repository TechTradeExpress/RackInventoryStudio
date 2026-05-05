use serde::Deserialize;

#[derive(Deserialize)]
pub struct YamlDevicesFile {
    pub device_type: String,
    #[serde(default)]
    pub devices: Vec<YamlDevice>,
}

#[derive(Deserialize)]
pub struct YamlDevice {
    pub id: String,
    pub code: String,
    pub name: Option<String>,
    pub device_model_id: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub external_ref: Option<String>,
    pub status: String,
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}
