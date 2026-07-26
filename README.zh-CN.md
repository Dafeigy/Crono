# Crono

[English](./README.md) | [简体中文](./README.zh-CN.md)

Crono 是一款 local-first 桌面 API 客户端，使用 Vue 3、Tauri 2 和 Rust
构建。当前 MVP 已覆盖本地数据持久化、请求编辑、环境变量、常用认证方式、
请求发送以及响应历史查看。

> 当前版本为 `0.1.0` 开发预览版。数据默认保存在本机，不包含账号、团队协作
> 或云同步。

![Crono 桌面 API 客户端的请求与 JSON 响应界面](./imgs/screenshot.png)

## MVP 功能

- Workspace、Folder、Environment 和 HTTP Request 的本地 CRUD。
- SQLite WAL 持久化、向前迁移和多窗口模型同步。
- GET、POST 及自定义 HTTP method。
- Query、Header、Text/JSON Body 和请求超时。
- 环境变量继承，以及 `{{$uuid}}`、`{{$timestamp}}` 内建模板。
- Basic、Bearer（支持自定义前缀）和 API Key 认证。
- 请求取消、流式响应正文落盘、状态/Headers/JSON/Text 查看。
- 请求历史和基础 Timeline。
- 简体中文、英文、明暗外观和多套内置主题。

当前 MVP 暂不支持 Form、Multipart、Binary、Cookie Jar 行为、Redirect
控制、Proxy/TLS 配置、下载和大响应分页。这些能力属于后续增量，详见
[实施状态](./docs/IMPLEMENTATION_STATUS.md)。

## 技术栈

- 桌面端：Tauri 2
- 前端：Vue 3、TypeScript、Vite、Pinia、Vue Router
- 后端：Rust、Tokio、Reqwest
- 存储：SQLite（Rusqlite）
- 编辑与展示：CodeMirror 6
- 测试：Vitest、Cargo test

## 快速开始

请先安装：

- Node.js 22 或更新的 LTS 版本
- Rust stable（项目使用 Rust 2024 edition，至少需要 Rust 1.85）
- 当前操作系统对应的
  [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)

然后安装依赖并启动桌面应用：

```bash
npm install
npm run desktop:dev
```

仅调试 Web UI 时可运行：

```bash
npm run dev
```

Web 模式不提供 SQLite、原生 HTTP 和其他 Tauri command。

## 常用命令

```bash
npm run typecheck       # 检查所有 TypeScript workspace
npm test                # 运行前端测试
npm run build           # 构建 Web 前端
cargo test --workspace  # 运行 Rust 测试
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
npm run desktop:build   # 构建桌面安装包
```

更完整的开发流程、目录说明和验证清单见
[DEVELOPMENT.md](./DEVELOPMENT.md)。架构决策见
[ARCHITECTURE.md](./ARCHITECTURE.md)，IPC 契约见
[docs/contracts/ipc-v1.md](./docs/contracts/ipc-v1.md)。

## 项目状态

Phase 1–3 的开发目标已落地；下一增量是完整 HTTP 能力。各阶段的实际完成项
以 [docs/IMPLEMENTATION_STATUS.md](./docs/IMPLEMENTATION_STATUS.md) 为准。

## License

MIT
