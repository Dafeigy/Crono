use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{Mutex, MutexGuard},
};

use crono_models::{
    Environment, Folder, HttpRequest, HttpResponse, Model, ModelChange, ModelKind, ModelOperation,
    Settings, TimelineEvent, Workspace, WorkspaceSnapshot,
};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::{Serialize, de::DeserializeOwned};
use thiserror::Error;

const MIGRATION_1: &str = r#"
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES environments(id) ON DELETE CASCADE,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cookie_jars (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS http_requests (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_changes (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    source_window_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    model_kind TEXT NOT NULL,
    model_id TEXT NOT NULL,
    workspace_id TEXT,
    payload TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_folders_workspace ON folders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_environments_workspace ON environments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cookie_jars_workspace ON cookie_jars(workspace_id);
CREATE INDEX IF NOT EXISTS idx_http_requests_workspace ON http_requests(workspace_id);
"#;

const MIGRATION_2: &str = r#"
CREATE TABLE IF NOT EXISTS http_responses (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES http_requests(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    response_id TEXT NOT NULL REFERENCES http_responses(id) ON DELETE CASCADE,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_http_responses_request
    ON http_responses(request_id);
CREATE INDEX IF NOT EXISTS idx_http_responses_workspace
    ON http_responses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_timeline_response
    ON timeline_events(response_id);
"#;

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("database lock was poisoned")]
    Lock,
    #[error(transparent)]
    Sql(#[from] rusqlite::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("model operation is not supported: {0}")]
    InvalidModelOperation(String),
}

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, DatabaseError> {
        let connection = Connection::open(path)?;
        connection.execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;",
        )?;
        let database = Self {
            connection: Mutex::new(connection),
        };
        database.migrate()?;
        database.bootstrap()?;
        Ok(database)
    }

    pub fn open_in_memory() -> Result<Self, DatabaseError> {
        let connection = Connection::open_in_memory()?;
        connection.execute_batch("PRAGMA foreign_keys = ON;")?;
        let database = Self {
            connection: Mutex::new(connection),
        };
        database.migrate()?;
        database.bootstrap()?;
        Ok(database)
    }

    fn connection(&self) -> Result<MutexGuard<'_, Connection>, DatabaseError> {
        self.connection.lock().map_err(|_| DatabaseError::Lock)
    }

    fn migrate(&self) -> Result<(), DatabaseError> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        transaction.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL DEFAULT (unixepoch())
            );",
        )?;
        let applied = transaction
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = 1",
                [],
                |_| Ok(()),
            )
            .optional()?;
        if applied.is_none() {
            transaction.execute_batch(MIGRATION_1)?;
            transaction.execute("INSERT INTO schema_migrations(version) VALUES (1)", [])?;
        }
        let migration_2_applied = transaction
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = 2",
                [],
                |_| Ok(()),
            )
            .optional()?;
        if migration_2_applied.is_none() {
            transaction.execute_batch(MIGRATION_2)?;
            transaction.execute("INSERT INTO schema_migrations(version) VALUES (2)", [])?;
        }
        transaction.commit()?;
        Ok(())
    }

    fn bootstrap(&self) -> Result<(), DatabaseError> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        let now = unix_timestamp();
        let settings = Settings {
            created_at: now,
            updated_at: now,
            ..Settings::default()
        };
        let workspace = Workspace {
            id: "workspace-personal".to_owned(),
            name: "Personal APIs".to_owned(),
            description: String::new(),
            created_at: now,
            updated_at: now,
        };
        insert_if_missing(&transaction, "settings", &settings.id, &settings)?;
        insert_if_missing(&transaction, "workspaces", &workspace.id, &workspace)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn settings(&self) -> Result<Settings, DatabaseError> {
        let connection = self.connection()?;
        load_one(&connection, "SELECT payload FROM settings LIMIT 1", [])
    }

    pub fn http_request(&self, id: &str) -> Result<HttpRequest, DatabaseError> {
        let connection = self.connection()?;
        load_one(
            &connection,
            "SELECT payload FROM http_requests WHERE id = ?1",
            [id],
        )
    }

    pub fn environment(&self, id: &str) -> Result<Environment, DatabaseError> {
        let connection = self.connection()?;
        load_one(
            &connection,
            "SELECT payload FROM environments WHERE id = ?1",
            [id],
        )
    }

    pub fn environment_variables(
        &self,
        id: &str,
    ) -> Result<HashMap<String, String>, DatabaseError> {
        let mut environments = Vec::new();
        let mut current_id = Some(id.to_owned());
        let mut visited = HashSet::new();
        while let Some(environment_id) = current_id {
            if !visited.insert(environment_id.clone()) {
                return Err(DatabaseError::InvalidModelOperation(
                    "environment inheritance cycle".to_owned(),
                ));
            }
            let environment = self.environment(&environment_id)?;
            current_id = environment.parent_id.clone();
            environments.push(environment);
        }
        environments.reverse();
        let mut variables = HashMap::new();
        for environment in environments {
            for variable in environment.variables {
                if variable.enabled && !variable.name.is_empty() {
                    variables.insert(variable.name, variable.value);
                }
            }
        }
        Ok(variables)
    }

    pub fn save_http_response(&self, response: &HttpResponse) -> Result<(), DatabaseError> {
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO http_responses(id, request_id, workspace_id, payload)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
            params![
                response.id,
                response.request_id,
                response.workspace_id,
                serde_json::to_string(response)?
            ],
        )?;
        Ok(())
    }

    pub fn http_response(&self, id: &str) -> Result<HttpResponse, DatabaseError> {
        let connection = self.connection()?;
        load_one(
            &connection,
            "SELECT payload FROM http_responses WHERE id = ?1",
            [id],
        )
    }

    pub fn save_timeline(&self, events: &[TimelineEvent]) -> Result<(), DatabaseError> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        for event in events {
            transaction.execute(
                "INSERT OR REPLACE INTO timeline_events(id, response_id, payload)
                 VALUES (?1, ?2, ?3)",
                params![event.id, event.response_id, serde_json::to_string(event)?],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn response_history(
        &self,
        request_id: &str,
        limit: u32,
    ) -> Result<Vec<HttpResponse>, DatabaseError> {
        let connection = self.connection()?;
        load_many(
            &connection,
            "SELECT payload FROM http_responses WHERE request_id = ?1
             ORDER BY json_extract(payload, '$.createdAt') DESC LIMIT ?2",
            params![request_id, limit],
        )
    }

    pub fn delete_http_response(
        &self,
        response_id: &str,
    ) -> Result<Option<HttpResponse>, DatabaseError> {
        let connection = self.connection()?;
        let response = connection
            .query_row(
                "SELECT payload FROM http_responses WHERE id = ?1",
                [response_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .map(|payload| serde_json::from_str(&payload))
            .transpose()?;
        connection.execute("DELETE FROM http_responses WHERE id = ?1", [response_id])?;
        Ok(response)
    }

    pub fn clear_response_history(
        &self,
        request_id: &str,
    ) -> Result<Vec<HttpResponse>, DatabaseError> {
        let connection = self.connection()?;
        let responses = load_many(
            &connection,
            "SELECT payload FROM http_responses WHERE request_id = ?1",
            [request_id],
        )?;
        connection.execute(
            "DELETE FROM http_responses WHERE request_id = ?1",
            [request_id],
        )?;
        Ok(responses)
    }

    pub fn latest_responses(&self, workspace_id: &str) -> Result<Vec<HttpResponse>, DatabaseError> {
        let connection = self.connection()?;
        load_many(
            &connection,
            "SELECT response.payload
             FROM http_responses AS response
             WHERE response.workspace_id = ?1
               AND response.rowid = (
                 SELECT candidate.rowid
                 FROM http_responses AS candidate
                 WHERE candidate.request_id = response.request_id
                 ORDER BY json_extract(candidate.payload, '$.createdAt') DESC,
                          candidate.rowid DESC
                 LIMIT 1
               )
             ORDER BY json_extract(response.payload, '$.createdAt') DESC",
            [workspace_id],
        )
    }

    pub fn timeline(&self, response_id: &str) -> Result<Vec<TimelineEvent>, DatabaseError> {
        let connection = self.connection()?;
        load_many(
            &connection,
            "SELECT payload FROM timeline_events WHERE response_id = ?1
             ORDER BY json_extract(payload, '$.timestampMs') ASC",
            [response_id],
        )
    }

    pub fn hydrate(&self, workspace_id: Option<&str>) -> Result<WorkspaceSnapshot, DatabaseError> {
        let connection = self.connection()?;
        let settings = load_one(&connection, "SELECT payload FROM settings LIMIT 1", [])?;
        let workspaces = load_many(
            &connection,
            "SELECT payload FROM workspaces ORDER BY id",
            [],
        )?;
        let folders = load_workspace_models(&connection, "folders", workspace_id)?;
        let environments = load_workspace_models(&connection, "environments", workspace_id)?;
        let cookie_jars = load_workspace_models(&connection, "cookie_jars", workspace_id)?;
        let http_requests = load_workspace_models(&connection, "http_requests", workspace_id)?;
        let sequence = connection.query_row(
            "SELECT COALESCE(MAX(sequence), 0) FROM model_changes",
            [],
            |row| row.get(0),
        )?;
        Ok(WorkspaceSnapshot {
            sequence,
            settings,
            workspaces,
            folders,
            environments,
            cookie_jars,
            http_requests,
        })
    }

    pub fn upsert(
        &self,
        model: Model,
        source_window_id: &str,
    ) -> Result<ModelChange, DatabaseError> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        upsert_model(&transaction, &model)?;
        let change = record_change(
            &transaction,
            source_window_id,
            ModelOperation::Upsert,
            model.kind(),
            model.id(),
            model.workspace_id(),
            Some(&model),
        )?;
        transaction.commit()?;
        Ok(change)
    }

    pub fn delete(
        &self,
        kind: ModelKind,
        id: &str,
        workspace_id: Option<&str>,
        source_window_id: &str,
    ) -> Result<ModelChange, DatabaseError> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        let table = table_name(kind);
        if kind == ModelKind::Folder {
            transaction.execute(
                "WITH RECURSIVE descendants(id) AS (
                    SELECT id FROM folders WHERE id = ?1
                    UNION ALL
                    SELECT folders.id
                    FROM folders
                    JOIN descendants ON folders.parent_id = descendants.id
                )
                DELETE FROM http_requests
                WHERE folder_id IN (SELECT id FROM descendants)",
                [id],
            )?;
        }
        transaction.execute(&format!("DELETE FROM {table} WHERE id = ?1"), [id])?;
        let change = record_change(
            &transaction,
            source_window_id,
            ModelOperation::Delete,
            kind,
            id,
            workspace_id,
            None,
        )?;
        transaction.commit()?;
        Ok(change)
    }

    pub fn duplicate(
        &self,
        kind: ModelKind,
        id: &str,
        name: &str,
        source_window_id: &str,
    ) -> Result<ModelChange, DatabaseError> {
        let connection = self.connection()?;
        let payload: String = connection.query_row(
            &format!("SELECT payload FROM {} WHERE id = ?1", table_name(kind)),
            [id],
            |row| row.get(0),
        )?;
        drop(connection);
        let new_id = format!("{}_{}", id_prefix(kind), uuid::Uuid::new_v4().simple());
        let now = unix_timestamp();
        let model = match kind {
            ModelKind::Workspace => {
                let mut value: Workspace = serde_json::from_str(&payload)?;
                value.id = new_id;
                value.name = name.to_owned();
                value.created_at = now;
                value.updated_at = now;
                Model::Workspace(value)
            }
            ModelKind::Folder => {
                let mut value: Folder = serde_json::from_str(&payload)?;
                value.id = new_id;
                value.name = name.to_owned();
                value.created_at = now;
                value.updated_at = now;
                Model::Folder(value)
            }
            ModelKind::Environment => {
                let mut value: Environment = serde_json::from_str(&payload)?;
                value.id = new_id;
                value.name = name.to_owned();
                value.created_at = now;
                value.updated_at = now;
                Model::Environment(value)
            }
            ModelKind::CookieJar => {
                let mut value: crono_models::CookieJar = serde_json::from_str(&payload)?;
                value.id = new_id;
                value.name = name.to_owned();
                value.created_at = now;
                value.updated_at = now;
                Model::CookieJar(value)
            }
            ModelKind::HttpRequest => {
                let mut value: HttpRequest = serde_json::from_str(&payload)?;
                value.id = new_id;
                value.name = name.to_owned();
                value.created_at = now;
                value.updated_at = now;
                Model::HttpRequest(value)
            }
            ModelKind::Settings => {
                return Err(DatabaseError::InvalidModelOperation(
                    "settings cannot be duplicated".to_owned(),
                ));
            }
        };
        self.upsert(model, source_window_id)
    }
}

