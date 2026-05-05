#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceType {
    Server,
    Network,
    Storage,
    Ups,
    Appliance,
    RackObject,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceModel {
    pub id: String,
    pub code: String,
    pub device_type: DeviceType,
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub default_height_u: Option<u32>,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

impl DeviceModel {
    pub fn is_rack_object(&self) -> bool {
        self.device_type == DeviceType::RackObject
    }
}

impl std::str::FromStr for DeviceType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "server" => Ok(Self::Server),
            "network" => Ok(Self::Network),
            "storage" => Ok(Self::Storage),
            "ups" => Ok(Self::Ups),
            "appliance" => Ok(Self::Appliance),
            "rack_object" => Ok(Self::RackObject),
            "other" => Ok(Self::Other),
            _ => Err(format!("unknown device type: {s}")),
        }
    }
}

impl DeviceType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Server => "server",
            Self::Network => "network",
            Self::Storage => "storage",
            Self::Ups => "ups",
            Self::Appliance => "appliance",
            Self::RackObject => "rack_object",
            Self::Other => "other",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_model(device_type: DeviceType) -> DeviceModel {
        DeviceModel {
            id: "x".to_string(),
            code: "x".to_string(),
            device_type,
            name: None,
            vendor: None,
            model: None,
            default_height_u: None,
            description: None,
            tags: vec![],
        }
    }

    #[test]
    fn is_rack_object_true_for_rack_object_type() {
        let m = make_model(DeviceType::RackObject);
        assert!(m.is_rack_object());
    }

    #[test]
    fn is_rack_object_false_for_other_types() {
        let non_rack_types = [
            DeviceType::Server,
            DeviceType::Network,
            DeviceType::Storage,
            DeviceType::Ups,
            DeviceType::Appliance,
            DeviceType::Other,
        ];
        for dt in &non_rack_types {
            let m = make_model(dt.clone());
            assert!(!m.is_rack_object(), "Expected false for {:?}", dt);
        }
    }

    #[test]
    fn all_device_type_variants_exist() {
        let variants = [
            DeviceType::Server,
            DeviceType::Network,
            DeviceType::Storage,
            DeviceType::Ups,
            DeviceType::Appliance,
            DeviceType::RackObject,
            DeviceType::Other,
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
