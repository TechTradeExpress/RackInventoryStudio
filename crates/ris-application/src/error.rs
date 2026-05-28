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
    #[error("duplicate external reference: {0}")]
    DuplicateExternalRef(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("collision: {0}")]
    Collision(String),
    #[error("out of rack bounds: {0}")]
    OutOfRackBounds(String),
    #[error("effective height missing: {0}")]
    EffectiveHeightMissing(String),
    #[error("device already placed: {0}")]
    DeviceAlreadyPlaced(String),
    #[error("invalid target kind: {0}")]
    InvalidTargetKind(String),
}