fn unix_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn insert_if_missing<T: Serialize>(
    transaction: &Transaction<'_>,
    table: &str,
    id: &str,
    value: &T,
) -> Result<(), DatabaseError> {
    transaction.execute(
        &format!("INSERT OR IGNORE INTO {table}(id, payload) VALUES (?1, ?2)"),
        params![id, serde_json::to_string(value)?],
    )?;
    Ok(())
}

fn load_one<T: DeserializeOwned, P: rusqlite::Params>(
    connection: &Connection,
    sql: &str,
    params: P,
) -> Result<T, DatabaseError> {
    let payload: String = connection.query_row(sql, params, |row| row.get(0))?;
    Ok(serde_json::from_str(&payload)?)
}

fn load_many<T: DeserializeOwned, P: rusqlite::Params>(
    connection: &Connection,
    sql: &str,
    params: P,
) -> Result<Vec<T>, DatabaseError> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params, |row| row.get::<_, String>(0))?;
    let mut values = Vec::new();
    for row in rows {
        values.push(serde_json::from_str(&row?)?);
    }
    Ok(values)
}

fn load_workspace_models<T: DeserializeOwned>(
    connection: &Connection,
    table: &str,
    workspace_id: Option<&str>,
) -> Result<Vec<T>, DatabaseError> {
    match workspace_id {
        Some(id) => load_many(
            connection,
            &format!("SELECT payload FROM {table} WHERE workspace_id = ?1 ORDER BY id"),
            [id],
        ),
        None => load_many(
            connection,
            &format!("SELECT payload FROM {table} ORDER BY id"),
            [],
        ),
    }
}

