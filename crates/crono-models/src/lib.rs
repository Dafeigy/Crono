use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Appearance {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Settings {
    pub id: String,
    pub locale: String,
    pub appearance: Appearance,
    pub theme_light: String,
    pub theme_dark: String,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            id: "settings".to_owned(),
            locale: "en-US".to_owned(),
            appearance: Appearance::System,
            theme_light: "crono-light".to_owned(),
            theme_dark: "crono-dark".to_owned(),
            created_at: 0,
            updated_at: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct KeyValue {
    pub id: String,
    pub enabled: bool,
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Folder {
    pub id: String,
    pub workspace_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub sort_priority: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Environment {
    pub id: String,
    pub workspace_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub variables: Vec<KeyValue>,
    pub sort_priority: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Cookie {
    pub id: String,
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub expires_at: Option<i64>,
    pub secure: bool,
    pub http_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CookieJar {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub cookies: Vec<Cookie>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
#[ts(export)]
pub enum RequestBody {
    None,
    Text(String),
    Json(String),
    Form(Vec<KeyValue>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum RequestAuth {
    None,
    Inherit,
    Basic {
        username: String,
        password: String,
    },
    Bearer {
        token: String,
        #[serde(default = "default_bearer_prefix")]
        prefix: String,
    },
    ApiKey {
        name: String,
        value: String,
        location: String,
    },
}

fn default_bearer_prefix() -> String {
    "Bearer".to_owned()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HttpRequest {
    pub id: String,
    pub workspace_id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub parameters: Vec<KeyValue>,
    pub headers: Vec<KeyValue>,
    pub body: RequestBody,
    pub authentication: RequestAuth,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    pub sort_priority: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

fn default_timeout_ms() -> u64 {
    30_000
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum HttpResponseState {
    Initialized,
    Connecting,
    Streaming,
    Closed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HttpResponse {
    pub id: String,
    pub request_id: String,
    pub workspace_id: String,
    pub task_id: String,
    pub state: HttpResponseState,
    pub method: String,
    pub url: String,
    pub status: Option<u16>,
    pub status_text: Option<String>,
    #[serde(default)]
    pub request_headers: Vec<KeyValue>,
    pub headers: Vec<KeyValue>,
    pub body_path: Option<String>,
    pub body_size: u64,
    pub content_type: Option<String>,
    pub elapsed_ms: Option<u64>,
    pub error_code: Option<String>,
    pub error_detail: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TimelineEvent {
    pub id: String,
    pub response_id: String,
    pub event_type: String,
    pub title: String,
    pub detail: Option<String>,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HttpTaskStarted {
    pub task_id: String,
    pub response_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HttpProgress {
    pub task_id: String,
    pub response_id: String,
    pub sent_bytes: u64,
    pub received_bytes: u64,
    pub status: u16,
    pub status_text: String,
    pub content_type: Option<String>,
    pub body_chunk: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HttpStateEvent {
    pub task_id: String,
    pub response_id: String,
    pub state: HttpResponseState,
    pub response: Option<HttpResponse>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HttpBodyRead {
    pub content: String,
    pub offset: u64,
    pub next_offset: u64,
    pub eof: bool,
    pub is_text: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ModelKind {
    Settings,
    Workspace,
    Folder,
    Environment,
    CookieJar,
    HttpRequest,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "model", content = "data", rename_all = "snake_case")]
#[ts(export)]
pub enum Model {
    Settings(Settings),
    Workspace(Workspace),
    Folder(Folder),
    Environment(Environment),
    CookieJar(CookieJar),
    HttpRequest(HttpRequest),
}

impl Model {
    pub fn id(&self) -> &str {
        match self {
            Self::Settings(value) => &value.id,
            Self::Workspace(value) => &value.id,
            Self::Folder(value) => &value.id,
            Self::Environment(value) => &value.id,
            Self::CookieJar(value) => &value.id,
            Self::HttpRequest(value) => &value.id,
        }
    }

    pub fn kind(&self) -> ModelKind {
        match self {
            Self::Settings(_) => ModelKind::Settings,
            Self::Workspace(_) => ModelKind::Workspace,
            Self::Folder(_) => ModelKind::Folder,
            Self::Environment(_) => ModelKind::Environment,
            Self::CookieJar(_) => ModelKind::CookieJar,
            Self::HttpRequest(_) => ModelKind::HttpRequest,
        }
    }

    pub fn workspace_id(&self) -> Option<&str> {
        match self {
            Self::Settings(_) | Self::Workspace(_) => None,
            Self::Folder(value) => Some(&value.workspace_id),
            Self::Environment(value) => Some(&value.workspace_id),
            Self::CookieJar(value) => Some(&value.workspace_id),
            Self::HttpRequest(value) => Some(&value.workspace_id),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ModelOperation {
    Upsert,
    Delete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModelChange {
    pub sequence: i64,
    pub source_window_id: String,
    pub operation: ModelOperation,
    pub model_kind: ModelKind,
    pub model_id: String,
    pub workspace_id: Option<String>,
    pub model: Option<Model>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceSnapshot {
    pub sequence: i64,
    pub settings: Settings,
    pub workspaces: Vec<Workspace>,
    pub folders: Vec<Folder>,
    pub environments: Vec<Environment>,
    pub cookie_jars: Vec<CookieJar>,
    pub http_requests: Vec<HttpRequest>,
}

#[cfg(test)]
mod tests {
    use super::{Appearance, Model, ModelKind, RequestAuth, Settings};

    #[test]
    fn settings_defaults_match_frontend_bootstrap() {
        let settings = Settings::default();
        assert_eq!(settings.appearance, Appearance::System);
        assert_eq!(settings.theme_light, "crono-light");
        assert_eq!(settings.theme_dark, "crono-dark");
    }

    #[test]
    fn model_reports_stable_identity() {
        let model = Model::Settings(Settings::default());
        assert_eq!(model.id(), "settings");
        assert_eq!(model.kind(), ModelKind::Settings);
    }

    #[test]
    fn legacy_bearer_auth_defaults_to_bearer_prefix() {
        let auth: RequestAuth =
            serde_json::from_str(r#"{"type":"bearer","token":"secret"}"#).unwrap();
        assert_eq!(
            auth,
            RequestAuth::Bearer {
                token: "secret".to_owned(),
                prefix: "Bearer".to_owned(),
            }
        );
    }
}
