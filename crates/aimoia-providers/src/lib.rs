use serde_json::{json, Value};

pub const KRILL_ASYNC: &str = "krill_async";
pub const OPENAI_AUTO: &str = "openai_auto";

pub fn normalize_base_url(raw: &str) -> Result<String, String> {
    let mut value = raw.trim().trim_matches('`').trim_end_matches('/').to_string();
    for suffix in ["/images/generations", "/images/edits", "/models"] {
        if value.to_ascii_lowercase().ends_with(suffix) {
            value.truncate(value.len() - suffix.len());
            value = value.trim_end_matches('/').to_string();
            break;
        }
    }
    if !value.starts_with("http://") && !value.starts_with("https://") {
        return Err("API 地址必须以 http:// 或 https:// 开头".into());
    }
    let rest = value.split_once("://").map(|(_, rest)| rest).unwrap_or("");
    if !rest.contains('/') {
        value.push_str("/v1");
    }
    Ok(value)
}

pub fn normalize_image_protocol(raw: &str) -> &'static str {
    match raw {
        OPENAI_AUTO => OPENAI_AUTO,
        _ => KRILL_ASYNC,
    }
}

fn image_rank(value: &str) -> u8 {
    let normalized = value.to_ascii_lowercase();
    if [
        "image",
        "dall-e",
        "flux",
        "seedream",
        "ideogram",
        "banana",
        "recraft",
        "imagen",
        "stable-diffusion",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword))
    {
        0
    }
    else {
        1
    }
}

pub fn model_ids(value: &Value) -> Vec<String> {
    let entries = value
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| value.get("models").and_then(Value::as_array).cloned())
        .or_else(|| value.as_array().cloned())
        .unwrap_or_default();
    let mut out: Vec<String> = entries
        .iter()
        .filter_map(|entry| {
            entry
                .as_str()
                .map(str::to_string)
                .or_else(|| entry.get("id").and_then(Value::as_str).map(str::to_string))
                .or_else(|| entry.get("name").and_then(Value::as_str).map(str::to_string))
        })
        .filter(|id| !id.trim().is_empty())
        .collect();
    out.sort_by(|a, b| {
        image_rank(a)
            .cmp(&image_rank(b))
            .then_with(|| a.to_ascii_lowercase().cmp(&b.to_ascii_lowercase()))
    });
    out.dedup();
    out
}

pub fn image_json_payload(
    model: &str,
    protocol: &str,
    prompt: &str,
    size: &str,
    quality: &str,
) -> Value {
    let mut value = json!({
        "model": model,
        "prompt": prompt,
        "size": size,
        "quality": quality
    });
    if normalize_image_protocol(protocol) == KRILL_ASYNC {
        value["response_format"] = json!("b64_json");
        value["async"] = json!(true);
    }
    value
}

pub fn extract_output_text(value: &Value) -> Option<String> {
    if let Some(text) = value.get("output_text").and_then(Value::as_str) {
        return Some(text.into());
    }
    value.get("output")?.as_array()?.iter().flat_map(|output| {
        output
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
    })
    .find_map(|content| {
        content
            .get("text")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_api_base_urls() {
        assert_eq!(
            normalize_base_url(" `https://api.example.com/v1/` ").unwrap(),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_base_url("https://api.example.com").unwrap(),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_base_url("https://api.example.com/images/generations").unwrap(),
            "https://api.example.com/v1"
        );
        assert!(normalize_base_url("api.example.com").is_err());
    }

    #[test]
    fn parses_and_prioritizes_model_lists() {
        let value = json!({
            "data": [
                {"id": "text-model"},
                {"id": "image-b"},
                "image-a",
                {"name": "flux-pro"},
                {"id": "  "},
                "image-a"
            ]
        });

        assert_eq!(
            model_ids(&value),
            vec!["flux-pro", "image-a", "image-b", "text-model"]
        );
        assert_eq!(
            model_ids(&json!({"models": ["one", "two"]})),
            vec!["one", "two"]
        );
        assert_eq!(model_ids(&json!(["three"])), vec!["three"]);
        assert!(model_ids(&json!({"data": []})).is_empty());
    }

    #[test]
    fn builds_protocol_specific_image_payloads() {
        let async_payload =
            image_json_payload("image-model", KRILL_ASYNC, "draw", "2048x1152", "high");
        assert_eq!(async_payload["response_format"], "b64_json");
        assert_eq!(async_payload["async"], true);

        let compatible_payload =
            image_json_payload("image-model", OPENAI_AUTO, "draw", "2048x1152", "high");
        assert!(compatible_payload.get("response_format").is_none());
        assert!(compatible_payload.get("async").is_none());
    }

    #[test]
    fn extracts_supported_text_response_shapes() {
        assert_eq!(
            extract_output_text(&json!({"output_text":"direct"})).as_deref(),
            Some("direct")
        );
        assert_eq!(
            extract_output_text(&json!({
                "output": [{"content": [{"text":"nested"}]}]
            }))
            .as_deref(),
            Some("nested")
        );
        assert!(extract_output_text(&json!({"output":[]})).is_none());
    }
}
