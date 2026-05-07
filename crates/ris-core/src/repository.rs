#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositoryMetadata {
    pub id: String,
    pub code: String,
    pub name: String,
    pub format: String,
    pub version: String,
}
