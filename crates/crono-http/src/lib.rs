use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    str::FromStr,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use crono_models::{
    HttpProgress, HttpRequest, HttpResponseState, KeyValue, RequestAuth, RequestBody, TimelineEvent,
};
use futures_util::StreamExt;
use reqwest::{Client, Method};
use thiserror::Error;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub type ProgressCallback = Arc<dyn Fn(HttpProgress) + Send + Sync>;
pub type StateCallback = Arc<dyn Fn(HttpResponseState) + Send + Sync>;

#[derive(Debug, Clone)]
pub struct ExecuteContext {
    pub task_id: String,
    pub response_id: String,
    pub response_dir: PathBuf,
    pub variables: HashMap<String, String>,
}

#[derive(Debug)]
pub struct ExecutedResponse {
    pub status: u16,
    pub status_text: String,
    pub request_headers: Vec<KeyValue>,
    pub headers: Vec<KeyValue>,
    pub body_path: PathBuf,
    pub body_size: u64,
    pub content_type: Option<String>,
    pub elapsed_ms: u64,
    pub timeline: Vec<TimelineEvent>,
}

#[derive(Debug, Error)]
pub enum HttpError {
    #[error("invalid HTTP method: {0}")]
    InvalidMethod(String),
    #[error("invalid URL or header: {0}")]
    InvalidRequest(String),
    #[error("request timed out")]
    Timeout,
    #[error("request was cancelled")]
    Cancelled,
    #[error("network request failed: {0}")]
    Network(String),
    #[error("response body write failed: {0}")]
    Io(#[from] std::io::Error),
}

impl HttpError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidMethod(_) => "http.invalid_method",
            Self::InvalidRequest(_) => "http.invalid_url",
            Self::Timeout => "http.timeout",
            Self::Cancelled => "http.cancelled",
            Self::Network(_) => "http.request_failed",
            Self::Io(_) => "http.body_write_failed",
        }
    }

    pub fn retryable(&self) -> bool {
        matches!(self, Self::Timeout | Self::Network(_) | Self::Io(_))
    }
}

#[derive(Clone)]
pub struct HttpExecutor {
    client: Client,
}

impl HttpExecutor {
    pub fn new() -> Result<Self, HttpError> {
        let client = Client::builder()
            .user_agent(concat!("Crono/", env!("CARGO_PKG_VERSION")))
            .no_proxy()
            .build()
            .map_err(|error| HttpError::Network(error.to_string()))?;
        Ok(Self { client })
    }