fn table_name(kind: ModelKind) -> &'static str {
    match kind {
        ModelKind::Settings => "settings",
        ModelKind::Workspace => "workspaces",
        ModelKind::Folder => "folders",
        ModelKind::Environment => "environments",
        ModelKind::CookieJar => "cookie_jars",
        ModelKind::HttpRequest => "http_requests",
    }
}

fn kind_name(kind: ModelKind) -> &'static str {
    match kind {
        ModelKind::Settings => "settings",
        ModelKind::Workspace => "workspace",
        ModelKind::Folder => "folder",
        ModelKind::Environment => "environment",
        ModelKind::CookieJar => "cookie_jar",
        ModelKind::HttpRequest => "http_request",
    }
}

fn id_prefix(kind: ModelKind) -> &'static str {
    match kind {
        ModelKind::Settings => "st",
        ModelKind::Workspace => "wk",
        ModelKind::Folder => "fl",
        ModelKind::Environment => "env",
        ModelKind::CookieJar => "cj",
        ModelKind::HttpRequest => "rq",
    }
}

fn upsert_model(transaction: &Transaction<'_>, model: &Model) -> Result<(), DatabaseError> {
    match model {
        Model::Settings(value) => {
            transaction.execute(
                "INSERT INTO settings(id, payload) VALUES (?1, ?2)
                 ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
                params![value.id, serde_json::to_string(value)?],
            )?;
        }
        Model::Workspace(value) => {
            transaction.execute(
                "INSERT INTO workspaces(id, payload) VALUES (?1, ?2)
                 ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
                params![value.id, serde_json::to_string(value)?],
            )?;
        }
        Model::Folder(value) => {
            transaction.execute(
                "INSERT INTO folders(id, workspace_id, parent_id, payload)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id,
                 parent_id = excluded.parent_id, payload = excluded.payload",
                params![
                    value.id,
                    value.workspace_id,
                    value.parent_id,
                    serde_json::to_string(value)?
                ],
            )?;
        }
        Model::Environment(value) => {
            transaction.execute(
                "INSERT INTO environments(id, workspace_id, parent_id, payload)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id,
                 parent_id = excluded.parent_id, payload = excluded.payload",
                params![
                    value.id,
                    value.workspace_id,
                    value.parent_id,
                    serde_json::to_string(value)?
                ],
            )?;
        }
        Model::CookieJar(value) => {
            transaction.execute(
                "INSERT INTO cookie_jars(id, workspace_id, payload) VALUES (?1, ?2, ?3)
                 ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id,
                 payload = excluded.payload",
                params![value.id, value.workspace_id, serde_json::to_string(value)?],
            )?;
        }
        Model::HttpRequest(value) => {
            transaction.execute(
                "INSERT INTO http_requests(id, workspace_id, folder_id, payload)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id,
                 folder_id = excluded.folder_id, payload = excluded.payload",
                params![
                    value.id,
                    value.workspace_id,
                    value.folder_id,
                    serde_json::to_string(value)?
                ],
            )?;
        }
    }
    Ok(())
}

