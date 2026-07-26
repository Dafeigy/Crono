use std::{
    collections::HashMap,
    io::{Read, Seek, SeekFrom},
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use crono_core::AppMetadata;
use crono_database::{Database, DatabaseError};
use crono_http::{
    ExecuteContext, HttpError, HttpExecutor, is_text_content_type, response_directory,
};
use crono_models::{
    HttpBodyRead, HttpProgress, HttpResponse, HttpResponseState, HttpStateEvent, HttpTaskStarted,
    Model, ModelChange, ModelKind, Settings, TimelineEvent, WorkspaceSnapshot,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppError {
    code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<HashMap<String, serde_json::Value>>,
    detail: Option<String>,
    retryable: bool,
}

impl From<DatabaseError> for AppError {
    fn from(error: DatabaseError) -> Self {
        Self {
            code: "database.operation_failed".to_owned(),
            params: None,
            detail: Some(error.to_string()),
            retryable: true,
        }
    }
}

impl From<HttpError> for AppError {
    fn from(error: HttpError) -> Self {
        Self {
            code: error.code().to_owned(),
            params: None,
            detail: Some(error.to_string()),
            retryable: error.retryable(),
        }
    }
}

struct HttpRuntime {
    executor: HttpExecutor,
    tasks: Mutex<HashMap<String, CancellationToken>>,
    data_dir: PathBuf,
}

#[tauri::command]
fn app_metadata() -> AppMetadata {
    crono_core::app_metadata()
}

#[tauri::command]
fn settings_defaults() -> Settings {
    crono_core::default_settings()
}

#[tauri::command]
fn settings_get(database: State<'_, Database>) -> Result<Settings, AppError> {
    database.settings().map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
fn settings_update(
    app: AppHandle,
    database: State<'_, Database>,
    settings: Settings,
    source_window_id: String,
) -> Result<Settings, AppError> {
    let change = database
        .upsert(Model::Settings(settings.clone()), &source_window_id)
        .map_err(AppError::from)?;
    emit_change(&app, &change)?;
    app.emit("crono:settings-changed", &settings)
        .map_err(event_error)?;
    Ok(settings)
}

#[tauri::command(rename_all = "camelCase")]
fn workspace_hydrate(
    database: State<'_, Database>,
    workspace_id: Option<String>,
) -> Result<WorkspaceSnapshot, AppError> {
    database
        .hydrate(workspace_id.as_deref())
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
fn models_upsert(
    app: AppHandle,
    database: State<'_, Database>,
    model: Model,
    source_window_id: String,
) -> Result<ModelChange, AppError> {
    let change = database
        .upsert(model, &source_window_id)
        .map_err(AppError::from)?;
    emit_change(&app, &change)?;
    Ok(change)
}

#[tauri::command(rename_all = "camelCase")]
fn models_delete(
    app: AppHandle,
    database: State<'_, Database>,
    model_kind: ModelKind,
    model_id: String,
    workspace_id: Option<String>,
    source_window_id: String,
) -> Result<ModelChange, AppError> {
    let change = database
        .delete(
            model_kind,
            &model_id,
            workspace_id.as_deref(),
            &source_window_id,
        )
        .map_err(AppError::from)?;
    emit_change(&app, &change)?;
    Ok(change)
}

#[tauri::command(rename_all = "camelCase")]
fn models_duplicate(
    app: AppHandle,
    database: State<'_, Database>,
    model_kind: ModelKind,
    model_id: String,
    name: String,
    source_window_id: String,
) -> Result<ModelChange, AppError> {
    let change = database
        .duplicate(model_kind, &model_id, &name, &source_window_id)
        .map_err(AppError::from)?;
    emit_change(&app, &change)?;
    Ok(change)
}

#[tauri::command(rename_all = "camelCase")]
fn http_send(
    app: AppHandle,
    database: State<'_, Database>,
    runtime: State<'_, HttpRuntime>,
    request_id: String,
    environment_id: Option<String>,
) -> Result<HttpTaskStarted, AppError> {
    let request = database.http_request(&request_id).map_err(AppError::from)?;
    let variables = match environment_id {
        Some(id) => database
            .environment_variables(&id)
            .map_err(AppError::from)?,
        None => HashMap::new(),
    };
    let task_id = Uuid::new_v4().to_string();
    let response_id = Uuid::new_v4().to_string();
    let now = unix_timestamp();
    let response = HttpResponse {
        id: response_id.clone(),
        request_id: request.id.clone(),
        workspace_id: request.workspace_id.clone(),
        task_id: task_id.clone(),
        state: HttpResponseState::Initialized,
        method: request.method.clone(),
        url: request.url.clone(),
        status: None,
        status_text: None,
        request_headers: Vec::new(),
        headers: Vec::new(),
        body_path: None,
        body_size: 0,
        content_type: None,
        elapsed_ms: None,
        error_code: None,
        error_detail: None,
        created_at: now,
        updated_at: now,
    };
    database
        .save_http_response(&response)
        .map_err(AppError::from)?;
    emit_http_state(
        &app,
        &task_id,
        &response_id,
        HttpResponseState::Initialized,
        Some(response.clone()),
    )?;

    let cancellation = CancellationToken::new();
    runtime
        .tasks
        .lock()
        .map_err(|_| runtime_error("http.task_registry_failed"))?
        .insert(task_id.clone(), cancellation.clone());
    let executor = runtime.executor.clone();
    let response_dir = response_directory(&runtime.data_dir, &response_id);
    let task_app = app.clone();
    let progress_app = app.clone();
    let progress_task_id = task_id.clone();
    let progress_response_id = response_id.clone();
    let state_app = app.clone();
    let state_task_id = task_id.clone();
    let state_response_id = response_id.clone();
    let spawned_task_id = task_id.clone();
    let spawned_response_id = response_id.clone();
    tauri::async_runtime::spawn(async move {
        let on_progress = std::sync::Arc::new(move |mut progress: HttpProgress| {
            progress.task_id.clone_from(&progress_task_id);
            progress.response_id.clone_from(&progress_response_id);
            let _ = progress_app.emit("crono:http-progress", progress);
        });
        let on_state = std::sync::Arc::new(move |state| {
            let _ = emit_http_state(&state_app, &state_task_id, &state_response_id, state, None);
        });
        let result = executor
            .execute(
                &request,
                ExecuteContext {
                    task_id: spawned_task_id.clone(),
                    response_id: spawned_response_id.clone(),
                    response_dir,
                    variables,
                },
                cancellation,
                on_progress,
                on_state,
            )
            .await;
        let database = task_app.state::<Database>();
        let mut final_response = response;
        let mut timeline = Vec::new();
        match result {
            Ok(executed) => {
                final_response.state = HttpResponseState::Closed;
                final_response.status = Some(executed.status);
                final_response.status_text = Some(executed.status_text);
                final_response.request_headers = executed.request_headers;
                final_response.headers = executed.headers;
                final_response.body_path = Some(executed.body_path.to_string_lossy().into_owned());
                final_response.body_size = executed.body_size;
                final_response.content_type = executed.content_type;
                final_response.elapsed_ms = Some(executed.elapsed_ms);
                timeline = executed.timeline;
            }
            Err(error) => {
                final_response.state = if matches!(error, HttpError::Cancelled) {
                    HttpResponseState::Cancelled
                } else {
                    HttpResponseState::Failed
                };
                final_response.error_code = Some(error.code().to_owned());
                final_response.error_detail = Some(error.to_string());
                timeline.push(TimelineEvent {
                    id: Uuid::new_v4().to_string(),
                    response_id: spawned_response_id.clone(),
                    event_type: "request_terminal_error".to_owned(),
                    title: "Request ended".to_owned(),
                    detail: Some(error.to_string()),
                    timestamp_ms: 0,
                });
            }
        }
        final_response.updated_at = unix_timestamp();
        let _ = database.save_http_response(&final_response);
        let _ = database.save_timeline(&timeline);
        let _ = emit_http_state(
            &task_app,
            &spawned_task_id,
            &spawned_response_id,
            final_response.state,
            Some(final_response),
        );
        if let Ok(mut tasks) = task_app.state::<HttpRuntime>().tasks.lock() {
            tasks.remove(&spawned_task_id);
        }
    });

    Ok(HttpTaskStarted {
        task_id,
        response_id,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn http_cancel(runtime: State<'_, HttpRuntime>, task_id: String) -> Result<bool, AppError> {
    let tasks = runtime
        .tasks
        .lock()
        .map_err(|_| runtime_error("http.task_registry_failed"))?;
    if let Some(token) = tasks.get(&task_id) {
        token.cancel();
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command(rename_all = "camelCase")]
fn http_response_body_read(
    database: State<'_, Database>,
    response_id: String,
    offset: u64,
    limit: u64,
) -> Result<HttpBodyRead, AppError> {
    let response = database
        .http_response(&response_id)
        .map_err(AppError::from)?;
    let is_text = is_text_content_type(response.content_type.as_deref());
    let Some(path) = response.body_path else {
        return Ok(HttpBodyRead {
            content: String::new(),
            offset,
            next_offset: offset,
            eof: true,
            is_text,
        });
    };
    if !is_text {
        return Ok(HttpBodyRead {
            content: String::new(),
            offset,
            next_offset: offset,
            eof: true,
            is_text: false,
        });
    }
    let mut file = std::fs::File::open(path).map_err(io_error)?;
    file.seek(SeekFrom::Start(offset)).map_err(io_error)?;
    let read_limit = limit.clamp(1, 1024 * 1024) as usize;
    let mut buffer = vec![0; read_limit];
    let count = file.read(&mut buffer).map_err(io_error)?;
    buffer.truncate(count);
    let next_offset = offset + count as u64;
    Ok(HttpBodyRead {
        content: String::from_utf8_lossy(&buffer).into_owned(),
        offset,
        next_offset,
        eof: next_offset >= response.body_size,
        is_text: true,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn http_response_body_export(
    database: State<'_, Database>,
    response_id: String,
    destination_path: String,
) -> Result<u64, AppError> {
    let response = database
        .http_response(&response_id)
        .map_err(AppError::from)?;
    if let Some(source_path) = response.body_path {
        std::fs::copy(source_path, destination_path).map_err(body_export_error)
    } else {
        std::fs::File::create(destination_path)
            .map(|_| 0)
            .map_err(body_export_error)
    }
}

#[tauri::command(rename_all = "camelCase")]
fn http_response_history(
    database: State<'_, Database>,
    request_id: String,
    limit: Option<u32>,
) -> Result<Vec<HttpResponse>, AppError> {
    database
        .response_history(&request_id, limit.unwrap_or(50).min(200))
        .map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
fn http_response_latest(
    database: State<'_, Database>,
    workspace_id: String,
) -> Result<Vec<HttpResponse>, AppError> {
    database.latest_responses(&workspace_id).map_err(Into::into)
}

#[tauri::command(rename_all = "camelCase")]
fn http_response_events(
    database: State<'_, Database>,
    response_id: String,
) -> Result<Vec<TimelineEvent>, AppError> {
    database.timeline(&response_id).map_err(Into::into)
}

fn emit_change(app: &AppHandle, change: &ModelChange) -> Result<(), AppError> {
    app.emit("crono:model-write", change).map_err(event_error)
}

fn emit_http_state(
    app: &AppHandle,
    task_id: &str,
    response_id: &str,
    state: HttpResponseState,
    response: Option<HttpResponse>,
) -> Result<(), AppError> {
    app.emit(
        "crono:http-state",
        HttpStateEvent {
            task_id: task_id.to_owned(),
            response_id: response_id.to_owned(),
            state,
            response,
        },
    )
    .map_err(event_error)
}

fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn runtime_error(code: &str) -> AppError {
    AppError {
        code: code.to_owned(),
        params: None,
        detail: None,
        retryable: true,
    }
}

fn io_error(error: std::io::Error) -> AppError {
    AppError {
        code: "http.body_read_failed".to_owned(),
        params: None,
        detail: Some(error.to_string()),
        retryable: true,
    }
}

fn body_export_error(error: std::io::Error) -> AppError {
    AppError {
        code: "http.body_export_failed".to_owned(),
        params: None,
        detail: Some(error.to_string()),
        retryable: true,
    }
}

fn event_error(error: tauri::Error) -> AppError {
    AppError {
        code: "app.event_emit_failed".to_owned(),
        params: None,
        detail: Some(error.to_string()),
        retryable: true,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(Database::open(data_dir.join("crono.sqlite"))?);
            app.manage(HttpRuntime {
                executor: HttpExecutor::new()?,
                tasks: Mutex::new(HashMap::new()),
                data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_metadata,
            settings_defaults,
            settings_get,
            settings_update,
            workspace_hydrate,
            models_upsert,
            models_delete,
            models_duplicate,
            http_send,
            http_cancel,
            http_response_body_read,
            http_response_body_export,
            http_response_history,
            http_response_latest,
            http_response_events,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Crono");
}
