use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::error::ApplicationError;
use crate::session::{open_repository, RepositorySession};

// ── Input ─────────────────────────────────────────────────────────────────────

pub struct CreateRepositoryInput {
    pub path: PathBuf,
    pub code: String,
    pub name: String,
    /// Override the generated UUID for deterministic testing.
    pub id: Option<String>,
}

// ── File templates ────────────────────────────────────────────────────────────

// (filename inside device-models/, device_type value)
const DEVICE_MODEL_FILES: &[(&str, &str)] = &[
    ("servers.yaml", "server"),
    ("network.yaml", "network"),
    ("storage.yaml", "storage"),
    ("ups.yaml", "ups"),
    ("appliances.yaml", "appliance"),
    ("other.yaml", "other"),
    ("rack-objects.yaml", "rack_object"),
];

// (filename inside devices/, device_type value)
// rack_object is not a valid device type, so rack-objects.yaml is omitted here.
const DEVICE_FILES: &[(&str, &str)] = &[
    ("servers.yaml", "server"),
    ("network.yaml", "network"),
    ("storage.yaml", "storage"),
    ("ups.yaml", "ups"),
    ("appliances.yaml", "appliance"),
    ("other.yaml", "other"),
];

// ── Validation ────────────────────────────────────────────────────────────────

/// Validates a repository code against the same rule as VAL-GEN-005:
/// `^[a-z0-9][a-z0-9._-]*$`
fn code_is_valid(code: &str) -> bool {
    if code.is_empty() {
        return false;
    }
    let mut chars = code.chars();
    let first = chars.next().unwrap();
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return false;
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_' || c == '-')
}

// ── File I/O helpers ──────────────────────────────────────────────────────────

fn write_text(path: &Path, content: &str) -> Result<(), ApplicationError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            ApplicationError::InvalidInput(format!(
                "Cannot create directory '{}': {e}",
                parent.display()
            ))
        })?;
    }
    std::fs::write(path, content).map_err(|e| {
        ApplicationError::InvalidInput(format!("Cannot write '{}': {e}", path.display()))
    })
}

fn create_dir(path: &Path) -> Result<(), ApplicationError> {
    std::fs::create_dir_all(path).map_err(|e| {
        ApplicationError::InvalidInput(format!("Cannot create directory '{}': {e}", path.display()))
    })
}

// ── Public use case ───────────────────────────────────────────────────────────

/// Create a new Rack Inventory Studio repository at `input.path`.
///
/// The target directory is created if it does not exist. Fails if the
/// directory already contains an `inventory` subfolder to prevent overwriting
/// an existing repository.
///
/// After writing the scaffold files the function loads the new repository
/// with the standard loader and returns a ready-to-use `RepositorySession`.
pub fn create_repository(
    input: CreateRepositoryInput,
) -> Result<RepositorySession, ApplicationError> {
    let code = input.code.trim().to_string();
    let name = input.name.trim().to_string();

    if code.is_empty() {
        return Err(ApplicationError::InvalidInput(
            "Repository code cannot be blank".into(),
        ));
    }
    if !code_is_valid(&code) {
        return Err(ApplicationError::InvalidInput(format!(
            "Repository code '{code}' is invalid — \
             must match ^[a-z0-9][a-z0-9._-]*$ (e.g. my-repo)"
        )));
    }
    if name.is_empty() {
        return Err(ApplicationError::InvalidInput(
            "Repository name cannot be blank".into(),
        ));
    }

    let inventory_dir = input.path.join("inventory");
    if inventory_dir.exists() {
        return Err(ApplicationError::InvalidInput(format!(
            "Directory '{}' already contains an 'inventory' folder — \
             will not overwrite an existing repository",
            input.path.display()
        )));
    }

    if !input.path.exists() {
        std::fs::create_dir_all(&input.path).map_err(|e| {
            ApplicationError::InvalidInput(format!(
                "Cannot create directory '{}': {e}",
                input.path.display()
            ))
        })?;
    }

    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());

    // repo.yaml
    write_text(
        &inventory_dir.join("repo.yaml"),
        &format!(
            "format: rack-inventory-studio\nversion: \"0.1\"\n\n\
             repository:\n  id: {id}\n  code: {code}\n  name: {name}\n"
        ),
    )?;

    // locations.yaml
    write_text(&inventory_dir.join("locations.yaml"), "locations: []\n")?;

    // Empty racks/ and placements/ directories
    create_dir(&inventory_dir.join("racks"))?;
    create_dir(&inventory_dir.join("placements"))?;

    // Device model files
    for (file, dtype) in DEVICE_MODEL_FILES {
        write_text(
            &inventory_dir.join("device-models").join(file),
            &format!("device_type: {dtype}\n\nmodels: []\n"),
        )?;
    }

    // Device files
    for (file, dtype) in DEVICE_FILES {
        write_text(
            &inventory_dir.join("devices").join(file),
            &format!("device_type: {dtype}\n\ndevices: []\n"),
        )?;
    }

    // Load and return a ready-to-use session (also verifies the scaffold is valid)
    open_repository(&input.path)
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::code_is_valid;

    #[test]
    fn valid_codes() {
        assert!(code_is_valid("my-repo"));
        assert!(code_is_valid("abc"));
        assert!(code_is_valid("a1"));
        assert!(code_is_valid("rack.studio_v2"));
        assert!(code_is_valid("1abc"));
    }

    #[test]
    fn invalid_codes() {
        assert!(!code_is_valid(""));
        assert!(!code_is_valid("My-Repo"));
        assert!(!code_is_valid("-starts-with-dash"));
        assert!(!code_is_valid("has space"));
        assert!(!code_is_valid("has/slash"));
    }
}
