#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Location {
    pub id: String,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub address: Option<String>,
    pub tags: Vec<String>,
}