    pub async fn execute(
        &self,
        request: &HttpRequest,
        context: ExecuteContext,
        cancellation: CancellationToken,
        on_progress: ProgressCallback,
        on_state: StateCallback,
    ) -> Result<ExecutedResponse, HttpError> {
        let started = Instant::now();
        let mut timeline = vec![timeline_event(
            &context.response_id,
            "request_initialized",
            "Request initialized",
            Some(format!("{} {}", request.method, request.url)),
            0,
        )];
        let rendered_url = render_template(&request.url, &context.variables);
        let method = Method::from_str(&request.method)
            .map_err(|_| HttpError::InvalidMethod(request.method.clone()))?;
        let mut builder = self.client.request(method, &rendered_url);

        let query: Vec<(String, String)> = request
            .parameters
            .iter()
            .filter(|item| item.enabled && !item.name.is_empty())
            .map(|item| {
                (
                    render_template(&item.name, &context.variables),
                    render_template(&item.value, &context.variables),
                )
            })
            .collect();
        if !query.is_empty() {
            builder = builder.query(&query);
        }

        for header in request
            .headers
            .iter()
            .filter(|item| item.enabled && !item.name.is_empty())
        {
            builder = builder.header(
                render_template(&header.name, &context.variables),
                render_template(&header.value, &context.variables),
            );
        }

        match &request.authentication {
            RequestAuth::Basic { username, password } => {
                builder = builder.basic_auth(
                    render_template(username, &context.variables),
                    Some(render_template(password, &context.variables)),
                );
            }
            RequestAuth::Bearer { token, prefix } => {
                let prefix = render_template(prefix, &context.variables);
                let token = render_template(token, &context.variables);
                let authorization = if prefix.trim().is_empty() {
                    token
                } else {
                    format!("{} {}", prefix.trim(), token)
                };
                builder = builder.header(reqwest::header::AUTHORIZATION, authorization);
            }
            RequestAuth::ApiKey {
                name,
                value,
                location,
            } if location == "query" => {
                builder = builder.query(&[(
                    render_template(name, &context.variables),
                    render_template(value, &context.variables),
                )]);
            }
            RequestAuth::ApiKey { name, value, .. } => {
                builder = builder.header(
                    render_template(name, &context.variables),
                    render_template(value, &context.variables),
                );
            }
            RequestAuth::None | RequestAuth::Inherit => {}
        }

        let sent_bytes = match &request.body {
            RequestBody::Text(value) => {
                let body = render_template(value, &context.variables);
                let size = body.len() as u64;
                builder = builder.body(body);
                size
            }
            RequestBody::Json(value) => {
                let body = render_template(value, &context.variables);
                let size = body.len() as u64;
                builder = builder
                    .header("content-type", "application/json")
                    .body(body);
                size
            }
            RequestBody::Form(values) => {
                let form: Vec<(String, String)> = values
                    .iter()
                    .filter(|item| item.enabled && !item.name.is_empty())
                    .map(|item| {
                        (
                            render_template(&item.name, &context.variables),
                            render_template(&item.value, &context.variables),
                        )
                    })
                    .collect();
                let size = form
                    .iter()
                    .map(|(key, value)| key.len() + value.len() + 2)
                    .sum::<usize>() as u64;
                builder = builder.form(&form);
                size
            }
            RequestBody::None => 0,
        };
        builder = builder.timeout(Duration::from_millis(request.timeout_ms.max(1)));

        timeline.push(timeline_event(
            &context.response_id,
            "request_prepared",
            "Request prepared",
            Some(format!(
                "{} query parameters, {} headers",
                query.len(),
                request.headers.iter().filter(|item| item.enabled).count()
            )),
            started.elapsed().as_millis() as u64,
        ));
        let prepared_request = builder
            .build()
            .map_err(|error| HttpError::InvalidRequest(error.to_string()))?;
        let request_headers = prepared_request
            .headers()
            .iter()
            .enumerate()
            .map(|(index, (name, value))| KeyValue {
                id: format!("request-header-{index}"),
                enabled: true,
                name: name.to_string(),
                value: value.to_str().unwrap_or_default().to_owned(),
            })
            .collect::<Vec<_>>();
        on_state(HttpResponseState::Connecting);
        let response = tokio::select! {
            () = cancellation.cancelled() => return Err(HttpError::Cancelled),
            result = self.client.execute(prepared_request) => result.map_err(map_reqwest_error)?,
        };

        let status = response.status();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let headers = response
            .headers()
            .iter()
            .enumerate()
            .map(|(index, (name, value))| KeyValue {
                id: format!("response-header-{index}"),
                enabled: true,
                name: name.to_string(),
                value: value.to_str().unwrap_or_default().to_owned(),
            })
            .collect::<Vec<_>>();
        timeline.push(timeline_event(
            &context.response_id,
            "response_headers",
            "Response headers received",
            Some(format!("HTTP {}", status.as_u16())),
            started.elapsed().as_millis() as u64,
        ));
        on_state(HttpResponseState::Streaming);

        tokio::fs::create_dir_all(&context.response_dir).await?;
        let body_path = context.response_dir.join("body");
        let temporary_path = context.response_dir.join("body.partial");
        let mut file = tokio::fs::File::create(&temporary_path).await?;
        let mut stream = response.bytes_stream();
        let mut received_bytes = 0_u64;
        while let Some(chunk) = tokio::select! {
            () = cancellation.cancelled() => {
                drop(file);
                let _ = tokio::fs::remove_file(&temporary_path).await;
                return Err(HttpError::Cancelled);
            },
            next = stream.next() => next,
        } {
            let chunk = chunk.map_err(map_reqwest_error)?;
            file.write_all(&chunk).await?;
            received_bytes += chunk.len() as u64;
            on_progress(HttpProgress {
                task_id: context.task_id.clone(),
                response_id: context.response_id.clone(),
                sent_bytes,
                received_bytes,
            });
        }
        file.flush().await?;
        drop(file);
        tokio::fs::rename(&temporary_path, &body_path).await?;
        let elapsed_ms = started.elapsed().as_millis() as u64;
        timeline.push(timeline_event(
            &context.response_id,
            "response_complete",
            "Response body stored",
            Some(format!("{received_bytes} bytes")),
            elapsed_ms,
        ));

        Ok(ExecutedResponse {
            status: status.as_u16(),
            status_text: status.canonical_reason().unwrap_or_default().to_owned(),
            request_headers,
            headers,
            body_path,
            body_size: received_bytes,
            content_type,
            elapsed_ms,
            timeline,
        })
    }
}

