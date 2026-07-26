use crono_models::Settings;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMetadata {
    pub name: &'static str,
    pub version: &'static str,
    pub platform: &'static str,
}

pub fn app_metadata() -> AppMetadata {
    AppMetadata {
        name: "Crono",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}

pub fn default_settings() -> Settings {
    Settings::default()
}

#[cfg(test)]
mod tests {
    use super::{app_metadata, default_settings};

    #[test]
    fn exposes_application_identity() {
        assert_eq!(app_metadata().name, "Crono");
        assert_eq!(default_settings().theme_dark, "crono-dark");
    }
}
