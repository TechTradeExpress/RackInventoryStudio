//! YAML repository loader and RepositoryIndex for Rack Inventory Studio.

mod yaml;

pub mod data;
pub mod error;
pub mod index;
pub mod loader;
pub mod raw;
pub mod raw_loader;

pub use data::RepositoryData;
pub use error::LoadError;
pub use index::{IndexedPlacement, RepositoryIndex};
pub use loader::load;
pub use raw::{
    RawDevice, RawDeviceFile, RawDeviceModel, RawDeviceModelFile, RawLocation, RawLocationsFile,
    RawPlacement, RawPlacementFile, RawRack, RawRackFile, RawRepoFile, RawRepositoryData,
};
pub use raw_loader::load_raw;
