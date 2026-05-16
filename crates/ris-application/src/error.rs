use ris_repository::{LoadError, WriteError};

#[derive(Debug, thiserror::Error)]
pub enum ApplicationError {
    #[error("load error: {0}")]
    Load(#[from] LoadError),
    #[error("write error: {0}")]
    Write(#[from] WriteError),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("duplicate id: {0}")]
    DuplicateId(String),
    #[error("duplicate code: {0}")]
    DuplicateCode(String),
    #[error("duplicate serial number: {0}")]
    DuplicateSerialNumber(String),
    #[error("duplicate asset tag: {0}")]
    DuplicateAssetTag(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
}
