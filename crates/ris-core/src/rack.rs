#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rack {
    pub id: String,
    pub code: String,
    pub name: String,
    pub location_id: String,
    pub height_u: u32,
    pub row: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
}
