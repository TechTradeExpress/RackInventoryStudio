use ris_core::{ValidationIssue, ValidationLevel};

pub fn issue(code: &str, level: ValidationLevel, message: &str) -> ValidationIssue {
    ValidationIssue {
        code: code.to_string(),
        level,
        message: message.to_string(),
        object_type: None,
        object_id: None,
        object_code: None,
        file_path: None,
        details: None,
    }
}

pub fn issue_for(
    code: &str,
    level: ValidationLevel,
    message: &str,
    object_type: &str,
    object_id: &str,
    object_code: &str,
) -> ValidationIssue {
    ValidationIssue {
        code: code.to_string(),
        level,
        message: message.to_string(),
        object_type: Some(object_type.to_string()),
        object_id: Some(object_id.to_string()),
        object_code: Some(object_code.to_string()),
        file_path: None,
        details: None,
    }
}
