use crate::device_model::DeviceType;

impl std::str::FromStr for DeviceStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "planned" => Ok(Self::Planned),
            "in_stock" => Ok(Self::InStock),
            "installed" => Ok(Self::Installed),
            "to_remove" => Ok(Self::ToRemove),
            "removed" => Ok(Self::Removed),
            "disposed" => Ok(Self::Disposed),
            "unknown" => Ok(Self::Unknown),
            _ => Err(format!("unknown device status: {s}")),
        }
    }
}

impl DeviceStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Planned => "planned",
            Self::InStock => "in_stock",
            Self::Installed => "installed",
            Self::ToRemove => "to_remove",
            Self::Removed => "removed",
            Self::Disposed => "disposed",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceStatus {
    Planned,
    InStock,
    Installed,
    ToRemove,
    Removed,
    Disposed,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Device {
    pub id: String,
    pub code: String,
    pub device_type: DeviceType,
    pub name: Option<String>,
    pub device_model_id: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub external_ref: Option<String>,
    pub status: DeviceStatus,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_device_status_variants_exist() {
        let variants = [
            DeviceStatus::Planned,
            DeviceStatus::InStock,
            DeviceStatus::Installed,
            DeviceStatus::ToRemove,
            DeviceStatus::Removed,
            DeviceStatus::Disposed,
            DeviceStatus::Unknown,
        ];
        assert_eq!(variants.len(), 7);
        for (i, a) in variants.iter().enumerate() {
            for (j, b) in variants.iter().enumerate() {
                if i != j {
                    assert_ne!(a, b);
                }
            }
        }
    }
}
