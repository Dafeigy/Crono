use std::{
    collections::HashMap,
    io::{Read, Write},
    net::TcpListener,
    sync::Arc,
    thread,
};

use crono_database::Database;
use crono_http::{ExecuteContext, HttpExecutor};
use crono_models::{HttpRequest, HttpResponse, HttpResponseState, Model, RequestAuth, RequestBody};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[tokio::test]
async fn persisted_request_to_history_and_body_is_a_closed_loop() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let mut request = [0_u8; 2048];
        let _ = socket.read(&mut request);
        socket
            .write_all(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 17\r\n\r\n{\"source\":\"mock\"}",
            )
            .unwrap();
    });

    let database = Database::open_in_memory().unwrap();
    let request = HttpRequest {
        id: "request-integration".to_owned(),
        workspace_id: "workspace-personal".to_owned(),
        folder_id: None,
        name: "Integration request".to_owned(),
        method: "GET".to_owned(),
        url: format!("http://{address}/health"),
        parameters: Vec::new(),
        headers: Vec::new(),
        body: RequestBody::None,
        authentication: RequestAuth::None,
        timeout_ms: 30_000,
        sort_priority: 1000,
        created_at: 1,
        updated_at: 1,
    };
    database
        .upsert(Model::HttpRequest(request.clone()), "integration")
        .unwrap();

    let task_id = Uuid::new_v4().to_string();
    let response_id = Uuid::new_v4().to_string();
    let response_root = std::env::temp_dir().join(format!("crono-vertical-slice-{response_id}"));
    let executed = HttpExecutor::new()
        .unwrap()
        .execute(
            &database.http_request(&request.id).unwrap(),
            ExecuteContext {
                task_id: task_id.clone(),
                response_id: response_id.clone(),
                response_dir: response_root.clone(),
                variables: HashMap::new(),
            },
            CancellationToken::new(),
            Arc::new(|_| {}),
            Arc::new(|_| {}),
        )
        .await
        .unwrap();

    let response = HttpResponse {
        id: response_id,
        request_id: request.id.clone(),
        workspace_id: request.workspace_id,
        task_id,
        state: HttpResponseState::Closed,
        method: request.method,
        url: request.url,
        status: Some(executed.status),
        status_text: Some(executed.status_text),
        request_headers: executed.request_headers,
        headers: executed.headers,
        body_path: Some(executed.body_path.to_string_lossy().into_owned()),
        body_size: executed.body_size,
        content_type: executed.content_type,
        elapsed_ms: Some(executed.elapsed_ms),
        error_code: None,
        error_detail: None,
        created_at: 1,
        updated_at: 1,
    };
    database.save_http_response(&response).unwrap();
    database.save_timeline(&executed.timeline).unwrap();

    let history = database.response_history(&request.id, 10).unwrap();
    assert_eq!(history[0].state, HttpResponseState::Closed);
    assert_eq!(history[0].status, Some(200));
    assert_eq!(
        tokio::fs::read_to_string(history[0].body_path.as_ref().unwrap())
            .await
            .unwrap(),
        "{\"source\":\"mock\"}"
    );
    assert_eq!(database.timeline(&response.id).unwrap().len(), 4);
    let _ = tokio::fs::remove_dir_all(response_root).await;
}
