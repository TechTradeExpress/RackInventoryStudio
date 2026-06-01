#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("IO error reading '{path}': {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error("YAML parse error in '{path}': {source}")]
    Yaml {
        path: String,
        #[source]
        source: serde_yml::Error,
    },

    #[error("Invalid value '{value}' in '{path}': {message}")]
    InvalidValue {
        path: String,
        value: String,
        message: String,
    },

    #[error("Required field '{field}' missing in '{path}'")]
    MissingField {
        path: String,
        field: &'static str,
        /// Validation code to emit (e.g. "VAL-RACK-004").
        code: &'static str,
    },
}
