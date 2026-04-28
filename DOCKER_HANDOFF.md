# Hydro-tibor Docker 开发环境交接文档

## 一、当前状态

当前 `Hydro-tibor` 项目已完成以下阶段 1 目标：

- 本地 Docker Web 开发环境已跑通。
- 当前 Docker Compose 仅包含 `hydro` + `mongo` 两个服务。
- 暂未接入 `hydrojudge`（judge）。
- 当前访问地址：`http://localhost:8888`。
- 当前包管理器链路：Corepack + Yarn 4.9.1。
- MongoDB 数据使用 Docker volume 持久化。
- `node_modules` 使用 Docker volume 缓存。

补充确认：

- `workspace:^` 相关依赖解析问题已解决。
- `.env` 未提交到 GitHub。
- 当前工作区可保持干净（按规范使用 `.env` 本地配置）。

---

## 二、当前文件说明

### `docker-compose.yml`

- 定义本地开发编排。
- 当前仅含两个服务：
  - `mongo`（MongoDB 7）
  - `hydro`（Web 服务）
- `hydro` 设置了：
  - 端口映射：`${HYDRO_HTTP_PORT:-8888}:8888`
  - `restart: "no"`（避免失败后无限重启刷屏）
  - 挂载源码目录到 `/workspace`
  - 挂载命名卷用于数据与依赖缓存

### `docker/Dockerfile.dev`

- 本地开发镜像定义（Node 22 基础镜像）。
- 安装基础工具链（含 `netcat` 等）和 `corepack`。
- 设置工作目录 `/workspace`。
- 入口为 `docker/entrypoint-dev.sh`。

### `docker/entrypoint-dev.sh`

- 容器启动前初始化脚本，职责包括：
  - 等待 MongoDB 端口可用；
  - 准备 `~/.hydro/config.json` / `addon.json`；
  - 使用 Corepack 激活 Yarn（优先读 `packageManager`，缺失时默认 4.9.1）；
  - 依赖安装前输出诊断信息（node/yarn 版本、安装状态文件等）；
  - 按状态文件 + 配置哈希判断是否需要重新 `yarn install`；
  - 依赖安装命令固定为：`corepack yarn install --inline-builds`；
  - 为 Docker 端口映射自动确保 `server.host=0.0.0.0`（可通过环境变量关闭）。

### `.env.example`

- 本地配置模板。
- 提供端口、Mongo 连接、插件列表、Yarn 行为开关等示例变量。
- 用于复制生成本地 `.env`。

### `.dockerignore`

- 减少 Docker build context 体积，加快构建。
- 避免把无关文件（如本地依赖缓存、日志）送入镜像构建上下文。

### `.gitignore`

- 增加了 `.env` 忽略规则，避免本地敏感或环境专属配置被提交。

### `package.json`（新增 scripts）

- 新增：
  - `docker:dev` -> `docker compose up --build`
  - `docker:down` -> `docker compose down`
- 未修改业务依赖、workspace 定义、业务脚本逻辑。

### `README.md`（新增 Docker 开发说明）

- 增补了 Docker 本地开发相关文档：
  - 运行方式；
  - Yarn/Workspace 相关排障；
  - Link step 观察方式；
  - 卷清理与重装建议。

---

## 三、本地启动流程

### 第一次启动（前台）

```bash
cd ~/Desktop/hydro-tibor
cp .env.example .env
docker compose up --build
```

### 后台启动

```bash
docker compose up -d --build
```

### 停止

```bash
docker compose down
```

### 查看日志

```bash
docker compose logs -f hydro
docker compose logs -f mongo
```

---

## 四、依赖安装说明

### 1) 包管理器策略

- 使用：Corepack + Yarn 4.9.1（Yarn Berry）。
- 不使用：Yarn 1.22.22。

### 2) 过去 `workspace:^` 报错的原因

历史报错 `Couldn't find any versions for "@hydrooj/xxx" that matches "workspace:^"` 的根因通常是：

- 实际执行到了 Yarn 1（不正确处理该 workspace 协议场景）；
- 导致把本地 workspace 依赖误当成远端 npm 包查找。

### 3) 现在为什么不会再出现

- 启动链路固定走 `corepack`；
- 启动时显式 `corepack prepare yarn@4.9.1 --activate`（或读 `packageManager`）；
- 安装命令固定为 `corepack yarn install --inline-builds`。

### 4) Link step 很久时如何判断是否卡住

先看容器资源是否还在变化：

```bash
docker stats
```

若 CPU/IO 持续有波动且日志仍有输出，通常是正常构建/链接中。  
若长时间日志完全不动且 CPU 接近 0，再考虑中断后排查（例如单独安装命令、卷状态检查）。

