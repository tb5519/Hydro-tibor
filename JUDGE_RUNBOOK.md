# Hydro-tibor Judge 本地运行手册

## 一、当前状态

- judge 是可选叠加服务。
- 默认 `docker compose up` 仅启动 Web + Mongo，不启动 judge。
- 启用 judge 需要叠加 `docker-compose.judge.yml`。
- 当前已验证 judge 容器可启动并连接 Hydro。
- 当前已验证 judge 认证成功。
- 当前已观察到评测执行日志。
- A+B 正确代码 AC / 错误代码 WA 仍需人工在 Web 页面完成最终验证。

## 二、首次配置

1. 复制示例配置为本地真实配置（该文件包含敏感信息，不可提交）：

```bash
cp docker/judge/judge.yaml.example docker/judge/judge.yaml
```

2. 编辑 `docker/judge/judge.yaml`，填写本地 judge 用户名/密码。
   - `server_url` 本地应为 `http://hydro:8888/`
   - 用户名/密码必须与 Hydro 内 judge 账号一致

3. 为什么真实 `judge.yaml` 不提交：
   - 可能包含账号、密码、内部地址等敏感信息；
   - 仓库只保留 `judge.yaml.example`；
   - 真实配置仅保留在本地或服务器私有配置中。

## 三、启动命令

Web + Mongo：

```bash
docker compose up -d --build
```

Web + Mongo + Judge：

```bash
docker compose -f docker-compose.yml -f docker-compose.judge.yml up -d --build
```

## 四、停止命令

只停 judge：

```bash
docker compose -f docker-compose.yml -f docker-compose.judge.yml stop judge
```

停全部但保留数据：

```bash
docker compose down
```

## 五、日志排查

```bash
docker compose logs -f hydro
docker compose logs -f mongo
docker compose -f docker-compose.yml -f docker-compose.judge.yml logs -f judge
docker stats
```

## 六、常见问题

1. judge 起不来
   - 检查 `docker/judge/judge.yaml` 是否存在；
   - 检查 `docker/judge/mount.yaml` 是否存在；
   - 检查 `docker compose ... logs judge` 是否有配置错误。

2. judge 认证失败
   - `judge.yaml` 的 `uname/password` 与 Hydro 中 judge 账号不一致；
   - 先确认 Web 初始化流程是否创建了 judge 用户；
   - 若日志出现 `User {0} not found` / `cannot POST /login (404)`，本质是 `judge.yaml` 中的用户名在 Hydro 数据库中不存在。
   - 可用官方 CLI（来源：`install/docker/backend/entrypoint.sh`）在本地容器创建：

```bash
docker compose exec hydro sh -lc "corepack yarn hydrooj cli user create systemjudge@systemjudge.local judge <LOCAL_PASSWORD> 2"
docker compose exec hydro sh -lc "corepack yarn hydrooj cli user setJudge 2"
```

然后把本地 `docker/judge/judge.yaml` 的用户名和密码改成一致值（该文件不提交）。

3. judge 连接不到 hydro
   - `server_url` 必须用容器服务名地址：`http://hydro:8888/`；
   - 不要填 `localhost:8888`（judge 容器内的 localhost 不是 hydro 服务）。

4. judge 实际读取哪个配置文件
   - 由 `docker-compose.judge.yml` 挂载决定：
   - `./docker/judge/judge.yaml -> /root/.hydro/judge.yaml`
   - `./docker/judge/mount.yaml -> /root/.hydro/mount.yaml`
   - 请始终编辑本地 `docker/judge/judge.yaml`（真实配置），不要改 `judge.yaml.example` 的占位值。
5. `server_url` 配错
   - 常见现象：日志持续重试连接、401/404。

6. privileged 风险
   - judge 依赖 `privileged` 才能运行 sandbox；
   - 仅在受控环境下启用，避免直接在生产首测。

7. Mac arm64 下官方 amd64v3 sandbox 不兼容
   - 现象：日志出现 `This program can only be run on AMD64 processors with v3 microarchitecture support.`；
   - 原因：官方参考 Dockerfile 固定下载 `linux_amd64v3` 的 sandbox；
   - 本项目本地方案：`docker/judge/Dockerfile.dev` 按 `TARGETARCH` 选择下载：
     - `amd64 -> linux_amd64v3`
     - `arm64 -> linux_arm64`
   - 若仍失败，先用 `docker compose ... logs judge` 确认实际下载与运行的 sandbox 架构。

8. 资源占用过高
   - 通过 `HYDRO_JUDGE_CPUS` / `HYDRO_JUDGE_MEM_LIMIT` / `HYDRO_JUDGE_PIDS_LIMIT` 收敛；
   - 用 `docker stats` 观察是否挤占宿主机资源。

9. 提交后一直 Pending
   - judge 可能未在线或认证失败；
   - 检查 judge 日志是否成功连接到 backend。

10. Web 正常但 judge 不在线
   - 优先排查 `judge.yaml` 凭据、`server_url`、privileged 权限。

11. 不要执行 `down -v`
   - 会删除卷，可能导致 Mongo/依赖缓存数据丢失。

## 六点五、如何判断 judge 已连上 hydro

满足以下日志特征，可判定连接成功：

- 出现 `正在连接 http://hydro:8888/judge/conn`
- 随后出现 `[localhost] 已连接`
- 可以看到 `Submission:` 与 `End:` 日志
- sandbox 日志有 `/run`、`/version`、`/config` 返回 200

