# Hydro-tibor hydrojudge 接入方案

## 一、当前结论

- 当前尚未接入 judge。
- 当前只完成 Web + MongoDB。
- 本文只是方案，不执行改造。
- 本轮不修改现有 Docker 运行逻辑，不修改业务代码，不启动 judge 容器。

## 二、仓库现有 Docker / Judge 结构调研

本仓库已存在官方/历史 Docker 与 Judge 相关目录与文件，核心包括：

- `install/docker/docker-compose.yml`
- `install/docker/backend/Dockerfile`
- `install/docker/backend/entrypoint.sh`
- `install/docker/judge/Dockerfile`
- `install/docker/judge/entrypoint.sh`
- `install/docker/judge/judge.yaml`
- `install/docker/judge/mount.yaml`
- `install/docker/README.md`
- `install/helm-single/templates/judge.deployment.yaml`
- `install/helm-single/templates/judge.config.yaml`
- `install/helm-single/values.yaml`
- `packages/hydrojudge/bin/hydrojudge.js`（judge 包入口）

调研到的关键事实：

- `install/docker/docker-compose.yml` 官方示例已包含 `oj-mongo`、`oj-backend`、`oj-judge` 三服务。
- `oj-judge` 在官方 compose 中明确 `privileged: true`。
- `oj-judge` 通过 `judge.yaml` 中 `server_url: http://oj-backend:8888/` 与后端通信。
- `judge` 容器会启动两类进程：`sandbox` + `hydrojudge`（见 `install/docker/judge/entrypoint.sh`）。
- `judge` 镜像安装了多语言编译工具链（gcc/python3/g++/java/php/rust/ghc/go/ruby/mono 等）。

## 三、官方/现有部署方式分析

### 1) install/docker 方案

官方 compose 的组织方式是：

- `oj-mongo`：MongoDB，数据持久化到 `./data/mongo`
- `oj-backend`：Hydro Web/Backend，挂载：
  - `./data/file:/data/file`
  - `./data/backend:/root/.hydro`
- `oj-judge`：评测机，挂载：
  - `./judge/judge.yaml:/root/.hydro/judge.yaml`
  - `./judge/mount.yaml:/root/.hydro/mount.yaml`
  - 且 `privileged: true`

特点：

- 简单直接，适合单机快速部署；
- 默认是“同 compose 里同时起 backend + judge”；
- 对容器资源限制未在 compose 中直接声明；
- `install/docker/README.md` 明确该安装模块“非官方维护、要求较强 Docker 运维能力”。

### 2) Helm 示例（k8s）

`install/helm-single` 中也保留了 judge 部署模板，且同样体现：

- judge 需要特权运行（模板里 `privileged: true`）；
- judge 通过内网访问 backend service；
- 使用 hostPath 示例挂载（便于调试，不是强生产标准）；
- 文档提示建议把 Backend 与 Judge 调度到不同节点，说明资源争抢/隔离是现实问题。

结论：仓库已有“judge 必须独立评测进程 + 特权 + 与 backend 通信 + 明确配置文件”的成熟实践，不建议从零自创模式。

## 四、judge 服务需要什么

基于仓库现有配置，judge 接入至少需要：

- **镜像或构建来源**
  - 可用 `install/docker/judge/Dockerfile` 构建；
  - 镜像内包含 `@hydrooj/hydrojudge`、`pm2`、`go-judge/sandbox`、多语言编译工具链。

- **运行命令**
  - 入口脚本启动：
    - `pm2 start sandbox -- -mount-conf /root/.hydro/mount.yaml`
    - `pm2-runtime start hydrojudge`

- **必要配置文件**
  - `judge.yaml`：包含 `server_url`、judge 用户名密码、detail 等；
  - `mount.yaml`：sandbox 挂载策略、tmpfs、大量只读系统路径绑定。
  - `judge.yaml` 可能包含敏感信息（judge 账号、密码、内部地址等），后续实现时禁止把真实 `judge.yaml` 直接提交到 GitHub。
  - 建议提交 `judge.yaml.example`，并通过环境变量或 entrypoint 在运行时生成真实配置。
  - 真实 judge 凭据仅允许存放在本地 `.env` 或服务器私有配置（如密钥管理/私有配置文件）中。

- **必要 volume**
  - 至少需要把 `judge.yaml` / `mount.yaml` 提供给容器；
  - 生产建议将 judge 配置卷与 backend/mongo 数据卷分离。

- **网络连接方式**
  - judge 通过容器内网访问 backend（例如 `http://oj-backend:8888/`）。

- **权限**
  - 需要 `privileged: true`（仓库现有 docker 与 helm 均如此）。

- **编译工具链**
  - judge 镜像需要编译执行多语言环境，不建议在 Web 容器里混装。

- **资源限制（建议）**
  - CPU、内存、PIDs、磁盘写入、日志尺寸等应明确限制；
  - 否则容易在高并发编译/评测时抢占整机资源。

## 五、本地开发接入方案

### 建议

- 不建议直接把 judge 永久并入当前 `docker-compose.yml`（当前它是 Web+Mongo 的稳定开发底座）。
- 推荐新增一个叠加文件：`docker-compose.judge.yml`，只定义 judge 服务（复用主 compose 的网络与 backend 服务名）。
- 或者使用 Compose `profiles`（如 `profile: ["judge"]`），但考虑可维护性与职责分离，叠加文件更清晰。