### 5) 单独安装依赖（推荐排障方式）

```bash
docker compose run --rm --entrypoint sh hydro -lc "corepack enable && corepack prepare yarn@4.9.1 --activate && corepack yarn install --inline-builds"
```

---

## 五、环境变量说明

以 `.env.example` 为准，关键变量如下：

- `HYDRO_HTTP_PORT`  
  宿主机访问端口，默认 `8888`。

- `HYDRO_MONGODB_URL`  
  Hydro 连接 MongoDB 的 URI，默认 `mongodb://mongo:27017/hydro`。

- `HYDRO_ADDONS_JSON`  
  启用的插件列表（JSON 字符串），例如 `["@hydrooj/ui-default"]`。

- `YARN_ENABLE_INLINE_BUILDS`  
  建议设为 `1`，让安装时构建输出更实时，便于观察是否卡住。

- `HYDRO_SKIP_YARN_INSTALL`  
  设为 `1` 可跳过安装（仅在确认依赖已经完整安装时使用）。

- `HYDRO_SET_SERVER_HOST`  
  默认开启（`1`），用于在 Docker 环境确保 `server.host=0.0.0.0`，保证宿主机端口映射可访问。

> 重要：`.env` 仅用于本地环境，**禁止提交到 GitHub**。

---

## 六、数据卷说明

当前使用 Docker 命名卷持久化/缓存数据，包含：

- MongoDB 数据
- Hydro home（配置目录）
- uploads（文件存储目录）
- `node_modules`（依赖缓存）

### 数据保留行为

- `docker compose down`：不会删除命名卷，数据保留。
- `docker compose down -v`：会删除命名卷（慎用）。

---

## 七、常见问题排查

### 1) `localhost:8888` 打不开

- 先看容器状态：`docker compose ps`
- 看 Hydro 日志：`docker compose logs -f hydro`
- 确认端口未占用，且 `HYDRO_HTTP_PORT` 配置正确。

### 2) Yarn 变成 1.22.22

- 检查日志中实际版本输出；
- 确认命令是否经过 `corepack`；
- 必要时手动执行 `corepack enable && corepack prepare yarn@4.9.1 --activate`。

### 3) `workspace:^` 找不到 `@hydrooj/*`

- 通常是 Yarn 版本链路错误（回到了 Yarn 1）；
- 按“单独安装依赖命令”重跑并确认 Yarn 4.9.1。

### 4) Link step 很久

- 先用 `docker stats` 看资源是否在变化；
- 先跑一次“单独安装依赖命令”确认是否可完成；
- 避免误判：有时只是 native build 较慢。

### 5) MongoDB 不健康

- 查看 `mongo` 日志：`docker compose logs -f mongo`
- 检查 healthcheck 是否持续失败；
- 检查本机资源是否不足。

### 6) `.env` 误提交风险

- `.env` 已在 `.gitignore` 中；
- 提交前始终执行 `git status --short` 二次确认。

### 7) 端口 8888 被占用

- 修改 `.env` 中 `HYDRO_HTTP_PORT`（例如改为 18888）；
- 重启 compose 生效。

---

## 八、当前限制

当前阶段明确限制如下：

- 当前尚未接入 `hydrojudge`。
- 当前不能保证提交代码后可进行真实评测。
- 当前仅验证了 Web + MongoDB。
- 后续接 judge 需要单独开展“阶段 2”。
- judge 涉及 `privileged`、资源限制、编译运行环境，不能直接随意加到当前编排。

---

## 九、服务器部署预案（仅预案，不执行）

未来服务器部署建议流程（示意）：

```bash
cd /www/hydro-tibor
git pull
docker compose up -d --build
```

建议域名：`oj.classflow.top`

建议端口策略：

- Hydro 容器仅对宿主机暴露 `127.0.0.1:8888`
- 使用 Nginx/Caddy 反向代理到 `127.0.0.1:8888`

隔离原则（必须保持）：

- 不影响 ClassFlow；
- ClassFlow 继续保持裸机部署；
- Hydro 使用 Docker 隔离；
- 两个项目目录分开；
- 两个项目端口分开；
- 两个项目数据库分开；
- 两个项目 GitHub deploy key 分开。

---

## 十、下一阶段建议（仅计划，不执行）

阶段 2 建议主题：接入 `hydrojudge`。

建议先做计划与验证清单：

- judge 容器权限模型（`privileged`、隔离策略）
- 评测语言环境与编译工具链
- 资源限制（CPU/内存/并发/超时）
- 与 Web 容器的数据与网络联通方式
- 本地验证流程与服务器灰度方案

当前阶段不执行 judge 接入，仅保留计划。