如果仍是认证失败，会持续看到 `cannot POST /login` 与 `User {0} not found`。

## 最小 A+B 评测验证

1. 验证目的
   - 确认本地链路 `Web -> Hydro -> Judge -> Sandbox` 可完成一次真实判题闭环。

2. 前置条件
   - `hydro` 服务可访问（`http://localhost:8888`）；
   - `mongo` 状态为 healthy；
   - judge 日志出现 `正在连接 http://hydro:8888/judge/conn` 与 `[localhost] 已连接`；
   - 已完成本地 judge 账号配置（仅本地 `docker/judge/judge.yaml`，不提交）。

3. A+B 题目配置（Web 后台）
   - 题目名：`A+B Test`
   - 题意：输入两个整数 `a` 和 `b`，输出 `a+b`
   - 最小测试数据：
     - 输入：`1 2`
     - 输出：`3`
   - 时间/内存限制保持默认即可（用于最小验证）。

4. 正确代码预期结果
   - 提交一份正确代码（例如 Python）：

```python
a, b = map(int, input().split())
print(a + b)
```

   - 预期：`AC` 或 `score 100`。

5. 错误代码预期结果
   - 提交一份故意错误代码：

```python
a, b = map(int, input().split())
print(4)
```

   - 预期：`WA` 或任意非 AC 结果（score < 100）。

6. 如何查看 judge 日志

```bash
docker compose -f docker-compose.yml -f docker-compose.judge.yml logs -f judge
```

   - 正常信号：`Submission:`、`End:`、`/run` 返回 200。
   - 可将对应 `Submission` 与 `End` 片段记录到验收报告。

7. 如果一直 Pending 怎么排查
   - 确认 judge 是否在线：`docker compose ... ps`
   - 检查日志是否持续重试连接或认证失败（`cannot POST /login`、`User {0} not found`）
   - 校验 `server_url` 是否为 `http://hydro:8888/`（不要写 `localhost`）
   - 确认 `docker/judge/judge.yaml` 用户名密码与 Hydro 本地账号一致
   - 确认 sandbox 存活并可处理 `/run` 请求。

8. 如果 judge 不在线怎么排查
   - 检查容器状态与退出原因：

```bash
docker compose -f docker-compose.yml -f docker-compose.judge.yml ps
docker compose -f docker-compose.yml -f docker-compose.judge.yml logs --tail=200 judge
```

   - 若为配置问题，先修正本地 `docker/judge/judge.yaml` 后重启 judge；
   - 若为架构问题，复核 `docker/judge/Dockerfile.dev` 与当前平台匹配；
   - 若为资源问题，调低并复核 `HYDRO_JUDGE_CPUS` / `HYDRO_JUDGE_MEM_LIMIT` / `HYDRO_JUDGE_PIDS_LIMIT`。

9. 最终验收记录（阶段 2B/2C）
   - 之前出现“正确代码 0 分”的原因：该次提交语言误选为 `bash`；
   - 该问题不是 Python 运行环境缺失，也不是 judge 链路故障；
   - Python 正确语言下的最终验收结果如下：
     - AC 提交 ID：`69f09f391022913a2e53daf2`，语言：`py.py3`，结果：`status 1`，`score 100`
     - AC 再次提交 ID：`69f09f851022913a2e53db0d`，语言：`py.py3`，结果：`status 1`，`score 100`
     - WA 提交 ID：`69f09fa41022913a2e53db1d`，语言：`py.py3`，结果：`status 2`，`score 0`，日志要点：`Read 4, expect 2/3`

10. 操作提醒
   - 提交 Python 代码时必须选择 `Python 3 / py.py3`；
   - 不要把 `bash` 语言记录误认为 Python 评测失败；
   - 查看结果时请按提交 ID 精确核对。

11. 本地链路结论
   - 本地 judge 已完成构建、启动、认证、连接 Hydro；
   - 已完成 A+B 正确代码 AC 验证；
   - 已完成 A+B 错误代码 WA 验证；
   - 本地最小评测链路通过。

## 七、资源限制说明

`docker-compose.judge.yml` 已提供以下可调项（通过 `.env` 覆盖）：

- `HYDRO_JUDGE_CPUS`（默认 2）
- `HYDRO_JUDGE_MEM_LIMIT`（默认 2g）
- `HYDRO_JUDGE_PIDS_LIMIT`（默认 512）
- `HYDRO_JUDGE_LOG_MAX_SIZE`（默认 10m）
- `HYDRO_JUDGE_LOG_MAX_FILE`（默认 3）

说明：

- 这些限制用于降低 judge 对宿主机冲击；
- 在不同 Docker/Compose 版本下，字段生效方式可能有差异，建议用 `docker inspect` 与压测结果复核。

## 八、和 ClassFlow 同机部署注意事项

- 本地验证通过 != 可直接上生产。
- 本地 arm64 成功不代表 x86_64 服务器行为完全一致，生产前必须在目标服务器架构复核 judge。
- 服务器必须先做好资源限制，再进行 judge 联调。
- 不允许首次在正式 ClassFlow 同机环境直接测试 judge。
- 先测试环境/灰度验证，确认稳定后再考虑正式域名 `oj.classflow.top`。
- ClassFlow 与 Hydro 的目录、端口、数据库、deploy key、资源限制必须隔离。