fn record_change(
    transaction: &Transaction<'_>,
    source_window_id: &str,
    operation: ModelOperation,
    kind: ModelKind,
    model_id: &str,
    workspace_id: Option<&str>,
    model: Option<&Model>,
) -> Result<ModelChange, DatabaseError> {
    let operation_name = match operation {
        ModelOperation::Upsert => "upsert",
        ModelOperation::Delete => "delete",
    };
    transaction.execute(
        "INSERT INTO model_changes(
            source_window_id, operation, model_kind, model_id, workspace_id, payload
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            source_window_id,
            operation_name,
            kind_name(kind),
            model_id,
            workspace_id,
            model.map(serde_json::to_string).transpose()?
        ],
    )?;
    Ok(ModelChange {
        sequence: transaction.last_insert_rowid(),
        source_window_id: source_window_id.to_owned(),
        operation,
        model_kind: kind,
        model_id: model_id.to_owned(),
        workspace_id: workspace_id.map(str::to_owned),
        model: model.cloned(),
    })
}

#[cfg(test)]
mod tests {
    use crono_models::{
        Environment, Folder, HttpRequest, HttpResponse, HttpResponseState, KeyValue, Model,
        ModelKind, ModelOperation, RequestAuth, RequestBody, TimelineEvent,
    };

