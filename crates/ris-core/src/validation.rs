#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationLevel {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationIssue {
    pub code: String,
    pub level: ValidationLevel,
    pub message: String,
    pub object_type: Option<String>,
    pub object_id: Option<String>,
    pub object_code: Option<String>,
    pub file_path: Option<String>,
    pub details: Option<String>,
}
