#![allow(dead_code)]

use serde::{Deserialize, Deserializer};

struct StringOrNum;

impl<'de> serde::de::Visitor<'de> for StringOrNum {
    type Value = String;

    fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "string or number")
    }

    fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<String, E> {
        Ok(v.to_owned())
    }

    fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<String, E> {
        Ok(format!("{v}"))
    }

    fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<String, E> {
        Ok(v.to_string())
    }

    fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<String, E> {
        Ok(v.to_string())
    }
}

fn deserialize_as_string<'de, D: Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    d.deserialize_any(StringOrNum)
}

#[derive(Deserialize)]
pub struct YamlRepoFile {
    pub format: String,
    #[serde(deserialize_with = "deserialize_as_string")]
    pub version: String,
    pub repository: YamlRepoMeta,
}

#[derive(Deserialize)]
pub struct YamlRepoMeta {
    pub id: String,
    pub code: String,
    pub name: String,
}