fn map_reqwest_error(error: reqwest::Error) -> HttpError {
    if error.is_timeout() {
        HttpError::Timeout
    } else if error.is_builder() {
        HttpError::InvalidRequest(error.to_string())
    } else {
        HttpError::Network(error.to_string())
    }
}

pub fn render_template(input: &str, variables: &HashMap<String, String>) -> String {
    let mut output = String::with_capacity(input.len());
    let mut remaining = input;
    while let Some(start) = remaining.find("{{") {
        output.push_str(&remaining[..start]);
        let after_start = &remaining[start + 2..];
        let Some(end) = after_start.find("}}") else {
            output.push_str(&remaining[start..]);
            return output;
        };
        let key = after_start[..end].trim();
        let value = match key {
            "$uuid" => Uuid::new_v4().to_string(),
            "$timestamp" => unix_millis().to_string(),
            _ => variables
                .get(key)
                .cloned()
                .unwrap_or_else(|| format!("{{{{{key}}}}}")),
        };
        output.push_str(&value);
        remaining = &after_start[end + 2..];
    }
    output.push_str(remaining);
    output
}

fn timeline_event(
    response_id: &str,
    event_type: &str,
    title: &str,
    detail: Option<String>,
    timestamp_ms: u64,
) -> TimelineEvent {
    TimelineEvent {
        id: Uuid::new_v4().to_string(),
        response_id: response_id.to_owned(),
        event_type: event_type.to_owned(),
        title: title.to_owned(),
        detail,
        timestamp_ms,
    }
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

pub fn is_text_content_type(content_type: Option<&str>) -> bool {
    content_type.is_none_or(|value| {
        value.starts_with("text/")
            || value.contains("json")
            || value.contains("xml")
            || value.contains("javascript")
            || value.contains("graphql")
    })
}

pub fn response_directory(root: &Path, response_id: &str) -> PathBuf {
    root.join("responses").join(response_id)
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        io::{Read, Write},
        net::TcpListener,
        sync::Arc,
        thread,
    };

    use crono_models::{HttpRequest, KeyValue, RequestAuth, RequestBody};
    use tokio_util::sync::CancellationToken;

    use super::{
        ExecuteContext, HttpExecutor, HttpResponseState, is_text_content_type, render_template,
    };

    #[test]
    fn renders_environment_and_builtin_variables() {
        let variables = HashMap::from([("base".to_owned(), "example.com".to_owned())]);
        let rendered = render_template("https://{{base}}/{{$timestamp}}", &variables);
        assert!(rendered.starts_with("https://example.com/"));
    }

    #[test]
    fn detects_text_content_types() {
        assert!(is_text_content_type(Some(
            "application/json; charset=utf-8"
        )));
        assert!(!is_text_content_type(Some("application/octet-stream")));
    }

    #[tokio::test]
    async fn sends_get_and_streams_body_to_disk() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request_bytes = [0_u8; 2048];
            let _ = socket.read(&mut request_bytes);
            let response =
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}";
            socket.write_all(response).unwrap();
        });
        let root = std::env::temp_dir().join(format!("crono-http-{}", uuid::Uuid::new_v4()));
        let request = HttpRequest {
            id: "request".to_owned(),
            workspace_id: "workspace".to_owned(),
            folder_id: None,
            name: "test".to_owned(),
            method: "GET".to_owned(),
            url: format!("http://{address}/health"),
            parameters: Vec::new(),
            headers: Vec::new(),
            body: RequestBody::None,
            authentication: RequestAuth::None,
            timeout_ms: 5_000,
            sort_priority: 0,
            created_at: 0,
            updated_at: 0,
        };
        let result = HttpExecutor::new()
            .unwrap()
            .execute(
                &request,
                ExecuteContext {
                    task_id: "task".to_owned(),
                    response_id: "response".to_owned(),
                    response_dir: root.clone(),
                    variables: HashMap::new(),
                },
                CancellationToken::new(),
                Arc::new(|_| {}),
                Arc::new(|state| {
                    assert!(matches!(
                        state,
                        HttpResponseState::Connecting | HttpResponseState::Streaming
                    ));
                }),
            )
            .await
            .unwrap();
        assert_eq!(result.status, 200);
        assert_eq!(
            tokio::fs::read_to_string(result.body_path).await.unwrap(),
            "{\"ok\":true}"
        );
        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn renders_environment_variables_across_request_fields() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(1)))
                .unwrap();
            let mut request_bytes = vec![0_u8; 4096];
            let count = socket.read(&mut request_bytes).unwrap();
            sender
                .send(String::from_utf8_lossy(&request_bytes[..count]).into_owned())
                .unwrap();
            socket
                .write_all(b"HTTP/1.1 201 Created\r\nContent-Length: 2\r\n\r\nok")
                .unwrap();
        });
        let root = std::env::temp_dir().join(format!("crono-http-{}", uuid::Uuid::new_v4()));
        let request = HttpRequest {
            id: "request".to_owned(),
            workspace_id: "workspace".to_owned(),
            folder_id: None,
            name: "test".to_owned(),
            method: "POST".to_owned(),
            url: format!("http://{address}/{{{{resource}}}}"),
            parameters: vec![KeyValue {
                id: "parameter".to_owned(),
                enabled: true,
                name: "filter_{{query_name}}".to_owned(),
                value: "{{query_value}}".to_owned(),
            }],
            headers: vec![KeyValue {
                id: "header".to_owned(),
                enabled: true,
                name: "x-{{header_name}}".to_owned(),
                value: "{{header_value}}".to_owned(),
            }],
            body: RequestBody::Json("{\"name\":\"{{body_value}}\"}".to_owned()),
            authentication: RequestAuth::Bearer {
                token: "{{auth_token}}".to_owned(),
                prefix: "{{auth_scheme}}".to_owned(),
            },
            timeout_ms: 5_000,
            sort_priority: 0,
            created_at: 0,
            updated_at: 0,
        };
        let result = HttpExecutor::new()
            .unwrap()
            .execute(
                &request,
                ExecuteContext {
                    task_id: "task".to_owned(),
                    response_id: "response".to_owned(),
                    response_dir: root.clone(),
                    variables: HashMap::from([
                        ("resource".to_owned(), "users".to_owned()),
                        ("query_name".to_owned(), "state".to_owned()),
                        ("query_value".to_owned(), "active".to_owned()),
                        ("header_name".to_owned(), "crono-test".to_owned()),
                        ("header_value".to_owned(), "enabled".to_owned()),
                        ("body_value".to_owned(), "Crono".to_owned()),
                        ("auth_scheme".to_owned(), "Token".to_owned()),
                        ("auth_token".to_owned(), "secret".to_owned()),
                    ]),
                },
                CancellationToken::new(),
                Arc::new(|_| {}),
                Arc::new(|_| {}),
            )
            .await
            .unwrap();
        let wire_request = receiver.recv().unwrap().to_ascii_lowercase();
        assert!(wire_request.starts_with("post /users?filter_state=active http/1.1"));
        assert!(wire_request.contains("x-crono-test: enabled"));
        assert!(wire_request.contains("authorization: token secret"));
        assert!(
            result
                .request_headers
                .iter()
                .any(|header| { header.name == "x-crono-test" && header.value == "enabled" })
        );
        assert!(
            result
                .request_headers
                .iter()
                .any(|header| { header.name == "authorization" && header.value == "Token secret" })
        );
        assert!(
            result.request_headers.iter().any(|header| {
                header.name == "content-type" && header.value == "application/json"
            })
        );
        assert!(wire_request.contains("{\"name\":\"crono\"}"));
        assert_eq!(result.status, 201);
        let _ = tokio::fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn cancellation_reaches_a_terminal_error() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request_bytes = [0_u8; 2048];
            let _ = socket.read(&mut request_bytes);
            thread::sleep(std::time::Duration::from_secs(1));
        });
        let request = HttpRequest {
            id: "request".to_owned(),
            workspace_id: "workspace".to_owned(),
            folder_id: None,
            name: "test".to_owned(),
            method: "GET".to_owned(),
            url: format!("http://{address}/slow"),
            parameters: Vec::new(),
            headers: Vec::new(),
            body: RequestBody::None,
            authentication: RequestAuth::None,
            timeout_ms: 5_000,
            sort_priority: 0,
            created_at: 0,
            updated_at: 0,
        };
        let cancellation = CancellationToken::new();
        let cancel_from_task = cancellation.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            cancel_from_task.cancel();
        });
        let error = HttpExecutor::new()
            .unwrap()
            .execute(
                &request,
                ExecuteContext {
                    task_id: "task".to_owned(),
                    response_id: "response".to_owned(),
                    response_dir: std::env::temp_dir(),
                    variables: HashMap::new(),
                },
                cancellation,
                Arc::new(|_| {}),
                Arc::new(|_| {}),
            )
            .await
            .unwrap_err();
        assert!(matches!(error, super::HttpError::Cancelled));
    }

    #[tokio::test]
    async fn timeout_reaches_a_terminal_error() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request_bytes = [0_u8; 2048];
            let _ = socket.read(&mut request_bytes);
            thread::sleep(std::time::Duration::from_secs(1));
        });
        let request = HttpRequest {
            id: "request".to_owned(),
            workspace_id: "workspace".to_owned(),
            folder_id: None,
            name: "test".to_owned(),
            method: "GET".to_owned(),
            url: format!("http://{address}/timeout"),
            parameters: Vec::new(),
            headers: Vec::new(),
            body: RequestBody::None,
            authentication: RequestAuth::None,
            timeout_ms: 20,
            sort_priority: 0,
            created_at: 0,
            updated_at: 0,
        };
        let error = HttpExecutor::new()
            .unwrap()
            .execute(
                &request,
                ExecuteContext {
                    task_id: "task".to_owned(),
                    response_id: "response".to_owned(),
                    response_dir: std::env::temp_dir(),
                    variables: HashMap::new(),
                },
                CancellationToken::new(),
                Arc::new(|_| {}),
                Arc::new(|_| {}),
            )
            .await
            .unwrap_err();
        assert!(matches!(error, super::HttpError::Timeout));
    }
}
