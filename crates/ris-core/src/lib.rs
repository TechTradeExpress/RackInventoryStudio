//! Domain models and domain logic for Rack Inventory Studio.
//!
//! Pure domain layer — no dependencies on YAML, Git, Tauri, filesystem, serde, or CSV parsing.

pub mod device;
pub mod device_model;
pub mod location;
pub mod placement;
pub mod rack;
pub mod repository;
pub mod validation;

pub use device::{Device, DeviceStatus};
pub use device_model::{DeviceModel, DeviceType};
pub use location::Location;
pub use placement::{Placement, PlacementFile, PlacementRange, PlacementSide, PlacementTargetKind};
pub use rack::Rack;
pub use repository::RepositoryMetadata;
pub use validation::{ValidationIssue, ValidationLevel};
