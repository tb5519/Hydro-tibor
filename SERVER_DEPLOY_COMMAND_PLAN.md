# Hydro-tibor 正式部署命令规划

## 一、当前阶段说明

- 本文**只规划**正式部署相关命令与顺序，**不替代**生产环境实际操作手册中的密钥与路径细节。
- **当前不执行部署**：不在此文档编写时于任何环境执行 `clone`、`docker compose up`、导入数据等。
- **当前不连接服务器**：所有命令均为**草案**，供阶段 5K 及以后在服务器上按流程执行。
- **当前不导入旧数据**：空系统冒烟通过前，不进行 Mongo restore、`/data/file/hydro` 恢复等。
- **当前不修改 ClassFlow**：不改变 ClassFlow 目录、端口 **5050**、Gunicorn 配置与宝塔既有站点。
- **当前目标**：形成**上线前可执行方案**（目录、端口、Compose、反代、验证、禁忌），并与 `PRODUCTION_MIGRATION_RUNBOOK.md`、`SERVER_PRE_MIGRATION_INSPECTION.md` 对齐。

## 二、服务器部署结论

- 服务器**可以小规模部署** Hydro-tibor（与阶段 5I 结论一致）。
- **2 GB 内存偏紧**，但可先按保守策略试跑；上线后必须监控 `available` 与 Swap。
- **优先保护 ClassFlow**（同机资源争用风险）。
- **Judge 并发固定为 1**；**不做比赛高并发**。
- **先部署空系统**，冒烟与反代验证通过后，**再进入数据迁移阶段**（见第十节）。

## 三、推荐部署目录

**推荐根目录**：`/www/hydro-tibor`

**说明**：

- **不要**将 Hydro 放入 `/www/wwwroot/classflow` 或与 ClassFlow 项目混放。
- 与 ClassFlow **完全隔离**，降低误操作与权限干扰风险。
- 后续 **Docker volume**、**备份路径**、**日志与 compose 文件**均建议围绕该目录规划（具体子目录在 5K 执行时可再定，如 `data/`、`logs/` 等）。

## 四、端口规划

| 用途 | 规划 |
|------|------|
| **Hydro Web（宿主机）** | 监听 **`127.0.0.1:8888`**（仅本机，不对公网直连开放） |
| **Mongo** | **仅在 Docker 网络内**访问；**不**将 **27017** 暴露到公网 |
| **Judge** | **不暴露** Judge 服务端口；由 Hydro 内网调用 |
| **Nginx** | **80 / 443** 由现有宝塔 Nginx 占用；通过**反代**将 OJ 域名流量转发至 **`127.0.0.1:8888`** |
| **ClassFlow** | 继续使用 **5050**；**不改动** |

## 五、Docker Compose 生产策略

- **Web + Mongo + Judge** 均通过 **Docker** 管理（具体 service 名以仓库 `docker-compose.yml` 或生产 overlay 为准）。
- **Judge 并发固定为 1**（与资源策略一致）。
- **禁止**将 `docker compose down -v` 作为常规或迁移操作（**`-v` 删除卷**）。
- **Volume 必须纳入备份**策略（与正式迁移 runbook 一致）。
- **`.env` 不提交 Git**；仅存在于服务器或私有密钥管理。
- **`docker/judge/judge.yaml` 不提交 Git**（含敏感或环境相关配置时尤其如此）。
- **`HYDRO_ADDONS_JSON` 必须包含**（容器内路径以挂载一致为准，示例）：

```json
["@hydrooj/ui-default","/workspace/addons/badge-for-hydrooj"]
```

- **不得**漏掉 `@hydrooj/ui-default`，否则可能出现异常响应形态（如非预期 JSON 等）。

## 六、正式部署步骤草案

> **以下均为草案，不在本文档执行时运行。** 路径、分支、compose 文件名以仓库与现场为准；**将 `<...>` 替换为真实值**；**不要把密码写入 Git**。

**Step 1：进入部署父目录**

```bash
sudo mkdir -p /www/hydro-tibor
sudo chown "<DEPLOY_USER>:<DEPLOY_GROUP>" /www/hydro-tibor
cd /www/hydro-tibor
```

**Step 2：Clone 仓库**

```bash
git clone "<REPO_SSH_OR_HTTPS_URL>" hydro-tibor-src
cd hydro-tibor-src
```

**Step 3：切换 `master`（或约定的发布 tag）**

```bash
git fetch origin
git checkout master
git pull --ff-only origin master
```

**Step 4：创建 `.env`（仅服务器本地，不进 Git）**

```bash
# 在仓库根或 compose 约定路径创建 .env
# 填入 HYDRO_MONGODB_URL、HYDRO_ADDONS_JSON、HYDRO_HTTP_PORT 等
# 示例（勿照抄密码）：
# HYDRO_MONGODB_URL=mongodb://mongo:27017/hydro
# HYDRO_ADDONS_JSON=["@hydrooj/ui-default","/workspace/addons/badge-for-hydrooj"]
# HYDRO_HTTP_PORT=8888
```

**Step 5：创建 `docker/judge/judge.yaml`（仅服务器本地，不进 Git）**

