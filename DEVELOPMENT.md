# Crono 开发指南

本文面向参与 Crono `0.1.x` MVP 开发的贡献者。产品范围与架构原则以
[ARCHITECTURE.md](./ARCHITECTURE.md) 为准，已经交付的能力以
[docs/IMPLEMENTATION_STATUS.md](./docs/IMPLEMENTATION_STATUS.md) 为准。

## 环境准备

需要以下工具：

- Node.js 22 或更新的 LTS 版本与 npm。
- Rust stable；项目采用 Rust 2024 edition，因此最低版本为 Rust 1.85。
- 当前平台对应的
  [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)。

确认环境：

```bash
node --version
npm --version
rustc --version
cargo --version
```

首次安装依赖：

```bash
npm install
```

`package-lock.json` 是仓库的一部分。CI 或需要严格复现依赖时使用
`npm ci`。

## 启动项目

完整桌面开发模式：

```bash
npm run desktop:dev
```

该命令会同时启动 Vite dev server 和 Tauri/Rust 后端。首次编译 Rust
依赖可能耗时较长。

只启动前端：

```bash
npm run dev
```

浏览器模式适合样式和静态交互调试，但无法调用 Tauri command，因此不能完整
验证持久化、请求发送、原生窗口和文件读写。

生产构建：

```bash
npm run build
npm run desktop:build
```

Web 产物位于 `apps/desktop/dist/`；桌面安装产物由 Tauri 输出到 Rust
target 目录。

## 仓库结构

```text
apps/desktop/              Vue 桌面界面
packages/client-core/      Tauri command、模型仓库和前端服务
packages/theme/            框架无关的主题定义与解析
packages/ui/               可复用 Vue UI 组件
crates/crono-models/       Rust 领域模型及生成的 TypeScript bindings
crates/crono-database/     SQLite、migration、hydrate 与模型变更
crates/crono-core/         核心应用逻辑
crates/crono-http/         HTTP 执行、模板、认证与响应落盘
crates-tauri/crono-app/    Tauri commands、事件与应用入口
docs/contracts/            前后端 IPC 契约
```

根目录的 npm workspaces 管理前端包，Cargo workspace 管理 Rust crates。

## 关键数据流

编辑模型时，Pinia store 通过 `client-core` repository 排队写入。需要读取一致
状态的操作（例如切换 Workspace 或发送请求）必须先执行 `flush()`。Rust 端在
事务提交后记录递增 sequence，并发出 `crono:model-write`；其他窗口发现
sequence 缺口时重新 hydrate。

发送请求时：

1. 前端 flush 当前 Request。
2. `http_send` 从 SQLite 读取 Request 和环境继承链。
3. Rust 解析变量、模板与认证，并创建持久化 response。
4. HTTP task 通过事件报告进度和终态。
5. Response metadata、正文文件、history 和 timeline 保存在本地。

新增或修改 command、参数、返回值或 event 时，请同步更新：

- `crates-tauri/crono-app/src/lib.rs`
- `packages/client-core/src/`
- `docs/contracts/ipc-v1.md`
- 相关 Rust/TypeScript 模型与测试

## 数据库与迁移

数据库在应用启动时创建，启用 foreign keys 和 WAL。Migration 必须：

- 只向前追加，不修改已经发布的 migration。
- 在事务内执行，并写入 `schema_migrations`。
- 同时覆盖空库初始化和已有数据库升级。
- 为 cascade、hydrate、重启后持久化及失败路径补充测试。

响应正文不存入 SQLite payload，而是写入应用数据目录下的
`responses/<response-id>/body`。

不要手工编辑 `crates/crono-models/bindings/` 中的生成文件；模型变化后应从
Rust 类型重新生成并一并提交。

## 代码规范

- TypeScript 使用严格类型，UI 文案必须通过 `vue-i18n`。
- Vue 业务组件使用语义主题 token，避免硬编码主题色。
- Rust 格式遵循根目录 `rustfmt.toml`。
- IPC command 使用 snake_case；JavaScript 参数和序列化字段使用 camelCase。
- 错误跨 IPC 时使用稳定错误码，不依赖英文错误文本进行分支判断。
- 异步 event listener 必须在组件或应用 teardown 时释放。
- 修改行为时优先补充最靠近该行为的回归测试。

## 验证

提交前至少运行：

```bash
npm run typecheck
npm test
npm run build
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
```

涉及请求链路时，额外确认：

- Send 前的 pending model write 已 flush。
- 成功、失败、超时和取消都进入终态。
- Response body、history 和 timeline 能在重启后读取。
- 环境父子继承与模板替换符合预期。

涉及 UI 时，至少在明暗主题和中英文下检查；原生窗口行为必须在
`npm run desktop:dev` 中验证。

## 测试位置

- Vue/store/component：`apps/desktop/src/**/*.test.ts`
- Client repository：`packages/client-core/src/**/*.test.ts`
- Theme：`packages/theme/src/**/*.test.ts`
- Rust unit tests：各 crate 的 `src/`
- HTTP 垂直集成测试：`crates/crono-http/tests/vertical_slice.rs`

## Git 工作流

保持提交聚焦，并使用 Conventional Commits 风格：

```text
feat(scope): add capability
fix(scope): correct behavior
docs: update contributor guide
chore: initialize MVP repository
```

当前仓库仍处于 MVP 开发阶段。不要在文档或 UI 中把后续 Phase 的能力标记为
已交付；新增功能后同时更新实施状态与相关契约。

## 常见问题

### 桌面端启动时找不到 WebView 或编译工具

重新核对对应平台的 Tauri prerequisites。Windows 通常需要 WebView2 和
Microsoft C++ Build Tools；macOS 需要 Xcode Command Line Tools；Linux
需要发行版对应的 WebKitGTK 等系统包。

### 端口 1421 已被占用

结束占用该端口的旧 Vite 进程后重新运行 `npm run desktop:dev`。Tauri
配置和 Vite 配置都约定使用 `127.0.0.1:1421`，不要只修改其中一处。

### 浏览器中出现 Tauri command 错误

这是 Web-only 模式的限制。使用 `npm run desktop:dev` 验证数据库、HTTP、
窗口或文件相关功能。