### 推荐命令形态（方案）

- Web 开发（不含 judge）：
  - `docker compose up -d --build`
- 带 judge 的本地联调（叠加）：
  - `docker compose -f docker-compose.yml -f docker-compose.judge.yml up -d --build`

### 如何验证“能评测”（方案）

1. Web 可访问、Mongo healthy；
2. 后台显示 judge 在线；
3. 创建最小 A+B 题；
4. 提交代码，观察评测队列与结果（AC/WA）；
5. 停止 judge 后，Web 仍可正常访问（验证解耦）。

## 六、服务器部署接入方案

结合“ClassFlow 同机、Hydro 容器化、资源有限”的现状，建议：

- **目录隔离**
  - `ClassFlow` 保持原目录；
  - Hydro 单独目录（如 `/www/hydro-tibor`）。

- **端口隔离**
  - Hydro 仅监听内网/回环端口（如 `127.0.0.1:8888`）；
  - ClassFlow 继续使用既有端口，不重叠。

- **数据库隔离**
  - Hydro Mongo 单独容器与单独 volume；
  - 不与 ClassFlow 共用数据库实例或库名。

- **volume 隔离**
  - mongo/backend/uploads/judge 分开命名卷；
  - 避免误删和互相污染。

- **资源隔离**
  - judge 增加 CPU/内存/PIDs/日志限制；
  - 如条件允许，将 judge 放到单独机器或至少单独 cgroup 约束。

- **反向代理**
  - Nginx/Caddy 仅代理到 Hydro Web；
  - 可使用域名 `oj.classflow.top`，但与 ClassFlow 路由严格隔离。

- **不影响 ClassFlow 的原则**
  - 项目目录、端口、数据库、deploy key 全分离；
  - judge 不与 ClassFlow 共享运行时资源上限。
  - 禁止在 ClassFlow 同机生产环境做首次 judge 联调验证。
  - 必须先在本地完成验证，再到服务器测试环境/灰度环境验证。
  - 仅在确认资源限制（CPU/内存/PIDs/日志）有效后，才评估接入正式 `oj.classflow.top`。

## 七、风险点

- **privileged 风险**：judge 需要高权限，容器突破面增大。
- **CPU 被编译占满**：并发编译可能拖慢同机业务（包括 ClassFlow）。
- **内存被评测占满**：大样例/异常提交可造成内存压力。
- **磁盘被提交/日志占满**：评测临时文件、日志滚动不当会爆盘。
- **恶意代码评测风险**：沙箱策略若配置不当有逃逸或滥用风险。
- **Docker volume 误删风险**：`down -v` 误操作可导致数据不可逆丢失。
- **同机资源争抢**：Hydro judge 与 ClassFlow 裸机服务可能互相抢资源。

## 八、推荐的阶段 2 实施步骤

- **Step 1：只读调研**  
  收集仓库现有 judge 配置、运行条件、风险点（本轮已完成）。

- **Step 2：新增 judge compose 文件**  
  新建 `docker-compose.judge.yml`（不改现有主 compose 的稳定链路）。

- **Step 3：本地验证 judge 启动**  
  仅验证 judge 容器能连上 backend 并在线。

- **Step 4：创建测试题**  
  创建最小 A+B 测试题，确保流程可观测。

- **Step 5：提交代码验证真实评测**  
  验证 AC/WA/编译错误等状态流转。

- **Step 6：增加资源限制**  
  给 judge 加 CPU/内存/PIDs/日志上限并压测观察。

- **Step 7：写运行文档**  
  输出本地与服务器运维手册、故障排查手册。

- **Step 8：再考虑服务器部署**  
  在不影响 ClassFlow 的前提下灰度上线。

## 九、验收标准

判定“阶段 2 接入成功”的标准：

- `docker compose` 能启动 web + mongo + judge；
- Web 正常访问；
- judge 在线；
- 创建 A+B 测试题成功；
- 提交代码可返回 AC / WA；
- 停止 judge 不影响 Web；
- 增加 CPU / 内存限制后机器不卡顿；
- 对同机 ClassFlow 无明显影响。

## 十、下一步 Cursor 执行建议

### 下一轮可以改的文件（建议）

- `docker-compose.judge.yml`（新文件）
- `.env.example`（补 judge 相关变量说明）
- `README.md` 或新增 `JUDGE_RUNBOOK.md`（仅文档）

### 下一轮不能改的文件（约束）

- `packages/*`
- `framework/*`
- `modules/*`
- `plugins/*`
- `build/*`
- `install/*`（作为参考，不直接改官方样例）

### 可以执行的命令（建议）

- `docker compose ps`
- `docker compose logs -f hydro`
- `docker compose logs -f mongo`
- `docker compose -f docker-compose.yml -f docker-compose.judge.yml up -d --build`
- `docker stats`

### 不建议执行的危险命令

- `docker compose down -v`（会删卷）
- `docker system prune -a --volumes`（高风险清理）
- 任何会影响 ClassFlow 现网进程的停机/清理命令
- 未评估前直接在生产启用 privileged judge