```bash
# 按 Hydro 官方文档与现场 judge 用户配置填写
# 文件权限建议限制为部署用户只读
```

**Step 6：启动 Web + Mongo（暂不启 judge 或按 compose 分步启）**

```bash
# 若 compose 拆分 profile，可只起 web+mongo；以下为示意
docker compose up -d --build
# 或 docker compose up -d mongo hydro
```

**Step 7：确认空系统访问正常**

```bash
docker compose ps
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/
# 期望 200；响应体应为 HTML（DOCTYPE html）
```

**Step 8：启动 Judge（在 Web 正常后）**

```bash
# 视 compose 服务名为 judge
docker compose up -d judge
```

**Step 9：确认 Judge 连接**

- Hydro 管理端或日志中确认 judge 注册/心跳；提交一次**沙箱题目**或内置题验证 Pending → 判题结束。

**Step 10：再进入数据迁移阶段**

- 仅当空系统、反代、badge、judge 均验证通过后，执行 `PRODUCTION_MIGRATION_RUNBOOK.md` 中的 Mongo 与文件体步骤。

## 七、Nginx 反代策略

- 当前服务器 **Nginx 由宝塔管理**；`systemctl status nginx` 可能与实际进程形态不一致。
- **不建议**随意 **`systemctl restart nginx`**；变更应通过**宝塔站点配置**或既定变更窗口，并准备回滚。
- **推荐**：在宝塔中为 OJ 域名新增/编辑站点，**反代**到 **`http://127.0.0.1:8888`**（或等价回环地址）。
- **域名**：可使用 **`oj.classflow.top`** 或后续业务确认的 OJ 专用域名；**勿**影响 ClassFlow 现有站点与 **5050** 反代规则。
- **TLS**：在宝塔中配置证书（Let's Encrypt 或已有证书），**443** 终止于 Nginx，后端回源仍指向本机 8888。

## 八、上线前验证清单

部署空系统后逐项确认（命令与路径可按现场调整）：

- [ ] `docker compose ps`：相关容器 **Up**，无反复重启。
- [ ] `curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/` → **200**。
- [ ] 首页为 **HTML**（含 `<!DOCTYPE html>`），**不是**异常 JSON 裸响应。
- [ ] `/p`、**`/p/P1001`**（或等价测试题）、`/ranking` 等核心路径 **200**。
- [ ] **`/mybadge`** 路由存在（未登录可为 302，**不应**长期 500）。
- [ ] **badge 插件**：`docker compose logs hydro | grep -i badge-for-hydrooj` 等可见加载/初始化日志（具体 grep 模式见运维习惯）。
- [ ] **Judge 已连接**且可完成一次判题。
- [ ] **无 500**（核心路径与日志抽样）。
- [ ] **ClassFlow** 站点与 **5050** 业务与迁移前一致、无明显变慢。

## 九、资源限制建议

- **Judge 并发**：**1**。
- **Judge 内存**：初期建议容器上限约 **512 MB**（以 `deploy.resources.limits` 或 compose 等价字段配置，具体以 Docker 版本语法为准）；观察后再调。
- **CPU**：不追求高并发判题；以稳定为主。
- **若 `available` 内存长期低于 300 MB**：优先升级到 **4 GB** 内存。
- **若磁盘剩余低于 10 GB**：优先扩容至约 **80 GB** 或迁移部分冷数据。

## 十、正式数据迁移接入点

**仅在**空系统部署与第八节验证**全部通过后**，才进行：

- **Mongo restore**（按 `PRODUCTION_MIGRATION_RUNBOOK.md` 第八章，含校验与是否 `--drop` 决策）。
- **`/data/file/hydro` 恢复**（按 Runbook 第九章；**禁止**只导 Mongo 不恢复文件体）。
- **static / 附件相关**资源按 Runbook 与现场清单恢复。
- **Judge 用户**与 `judge.yaml` **校准**（uid 以**正式库**为准，**不**沿用演练机随意 uid）。
- **P1001（或等价题）AC / WA** 复验。

## 十一、禁止事项

- **不允许**直接覆盖或混入 **ClassFlow** 项目目录。
- **不允许** `docker compose down -v`（删卷风险）。
- **不允许** `docker system prune` 等在未备份 volume 前的危险清理。
- **不允许**将 **`.env`**、**`judge.yaml`** 等敏感文件**提交 Git**。
- **不允许只导 Mongo、不恢复 `/data/file/hydro`**。
- **不允许**未通过空系统验证就**导入旧数据**或切换生产流量。
- **不允许**在 **ClassFlow 高峰期**做数据迁移或大变更。

## 十二、下一阶段建议

**阶段 5K：正式服务器空系统部署**

目标建议：

- 在 **`/www/hydro-tibor`** 完成仓库 clone 与 **空** Hydro-tibor（Web + Mongo）启动。
- **不导入旧数据**直至验证通过。
- 先验证 **Web + Mongo + badge 插件 + judge（并发 1）**。
- 确认 **ClassFlow** 不受影响后，再排期数据迁移（阶段 5L 或按 Runbook 编号延续）。

---

*本文不含真实密码、Token、私钥；执行阶段请将占位符替换为现场值，敏感内容仅存服务器侧。*
