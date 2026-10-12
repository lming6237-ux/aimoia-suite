use std::{fmt, path::{Path, PathBuf}};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProductId {
    Hub,
    ImageStudio,
    PptStudio,
    CanvasDesktop,
    CanvasWeb,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LegacyRuntimeIdentity {
    pub legacy_bundle_identifier: &'static str,
    pub target_bundle_identifier: &'static str,
    pub legacy_credential_services: &'static [&'static str],
    pub legacy_data_directory: &'static str,
    pub target_data_directory: &'static str,
    pub legacy_browser_storage_keys: &'static [&'static str],
}

impl ProductId {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Hub => "aimoia-hub",
            Self::ImageStudio => "aimoia-image-studio",
            Self::PptStudio => "aimoia-ppt-studio",
            Self::CanvasDesktop => "aimoia-canvas-desktop",
            Self::CanvasWeb => "aimoia-canvas-web",
        }
    }

    pub const fn legacy_runtime_identity(self) -> Option<LegacyRuntimeIdentity> {
        match self {
            Self::ImageStudio => Some(LegacyRuntimeIdentity {
                legacy_bundle_identifier: "com.edy.krillimagestudio",
                target_bundle_identifier: "com.aimoia.imagestudio",
                legacy_credential_services: &["krill-image-studio"],
                legacy_data_directory: "Krill Image Studio",
                target_data_directory: "AimoiA Image Studio",
                legacy_browser_storage_keys: &[
                    "krill-image-studio-settings-v1",
                    "krill-image-studio-history-v1",
                    "krill-image-studio",
                    "krill-image-studio-v5",
                ],
            }),
            Self::PptStudio => Some(LegacyRuntimeIdentity {
                legacy_bundle_identifier: "com.edy.krillpptstudio",
                target_bundle_identifier: "com.aimoia.pptstudio",
                legacy_credential_services: &["krill-canvas", "krill-ppt-studio"],
                legacy_data_directory: "Krill Canvas",
                target_data_directory: "AimoiA PPT Studio",
                legacy_browser_storage_keys: &["krill-ppt-studio-content-sessions-v1"],
            }),
            Self::CanvasDesktop => Some(LegacyRuntimeIdentity {
                legacy_bundle_identifier: "com.edy.krillcanvas",
                target_bundle_identifier: "com.aimoia.canvasdesktop",
                legacy_credential_services: &["krill-canvas"],
                legacy_data_directory: "Krill Canvas",
                target_data_directory: "AimoiA Canvas Desktop",
                legacy_browser_storage_keys: &[],
            }),
            Self::Hub | Self::CanvasWeb => None,
        }
    }
}

pub fn compatible_data_directory(product: ProductId, data_root: &Path) -> Option<PathBuf> {
    let identity = product.legacy_runtime_identity()?;
    let legacy = data_root.join(identity.legacy_data_directory);
    Some(if legacy.exists() {
        legacy
    } else {
        data_root.join(identity.target_data_directory)
    })
}

impl fmt::Display for ProductId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoreError {
    message: String,
}

impl CoreError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for CoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for CoreError {}

impl TryFrom<&str> for ProductId {
    type Error = CoreError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "aimoia-hub" => Ok(Self::Hub),
            "aimoia-image-studio" => Ok(Self::ImageStudio),
            "aimoia-ppt-studio" => Ok(Self::PptStudio),
            "aimoia-canvas-desktop" => Ok(Self::CanvasDesktop),
            "aimoia-canvas-web" => Ok(Self::CanvasWeb),
            _ => Err(CoreError::new(format!("未知 AimoiA 产品标识：{}", value))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_stable_product_identifiers() {
        assert_eq!(ProductId::PptStudio.as_str(), "aimoia-ppt-studio");
        assert_eq!(ProductId::ImageStudio.to_string(), "aimoia-image-studio");
    }

    #[test]
    fn parses_known_product_identifiers() {
        assert_eq!(
            ProductId::try_from("aimoia-canvas-desktop").unwrap(),
            ProductId::CanvasDesktop
        );
    }

    #[test]
    fn rejects_unknown_product_identifiers() {
        assert_eq!(
            ProductId::try_from("krill-canvas").unwrap_err().to_string(),
            "未知 AimoiA 产品标识：krill-canvas"
        );
    }

    #[test]
    fn registers_legacy_runtime_values_before_migration() {
        let identity = ProductId::ImageStudio.legacy_runtime_identity().unwrap();
        assert_eq!(identity.legacy_bundle_identifier, "com.edy.krillimagestudio");
        assert_eq!(identity.target_bundle_identifier, "com.aimoia.imagestudio");
        assert!(identity
            .legacy_browser_storage_keys
            .contains(&"krill-image-studio-history-v1"));

        let ppt = ProductId::PptStudio.legacy_runtime_identity().unwrap();
        assert!(ppt.legacy_credential_services.contains(&"krill-canvas"));
        assert_eq!(ppt.legacy_data_directory, "Krill Canvas");
    }

    #[test]
    fn omits_products_without_a_legacy_desktop_installation() {
        assert_eq!(ProductId::Hub.legacy_runtime_identity(), None);
        assert_eq!(ProductId::CanvasWeb.legacy_runtime_identity(), None);
    }

    #[test]
    fn selects_legacy_data_directory_when_an_existing_installation_is_found() {
        let root = std::env::temp_dir().join(format!(
            "aimoia-core-data-directory-test-{}",
            std::process::id()
        ));
        let legacy = root.join("Krill Image Studio");
        std::fs::create_dir_all(&legacy).unwrap();

        assert_eq!(
            compatible_data_directory(ProductId::ImageStudio, &root),
            Some(legacy)
        );

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn selects_target_data_directory_for_a_new_desktop_installation() {
        let root = std::env::temp_dir().join(format!(
            "aimoia-core-data-directory-test-{}",
            std::process::id()
        ));

        assert_eq!(
            compatible_data_directory(ProductId::PptStudio, &root),
            Some(root.join("AimoiA PPT Studio"))
        );
        assert_eq!(compatible_data_directory(ProductId::Hub, &root), None);
    }
}