    use super::Database;

    fn sample_folder() -> Folder {
        Folder {
            id: "folder-test".to_owned(),
            workspace_id: "workspace-personal".to_owned(),
            parent_id: None,
            name: "Test folder".to_owned(),
            sort_priority: 1000,
            created_at: 1,
            updated_at: 1,
        }
    }

    fn sample_request(folder_id: Option<String>) -> HttpRequest {
        HttpRequest {
            id: "request-test".to_owned(),
            workspace_id: "workspace-personal".to_owned(),
            folder_id,
            name: "Test request".to_owned(),
            method: "GET".to_owned(),
            url: "https://example.com".to_owned(),
            parameters: Vec::new(),
            headers: Vec::new(),
            body: RequestBody::None,
            authentication: RequestAuth::None,
            timeout_ms: 30_000,
            sort_priority: 1000,
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn bootstraps_and_hydrates_first_workspace() {
        let database = Database::open_in_memory().unwrap();
        let snapshot = database.hydrate(Some("workspace-personal")).unwrap();
        assert_eq!(snapshot.workspaces.len(), 1);
        assert!(snapshot.folders.is_empty());
        assert!(snapshot.http_requests.is_empty());
    }

    #[test]
    fn persisted_settings_survive_database_reopen() {
        let path = std::env::temp_dir().join(format!(
            "crono-database-reopen-{}.sqlite",
            uuid::Uuid::new_v4().simple()
        ));
        {
            let database = Database::open(&path).unwrap();
            let mut settings = database.settings().unwrap();
            settings.locale = "zh-CN".to_owned();
            database.upsert(Model::Settings(settings), "main").unwrap();
        }
        {
            let database = Database::open(&path).unwrap();
            assert_eq!(database.settings().unwrap().locale, "zh-CN");
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn commits_settings_with_monotonic_change_sequence() {
        let database = Database::open_in_memory().unwrap();
        let mut settings = database.settings().unwrap();
        settings.locale = "zh-CN".to_owned();
        let first = database
            .upsert(Model::Settings(settings.clone()), "main")
            .unwrap();
        settings.locale = "en-US".to_owned();
        let second = database.upsert(Model::Settings(settings), "main").unwrap();
        assert_eq!(first.operation, ModelOperation::Upsert);
        assert!(second.sequence > first.sequence);
    }

    #[test]
    fn deletion_is_reported_after_commit() {
        let database = Database::open_in_memory().unwrap();
        database
            .upsert(Model::HttpRequest(sample_request(None)), "main")
            .unwrap();
        let change = database
            .delete(
                ModelKind::HttpRequest,
                "request-test",
                Some("workspace-personal"),
                "main",
            )
            .unwrap();
        assert_eq!(change.model_id, "request-test");
        assert!(database.hydrate(None).unwrap().http_requests.is_empty());
    }

    #[test]
    fn deleting_a_folder_removes_its_requests() {
        let database = Database::open_in_memory().unwrap();
        let folder = sample_folder();
        database
            .upsert(Model::Folder(folder.clone()), "main")
            .unwrap();
        database
            .upsert(
                Model::HttpRequest(sample_request(Some(folder.id.clone()))),
                "main",
            )
            .unwrap();
        database
            .delete(
                ModelKind::Folder,
                &folder.id,
                Some("workspace-personal"),
                "main",
            )
            .unwrap();
        let snapshot = database.hydrate(Some("workspace-personal")).unwrap();
        assert!(snapshot.folders.is_empty());
        assert!(snapshot.http_requests.is_empty());
    }

    #[test]
    fn settings_default_appearance_is_preserved() {
        let database = Database::open_in_memory().unwrap();
        assert_eq!(
            database.settings().unwrap().appearance,
            crono_models::Appearance::System
        );
    }

    #[test]
    fn resolves_parent_environment_variables_with_child_precedence() {
        let database = Database::open_in_memory().unwrap();
        let parent = Environment {
            id: "env-parent".to_owned(),
            workspace_id: "workspace-personal".to_owned(),
            parent_id: None,
            name: "Parent".to_owned(),
            color: None,
            variables: vec![
                KeyValue {
                    id: "parent-shared".to_owned(),
                    enabled: true,
                    name: "shared".to_owned(),
                    value: "parent".to_owned(),
                },
                KeyValue {
                    id: "parent-base".to_owned(),
                    enabled: true,
                    name: "base".to_owned(),
                    value: "example.com".to_owned(),
                },
            ],
            sort_priority: 1,
            created_at: 1,
            updated_at: 1,
        };
        let child = Environment {
            id: "env-child".to_owned(),
            workspace_id: "workspace-personal".to_owned(),
            parent_id: Some(parent.id.clone()),
            name: "Child".to_owned(),
            color: None,
            variables: vec![
                KeyValue {
                    id: "child-shared".to_owned(),
                    enabled: true,
                    name: "shared".to_owned(),
                    value: "child".to_owned(),
                },
                KeyValue {
                    id: "child-disabled".to_owned(),
                    enabled: false,
                    name: "ignored".to_owned(),
                    value: "secret".to_owned(),
                },
            ],
            sort_priority: 2,
            created_at: 1,
            updated_at: 1,
        };
        database.upsert(Model::Environment(parent), "main").unwrap();
        database.upsert(Model::Environment(child), "main").unwrap();

        let variables = database.environment_variables("env-child").unwrap();
        assert_eq!(
            variables.get("base").map(String::as_str),
            Some("example.com")
        );
        assert_eq!(variables.get("shared").map(String::as_str), Some("child"));
        assert!(!variables.contains_key("ignored"));
    }

    #[test]
    fn persists_response_history_and_timeline() {
        let database = Database::open_in_memory().unwrap();
        database
            .upsert(Model::HttpRequest(sample_request(None)), "main")
            .unwrap();
        let response = HttpResponse {
            id: "response".to_owned(),
            request_id: "request-test".to_owned(),
            workspace_id: "workspace-personal".to_owned(),
            task_id: "task".to_owned(),
            state: HttpResponseState::Closed,
            method: "GET".to_owned(),
            url: "http://localhost".to_owned(),
            status: Some(200),
            status_text: Some("OK".to_owned()),
            request_headers: Vec::new(),
            headers: Vec::new(),
            body_path: None,
            body_size: 2,
            content_type: Some("text/plain".to_owned()),
            elapsed_ms: Some(4),
            error_code: None,
            error_detail: None,
            created_at: 1,
            updated_at: 1,
        };
        database.save_http_response(&response).unwrap();
        let newer_response = HttpResponse {
            id: "response-newer".to_owned(),
            status: Some(201),
            created_at: 2,
            updated_at: 2,
            ..response.clone()
        };
        database.save_http_response(&newer_response).unwrap();
        database
            .save_timeline(&[TimelineEvent {
                id: "event".to_owned(),
                response_id: response.id.clone(),
                event_type: "closed".to_owned(),
                title: "Closed".to_owned(),
                detail: None,
                timestamp_ms: 4,
            }])
            .unwrap();
        assert_eq!(
            database.response_history("request-test", 10).unwrap()[0].status,
            Some(201)
        );
        let latest = database.latest_responses("workspace-personal").unwrap();
        assert_eq!(latest.len(), 1);
        assert_eq!(latest[0].id, "response-newer");
        assert_eq!(database.timeline("response").unwrap().len(), 1);

        assert_eq!(
            database
                .delete_http_response("response-newer")
                .unwrap()
                .unwrap()
                .id,
            "response-newer"
        );
        assert_eq!(
            database.response_history("request-test", 10).unwrap().len(),
            1
        );
        assert_eq!(
            database
                .clear_response_history("request-test")
                .unwrap()
                .len(),
            1
        );
        assert!(
            database
                .response_history("request-test", 10)
                .unwrap()
                .is_empty()
        );
        assert!(database.timeline("response").unwrap().is_empty());
    }

    #[test]
    fn duplicates_request_with_a_new_identity() {
        let database = Database::open_in_memory().unwrap();
        database
            .upsert(Model::HttpRequest(sample_request(None)), "main")
            .unwrap();
        let change = database
            .duplicate(
                ModelKind::HttpRequest,
                "request-test",
                "Test request copy",
                "main",
            )
            .unwrap();
        let Model::HttpRequest(request) = change.model.unwrap() else {
            panic!("expected duplicated request");
        };
        assert_ne!(request.id, "request-test");
        assert!(request.id.starts_with("rq_"));
        assert_eq!(request.name, "Test request copy");
        assert_eq!(database.hydrate(None).unwrap().http_requests.len(), 2);
    }
}
